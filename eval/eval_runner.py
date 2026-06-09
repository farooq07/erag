#!/usr/bin/env python3
"""
ERAG retrieval eval harness.

Metrics:
  hit_rate  — fraction of questions where >=1 expected source appears in top-k
  mrr       — mean reciprocal rank of the first expected source hit

Usage:
  # Run with current config settings
  python eval/eval_runner.py

  # Sweep all 16 flag combinations and rank by hit rate
  python eval/eval_runner.py --flag-combos

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


def run_eval(questions: list[dict], k: int = 5) -> tuple[float, float, list[dict]]:
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
        results.append({
            "question": item["question"],
            "expected": expected,
            "retrieved": retrieved,
            "hit": _hit(retrieved, expected),
            "rr": _rr(retrieved, expected),
        })

    n = len(results)
    hit_rate = sum(r["hit"] for r in results) / n if n else 0.0
    mrr = sum(r["rr"] for r in results) / n if n else 0.0
    return hit_rate, mrr, results


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


def main() -> None:
    parser = argparse.ArgumentParser(description="ERAG retrieval eval harness")
    parser.add_argument("--flag-combos", action="store_true",
                        help="Test all 16 flag combinations and rank by hit rate")
    parser.add_argument("--k", type=int, default=5, help="Top-k to retrieve (default: 5)")
    parser.add_argument("--question", type=str, help="Filter to questions containing this substring")
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

    print(f"Eval set: {len(questions)} question(s), k={args.k}\n")

    if args.flag_combos:
        col_w = 52
        print(f"{'Flags':<{col_w}} {'HitRate':>8} {'MRR':>8}")
        print("-" * (col_w + 20))

        rows = []
        for combo in itertools.product([True, False], repeat=len(FLAG_NAMES)):
            flags = dict(zip(FLAG_NAMES, combo))
            _set_flags(**flags)
            hit_rate, mrr, _ = run_eval(questions, k=args.k)
            label = "  ".join(f"{'+'if v else '-'}{n[:2]}" for n, v in flags.items())
            rows.append((hit_rate, mrr, label, flags))

        rows.sort(key=lambda r: (r[0], r[1]), reverse=True)
        for hit_rate, mrr, label, _ in rows:
            print(f"{label:<{col_w}} {hit_rate:>8.1%} {mrr:>8.3f}")

        best = rows[0]
        print(f"\nBest: {best[3]}")
        print(f"  HitRate={best[0]:.1%}  MRR={best[1]:.3f}")

        _restore_flags()

    else:
        hit_rate, mrr, results = run_eval(questions, k=args.k)
        print(f"HitRate: {hit_rate:.1%}   MRR: {mrr:.3f}\n")

        misses = [r for r in results if not r["hit"]]
        hits = [r for r in results if r["hit"]]

        if hits:
            print(f"Hits ({len(hits)}/{len(results)}):")
            for r in hits:
                print(f"  [rr={r['rr']:.2f}] {r['question'][:70]}")

        if misses:
            print(f"\nMisses ({len(misses)}):")
            for r in misses:
                print(f"  Q: {r['question'][:70]}")
                print(f"     Expected : {r['expected']}")
                print(f"     Retrieved: {r['retrieved'][:3]}")


if __name__ == "__main__":
    main()
