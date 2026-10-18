#!/usr/bin/env python3
"""
DocuMind RAG eval: retrieval + answer quality on a fixed corpus.

The eval builds its own index from eval/corpus.json in eval/.work/ (never
touching data/), runs every question in eval/eval_set.json through the real
retrieval and answer code, and scores it without an LLM judge:

  Retrieval   hit_rate      an expected source is in the top-k
              mrr           1/rank of the first expected source
              context_recall share of answer facts present in the retrieved text
              scope_leaks   chunks returned from outside the chosen department (must be 0)
  Answers     answer_acc    answerable questions whose answer contains every fact
              refusal_acc   unanswerable / out-of-scope questions answered with a refusal
              false_refusal answerable questions the model refused
  Cost        llm_calls/q   model calls per question (production cost; Groq limits are per call/token)
              retrieval_ms  median retrieval latency (LLM calls served from cache)

Model outputs are cached in eval/.cache/llm.sqlite, keyed by the exact prompt,
so a re-run only calls the model where the prompt changed. The index is
rebuilt automatically when the corpus or ingestion code changes.

Usage:
  python eval/eval_runner.py                      # full run, compare with eval/baseline.json
  python eval/eval_runner.py --retrieval-only     # no answer generation (fast, ~free)
  python eval/eval_runner.py --save-baseline      # store this run as the new baseline
  python eval/eval_runner.py --check              # exit 1 on regression vs baseline (CI)
  python eval/eval_runner.py --set HYDE_ENABLED=false --set RERANKER_ENABLED=false
  python eval/eval_runner.py --only fin-          # questions whose id/text contains "fin-"
"""
import argparse
import warnings
import hashlib
import json
import os
import re
import shutil
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")  # langchain deprecation noise

ROOT = Path(__file__).resolve().parent.parent
EVAL_DIR = Path(__file__).resolve().parent
WORK_DIR = EVAL_DIR / ".work"
CACHE_DIR = EVAL_DIR / ".cache"
BASELINE = EVAL_DIR / "baseline.json"
LATEST = EVAL_DIR / "results" / "latest.json"

# Allowed drop vs baseline before --check fails.
TOLERANCE = {"hit_rate": 0.02, "mrr": 0.03, "context_recall": 0.03, "answer_acc": 0.04, "refusal_acc": 0.0}


def _index_key() -> str:
    """Changes whenever the corpus, chunking or embedding code changes."""
    h = hashlib.sha256()
    corpus = json.loads((EVAL_DIR / "corpus.json").read_text())
    for doc in corpus["documents"]:
        h.update(doc["path"].encode() + doc["department"].encode())
        h.update((ROOT / doc["path"]).read_bytes())
    h.update((ROOT / "ingest.py").read_bytes())
    # Only the config values that shape the index (not retrieval flags).
    cfg = (ROOT / "config.py").read_text(encoding="utf-8")
    for name in ("CHUNK_SIZE", "CHUNK_OVERLAP", "EMBED_MODEL", "COLLECTION_NAME", "SUPPORTED_EXTS"):
        m = re.search(rf"^{name}\s*=.*$", cfg, re.M)
        h.update((m.group(0) if m else name).encode())
    return h.hexdigest()[:12]


def _setup_env(key: str) -> Path:
    data_dir = WORK_DIR / key
    os.environ["DOCUMIND_DATA_DIR"] = str(data_dir / "data")
    os.environ["DATABASE_URL"] = f"sqlite:///{(data_dir / 'eval.db').as_posix()}"
    os.environ.setdefault("LLM_MAX_RETRIES", "8")  # wait out Groq's per-minute token limit
    return data_dir


def _build_index(data_dir: Path) -> None:
    from db import run_migrations
    from ingest import ingest_paths
    from config import UPLOADS_DIR

    marker = data_dir / "READY"
    if marker.exists():
        return
    # Drop stale indexes from earlier corpus/code versions.
    for old in WORK_DIR.glob("*"):
        if old != data_dir and old.is_dir():
            shutil.rmtree(old, ignore_errors=True)
    print(f"Building eval index in {data_dir} …")
    run_migrations()
    corpus = json.loads((EVAL_DIR / "corpus.json").read_text())
    for doc in corpus["documents"]:
        src = ROOT / doc["path"]
        dest = UPLOADS_DIR / src.name
        shutil.copy2(src, dest)
        stats = ingest_paths([dest], department=doc["department"])
        if stats["failed"]:
            raise SystemExit(f"Ingest failed: {stats['failed']}")
    marker.write_text(time.strftime("%Y-%m-%d %H:%M:%S"))


