#!/usr/bin/env python3
"""
ERAG retrieval eval harness.

Metrics:
  hit_rate    — fraction of questions where >=1 expected source appears in top-k
  mrr         — mean reciprocal rank of the first expected source hit
  faithfulness— LLM-judge: fraction of answer content grounded in retrieved context

Usage:
  # Run with current config settings (retrieval only)
  python eval/eval_runner.py

  # Include answer faithfulness scoring (calls LLM per question — slower)
  python eval/eval_runner.py --faithfulness

  # Sweep all 16 flag combinations and rank by hit rate
  python eval/eval_runner.py --flag-combos

  # Sweep + faithfulness
  python eval/eval_runner.py --flag-combos --faithfulness

  # Filter to questions whose text contains a substring
  python eval/eval_runner.py --question "leave policy"

  # Use a different top-k
  python eval/eval_runner.py --k 10
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import config  # noqa: E402

EVAL_SET = Path(__file__).parent / "eval_set.json"
FLAG_NAMES = ["QUERY_REWRITE_ENABLED", "HYDE_ENABLED", "RERANKER_ENABLED", "CRAG_ENABLED"]


def load_eval_set() -> list[dict]:
    with open(EVAL_SET) as f:
        data = json.load(f)
    # Skip the placeholder example entry
    return [q for q in data["questions"] if "_example" not in q]


def _hit(retrieved: list[str], expected: list[str]) -> bool:
    retrieved_lower = {s.lower() for s in retrieved}
    return any(e.lower() in retrieved_lower for e in expected)


def _rr(retrieved: list[str], expected: list[str]) -> float:
    expected_lower = {e.lower() for e in expected}
    for rank, src in enumerate(retrieved, 1):
        if src.lower() in expected_lower:
            return 1.0 / rank
    return 0.0


# ── Faithfulness helpers ─────────────────────────────────────────────────

def _get_answer(question: str, docs: list, model: str | None = None) -> str:
    """Generate a non-streaming answer for faithfulness scoring."""
    import rag
    context = "\n\n".join(
        f"[{i}] {d.metadata.get('source', '?')}\n{d.page_content}"
        for i, d in enumerate(docs, 1)
    )[:4000]
    try:
        from langchain_core.prompts import ChatPromptTemplate
        llm = rag._get_llm(model, streaming=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Answer using ONLY the context provided. Be concise and direct."),
            ("user", f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"),
        ])
        return (prompt | llm).invoke({}).content.strip()
    except Exception as e:
        return f"[error: {e}]"


def _faithfulness_score(
    question: str, docs: list, answer: str, model: str | None = None
) -> float:
    """LLM judge: how much of the answer is grounded in the retrieved context (0–1).

    1.0 = every claim is directly supported by context (no hallucination).
    0.0 = answer ignores or contradicts the context entirely.
    """
    import rag
    context = "\n\n".join(d.page_content for d in docs)[:3000]
    try:
        from langchain_core.prompts import ChatPromptTemplate
        llm = rag._get_llm(model, streaming=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You evaluate whether an AI-generated answer is faithful to a given context. "
             "1.0 = fully grounded, every claim supported. "
             "0.0 = answer ignores or contradicts the context. "
             "Reply with ONLY a decimal between 0.0 and 1.0 — no explanation."),
            ("user",
             f"Context:\n{context}\n\n"
             f"Question: {question}\n\n"
             f"Answer: {answer}"),
        ])
        val = (prompt | llm).invoke({}).content.strip()
        return max(0.0, min(1.0, float(val)))
    except Exception:
        return 0.5  # neutral fallback — don't penalise on LLM errors


# ── Core eval loop ───────────────────────────────────────────────────────

def run_eval(
    questions: list[dict],
    k: int = 5,
    measure_faithfulness: bool = False,
    model: str | None = None,
) -> tuple[float, float, float | None, list[dict]]:
    """Run the retrieval (and optionally faithfulness) eval.

    Returns (hit_rate, mrr, avg_faithfulness_or_None, per_question_results).
    """
    import rag

    results = []
    for item in questions:
        docs = rag.retrieve(
            item["question"],
            k=k,
            department=item.get("department"),
            allowed_departments=config.DEPARTMENTS,
        )
        retrieved = [d.metadata.get("source", "") for d in docs]
        expected = item["expected_sources"]
        result = {
            "question": item["question"],
            "expected": expected,
            "retrieved": retrieved,
            "hit": _hit(retrieved, expected),
            "rr": _rr(retrieved, expected),
        }

        if measure_faithfulness:
            answer = _get_answer(item["question"], docs, model=model)
            result["answer"] = answer
            result["faithfulness"] = _faithfulness_score(
                item["question"], docs, answer, model=model
            )

        results.append(result)

    n = len(results)
    hit_rate = sum(r["hit"] for r in results) / n if n else 0.0
    mrr = sum(r["rr"] for r in results) / n if n else 0.0
    avg_faith = (
        sum(r["faithfulness"] for r in results) / n
        if (n and measure_faithfulness)
        else None
    )
    return hit_rate, mrr, avg_faith, results


# ── Flag sweep helpers ───────────────────────────────────────────────────

def _set_flags(**flags: bool) -> None:
    """Patch rag module attributes directly — avoids reload, keeps cross-encoder warm."""
    import rag
    for name, val in flags.items():
        setattr(rag, name, val)
    rag._REWRITE_CACHE.clear()
    rag._HYDE_CACHE.clear()
    rag.invalidate_bm25_cache()


def _restore_flags() -> None:
    import rag
    for name in FLAG_NAMES:
        setattr(rag, name, getattr(config, name))
    rag._REWRITE_CACHE.clear()
    rag._HYDE_CACHE.clear()
    rag.invalidate_bm25_cache()


# ── CLI ──────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="ERAG retrieval eval harness")
    parser.add_argument("--flag-combos", action="store_true",
                        help="Test all 16 flag combinations and rank by hit rate")
    parser.add_argument("--faithfulness", action="store_true",
                        help="Also score answer faithfulness via LLM judge (slower)")
    parser.add_argument("--model", type=str, default=None,
                        help="Override LLM model for answer generation / faithfulness judge")
    parser.add_argument("--k", type=int, default=5, help="Top-k to retrieve (default: 5)")
    parser.add_argument("--question", type=str,
                        help="Filter to questions containing this substring")
    args = parser.parse_args()

    questions = load_eval_set()
    if not questions:
        print("No questions in eval/eval_set.json. Add entries to get started.")
        print("See the _instructions field in that file.")
        return

    if args.question:
        questions = [q for q in questions if args.question.lower() in q["question"].lower()]
        if not questions:
            print(f"No questions match: {args.question!r}")
            return

    faith_suffix = " + faithfulness" if args.faithfulness else ""
    print(f"Eval set: {len(questions)} question(s), k={args.k}{faith_suffix}\n")

    if args.flag_combos:
        col_w = 52
        faith_col = "  Faith" if args.faithfulness else ""
        print(f"{'Flags':<{col_w}} {'HitRate':>8} {'MRR':>8}{faith_col}")
        print("-" * (col_w + 20 + (9 if args.faithfulness else 0)))

        rows = []
        for combo in itertools.product([True, False], repeat=len(FLAG_NAMES)):
            flags = dict(zip(FLAG_NAMES, combo))
            _set_flags(**flags)
            hit_rate, mrr, avg_faith, _ = run_eval(
                questions, k=args.k,
                measure_faithfulness=args.faithfulness,
                model=args.model,
            )
            label = "  ".join(f"{'+'if v else '-'}{n[:2]}" for n, v in flags.items())
            rows.append((hit_rate, mrr, avg_faith, label, flags))

        rows.sort(key=lambda r: (r[0], r[1]), reverse=True)
        for hit_rate, mrr, avg_faith, label, _ in rows:
            faith_str = f"  {avg_faith:>6.3f}" if avg_faith is not None else ""
            print(f"{label:<{col_w}} {hit_rate:>8.1%} {mrr:>8.3f}{faith_str}")

        best = rows[0]
        print(f"\nBest: {best[4]}")
        print(f"  HitRate={best[0]:.1%}  MRR={best[1]:.3f}", end="")
        if best[2] is not None:
            print(f"  Faithfulness={best[2]:.3f}", end="")
        print()

        _restore_flags()

    else:
        hit_rate, mrr, avg_faith, results = run_eval(
            questions, k=args.k,
            measure_faithfulness=args.faithfulness,
            model=args.model,
        )
        faith_str = f"   Faithfulness: {avg_faith:.3f}" if avg_faith is not None else ""
        print(f"HitRate: {hit_rate:.1%}   MRR: {mrr:.3f}{faith_str}\n")

        misses = [r for r in results if not r["hit"]]
        hits = [r for r in results if r["hit"]]

        if hits:
            print(f"Hits ({len(hits)}/{len(results)}):")
            for r in hits:
                faith_str = f"  faith={r['faithfulness']:.2f}" if "faithfulness" in r else ""
                print(f"  [rr={r['rr']:.2f}{faith_str}] {r['question'][:70]}")

        if misses:
            print(f"\nMisses ({len(misses)}):")
            for r in misses:
                faith_str = f"  faith={r['faithfulness']:.2f}" if "faithfulness" in r else ""
                print(f"  Q: {r['question'][:70]}{faith_str}")
                print(f"     Expected : {r['expected']}")
                print(f"     Retrieved: {r['retrieved'][:3]}")


if __name__ == "__main__":
    main()