def _enable_llm_cache() -> None:
    from langchain_community.cache import SQLiteCache
    from langchain_core.globals import set_llm_cache

    CACHE_DIR.mkdir(exist_ok=True)
    set_llm_cache(SQLiteCache(database_path=str(CACHE_DIR / "llm.sqlite")))


# ── Scoring helpers ──────────────────────────────────────────────────────

REFUSAL_RE = re.compile(
    r"couldn['’]t find|could not find|can(?:no|')t find|no information|not (?:mentioned|specified|"
    r"available|provided|covered|included|stated)|does(?:n['’]t| not) (?:mention|specify|contain|say|include)",
    re.I,
)


def _norm(text: str) -> str:
    text = text.lower().replace("*", "")
    # Models emit typographic variants: non-breaking/narrow spaces, non-breaking hyphens.
    text = re.sub(r"[    ]", " ", text)
    text = re.sub(r"[‐‑‒–—−]", "-", text)
    text = re.sub(r"(\d) %", r"\1%", text)  # "6 %" → "6%"
    return re.sub(r"\s+", " ", text)


def _has_fact(text: str, fact) -> bool:
    options = fact if isinstance(fact, list) else [fact]
    t = _norm(text)
    # Accept "2000" for "2,000" and vice versa.
    t_nocomma = t.replace(",", "")
    return any(_norm(o) in t or _norm(o).replace(",", "") in t_nocomma for o in options)


def _rr(retrieved: list[str], expected: list[str]) -> float:
    for rank, src in enumerate(retrieved, 1):
        if src in expected:
            return 1.0 / rank
    return 0.0


# ── Run ──────────────────────────────────────────────────────────────────

def _with_rate_limit_wait(fn, on_retry=None, max_wait_s: float = 3 * 3600):
    """Call fn, sleeping through provider rate limits (Groq's free tier also has
    a rolling daily token cap that the client's own retries can't outlast)."""
    waited = 0.0
    while True:
        try:
            return fn()
        except Exception as e:  # groq.RateLimitError, without importing groq here
            if getattr(e, "status_code", None) != 429 or waited > max_wait_s:
                raise
            m = re.search(r"try again in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s", str(e))
            delay = (int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + float(m.group(3))) if m else 60
            delay = min(max(delay + 2, 5), 900)
            print(f"      rate limited; waiting {delay:.0f}s", flush=True)
            time.sleep(delay)
            waited += delay
            if on_retry:
                on_retry()

def run(questions: list[dict], k: int, answers: bool, model: str | None) -> list[dict]:
    import config
    import rag

    calls = {"n": 0}
    original_get_llm = rag._get_llm

    def counting_get_llm(*a, **kw):
        calls["n"] += 1
        return original_get_llm(*a, **kw)

    rag._get_llm = counting_get_llm
    rag._get_cross_encoder()  # load the reranker before timing anything

    results = []
    for i, q in enumerate(questions, 1):
        calls["n"] = 0
        history = q.get("history")
        t0 = time.perf_counter()
        docs, low_conf = rag.retrieve_with_confidence(
            q["question"], k=k, department=q.get("department"),
            allowed_departments=config.DEPARTMENTS, history=history,
        )
        retrieval_ms = (time.perf_counter() - t0) * 1000
        sources = [d.metadata.get("source", "") for d in docs]
        context = "\n".join(d.page_content for d in docs)
        expected = q.get("expected_sources", [])
        answerable = q.get("answerable", True)
        scope = q.get("department")

        r = {
            "id": q["id"], "type": q["type"], "question": q["question"], "answerable": answerable,
            "retrieved": sources, "low_confidence": low_conf, "retrieval_ms": round(retrieval_ms, 1),
            "top_score": max((d.metadata.get("rerank_score", 0.0) for d in docs), default=None),
            "leak": bool(scope) and any(d.metadata.get("department") != scope for d in docs)
                    or any(s in q.get("forbidden_sources", []) for s in sources),
        }
        if answerable:
            r["hit"] = any(s in expected for s in sources)
            r["rr"] = _rr(sources, expected)
            facts = q.get("facts", [])
            r["context_recall"] = sum(_has_fact(context, f) for f in facts) / len(facts) if facts else 1.0

        if answers:
            # Retries after a rate limit aren't extra production calls; don't count them.
            answer = _with_rate_limit_wait(
                lambda _q=q["question"], _d=docs, _lc=low_conf, _m=model, _h=history, _s=scope: rag.generate_answer(
                    _q, _d, _lc, model=_m, history=_h, department=_s
                ),
                on_retry=lambda: calls.__setitem__("n", calls["n"] - 1))
            r["answer"] = answer
            refused = bool(REFUSAL_RE.search(answer))
            r["refused"] = refused
            if answerable:
                missing = [f for f in q.get("facts", []) if not _has_fact(answer, f)]
                r["missing_facts"] = missing
                r["correct"] = not missing
            else:
                r["correct"] = refused
        r["llm_calls"] = calls["n"]
        results.append(r)
        mark = "✓" if r.get("correct", r.get("hit", not r["leak"])) else "✗"
        print(f"  [{i:>2}/{len(questions)}] {mark} {q['id']}", flush=True)

    rag._get_llm = original_get_llm
    return results


def summarize(results: list[dict], answers: bool) -> dict:
    ans = [r for r in results if r["answerable"]]
    neg = [r for r in results if not r["answerable"]]

    def mean(xs):
        xs = list(xs)
        return round(sum(xs) / len(xs), 4) if xs else None

    s = {
        "questions": len(results),
        "hit_rate": mean(r["hit"] for r in ans),
        "mrr": mean(r["rr"] for r in ans),
        "context_recall": mean(r["context_recall"] for r in ans),
        "scope_leaks": sum(r["leak"] for r in results),
        # Share of answerable questions shown the "low-confidence" warning (noise when high).
        "low_conf_rate": mean(r["low_confidence"] for r in ans),
        "llm_calls_per_q": mean(r["llm_calls"] for r in results),
        "retrieval_ms_p50": round(statistics.median(r["retrieval_ms"] for r in results), 1),
    }
    if answers:
        s["answer_acc"] = mean(r["correct"] for r in ans)
        s["refusal_acc"] = mean(r["correct"] for r in neg)
        s["false_refusal"] = mean(r["refused"] and not r["correct"] for r in ans)

    by_type = defaultdict(list)
    for r in results:
        by_type[r["type"]].append(r)
    s["by_type"] = {
        t: {
            "n": len(rs),
            "hit_rate": mean(r["hit"] for r in rs if "hit" in r),
            **({"accuracy": mean(r["correct"] for r in rs)} if answers else {}),
        }
        for t, rs in sorted(by_type.items())
    }
    return s


RATE_KEYS = {"hit_rate", "mrr", "context_recall", "answer_acc", "refusal_acc", "false_refusal", "low_conf_rate", "accuracy"}


def _fmt(v, key=None):
    if v is None:
        return "—"
    if key in RATE_KEYS or (key is None and isinstance(v, float) and v <= 1):
        return f"{v:.1%}"
    return str(v)


def print_report(s: dict, baseline: dict | None, results: list[dict], answers: bool) -> None:
    keys = ["hit_rate", "mrr", "context_recall", "scope_leaks"]
    if answers:
        keys += ["answer_acc", "refusal_acc", "false_refusal"]
    keys += ["low_conf_rate", "llm_calls_per_q", "retrieval_ms_p50"]
    base = (baseline or {}).get("summary", {})
    print(f"\n{'metric':<18}{'this run':>10}{'baseline':>10}{'delta':>9}")
    for key in keys:
        cur, old = s.get(key), base.get(key)
        delta = ""
        if isinstance(cur, (int, float)) and isinstance(old, (int, float)):
            d = cur - old
            delta = f"{d:+.1%}" if key not in ("scope_leaks", "llm_calls_per_q", "retrieval_ms_p50") else f"{d:+.1f}"
        print(f"{key:<18}{_fmt(cur, key):>10}{_fmt(old, key):>10}{delta:>9}")

    print(f"\n{'type':<14}{'n':>4}{'hit':>8}" + (f"{'acc':>8}" if answers else ""))
    for t, v in s["by_type"].items():
        print(f"{t:<14}{v['n']:>4}{_fmt(v['hit_rate']):>8}" + (f"{_fmt(v.get('accuracy')):>8}" if answers else ""))

    failures = [r for r in results if (answers and not r["correct"]) or (r["answerable"] and not r["hit"]) or r["leak"]]
    if failures:
        print(f"\nFailures ({len(failures)}):")
        for r in failures:
            why = []
            if r["leak"]:
                why.append("SCOPE LEAK")
            if r["answerable"] and not r["hit"]:
                why.append(f"retrieval miss → {r['retrieved'][:3]}")
            if answers and not r["correct"]:
                why.append(f"missing {r['missing_facts']}" if r["answerable"] else "did not refuse")
            print(f"  {r['id']}: {'; '.join(why)}")
            if answers and not r["correct"]:
                print(f"      answer: {r['answer'][:160].replace(chr(10), ' ')}")


def regressions(s: dict, baseline: dict) -> list[str]:
    base = baseline.get("summary", {})
    out = []
    for key, tol in TOLERANCE.items():
        if isinstance(s.get(key), (int, float)) and isinstance(base.get(key), (int, float)):
            if s[key] < base[key] - tol:
                out.append(f"{key} {base[key]:.3f} → {s[key]:.3f}")
    if s.get("scope_leaks", 0) > 0:
        out.append(f"scope_leaks = {s['scope_leaks']}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--retrieval-only", action="store_true", help="skip answer generation")
    ap.add_argument("--model", default=None, help="answer model (default: GROQ_MODEL)")
    ap.add_argument("--only", default=None, help="substring of question id or text")
    ap.add_argument("--set", action="append", default=[], metavar="FLAG=VALUE",
                    help="override a rag flag, e.g. HYDE_ENABLED=false")
    ap.add_argument("--save-baseline", action="store_true")
    ap.add_argument("--check", action="store_true", help="exit 1 on regression vs baseline")
    ap.add_argument("--no-cache", action="store_true", help="don't cache model outputs")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    data_dir = _setup_env(_index_key())
    sys.path.insert(0, str(ROOT))
    if not args.no_cache:
        _enable_llm_cache()
    _build_index(data_dir)

    import rag
    for item in args.set:
        name, _, value = item.partition("=")
        if not hasattr(rag, name):
            raise SystemExit(f"Unknown flag: {name}")
        cur = getattr(rag, name)
        setattr(rag, name, value.lower() in ("1", "true", "yes") if isinstance(cur, bool) else type(cur)(value))

    questions = json.loads((EVAL_DIR / "eval_set.json").read_text(encoding="utf-8"))["questions"]
    if args.only:
        questions = [q for q in questions if args.only.lower() in (q["id"] + q["question"]).lower()]
    answers = not args.retrieval_only
    print(f"{len(questions)} questions, k={args.k}, answers={'on' if answers else 'off'}"
          + (f", overrides: {', '.join(args.set)}" if args.set else ""))

    results = run(questions, args.k, answers, args.model)
    summary = summarize(results, answers)
    report = {
        "summary": summary,
        "config": {"k": args.k, "overrides": args.set, "model": args.model or rag.GROQ_MODEL,
                   "flags": {f: getattr(rag, f) for f in ("QUERY_REWRITE_ENABLED", "HYDE_ENABLED",
                                                         "RERANKER_ENABLED", "CRAG_ENABLED")}},
        "results": results,
    }
    LATEST.parent.mkdir(exist_ok=True)
    LATEST.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    baseline = json.loads(BASELINE.read_text(encoding="utf-8")) if BASELINE.exists() else None
    print_report(summary, baseline, results, answers)
    print(f"\nFull results: {LATEST.relative_to(ROOT)}")

    if args.save_baseline:
        BASELINE.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved baseline: {BASELINE.relative_to(ROOT)}")
    if args.check and baseline:
        bad = regressions(summary, baseline)
        if bad:
            print("\nREGRESSION: " + "; ".join(bad))
            sys.exit(1)
        print("\nNo regressions.")


if __name__ == "__main__":
    main()
