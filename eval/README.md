# RAG evaluation

A fixed benchmark for retrieval and answer quality. Run it before and after
any change to chunking, retrieval, prompts or models.

```bash
python eval/eval_runner.py --retrieval-only   # ~1 min, nearly free (cached model calls)
python eval/eval_runner.py                    # full run with answers
python eval/eval_runner.py --check            # exit 1 on regression vs baseline.json (CI)
python eval/eval_runner.py --save-baseline    # accept this run as the new baseline
python eval/eval_runner.py --set HYDE_ENABLED=true --retrieval-only   # ablate a flag
```

## What's in it

- **Corpus** (`corpus.json`): the six demo documents plus six look-alike
  distractors in `corpus/` (a Q2 report next to the Q3 one, an Amsterdam
  office guide next to the general office rules, an acceptable-use policy next
  to the security policy). The eval builds its own index under `eval/.work/`
  and never touches `data/`; it is rebuilt automatically when the corpus,
  `ingest.py` or the chunking settings change.
- **Questions** (`eval_set.json`, 58): look-ups, paraphrases, exact codes
  ("Form IT-14"), distractor traps, cross-document comparisons, follow-ups
  that need chat history, unanswerable questions, and questions asked from a
  department that must not see the answer.

## Metrics

Scoring is deterministic (no LLM judge): an answer is correct when it
contains every expected fact (each fact may list acceptable phrasings).

| Metric | Meaning |
|---|---|
| `hit_rate` | an expected document is among the top-5 passages |
| `mrr` | 1 / rank of the first expected document |
| `context_recall` | share of expected facts present in the retrieved text (catches "right file, wrong passage") |
| `scope_leaks` | passages returned from outside the chosen department; must be 0 |
| `answer_acc` | answerable questions answered with every fact |
| `refusal_acc` | unanswerable / out-of-scope questions answered with a refusal |
| `false_refusal` | answerable questions the model refused |
| `low_conf_rate` | answerable questions shown the "low-confidence" warning |
| `llm_calls_per_q` | model calls per question (Groq free tier: 1,000 requests/day, 8,000 tokens/min) |

Model outputs are cached in `eval/.cache/llm.sqlite` keyed by the exact
prompt, so re-runs only call the model where a prompt changed.

## Results so far

| Change | answer_acc | context_recall | false_refusal | low_conf_rate | calls/q | retrieval p50 |
|---|---|---|---|---|---|---|
| Baseline (fixed-size chunks, whitespace BM25) | 92.3% | 94.2% | 5.8% | ~81% | 2.9 | 2.9 s |
| BM25 tokenises on word characters | 94.2% | 96.2% | 5.8% | — | 2.9 | 3.0 s |
| One chunk per document section + location prefix | 96.2% | 96.2% | 1.9% | — | 2.9 | 2.6 s |
| BM25 on question + rewrite; per-retriever pool slots; CRAG on top score; HyDE off (**current `baseline.json`**) | **98.1%** | 98.1% | 1.9% | 7.7% | 2.0 | 2.3 s |

Retrieval latency is with a live rewrite call; with every model call served
from cache it is ~1.1 s. The one remaining failure (`fin-q1-headcount`) asks
for a figure that only appears in passing, "(Q1: 304)", in the Q2 report's
headcount line.

Findings that drove these changes:

- **BM25** split on whitespace, so `ESOP:`, `Net-zero` and `(Q1: 304)` never
  matched the query words `esop`, `zero`, `q1`.
- **Fixed 800-character chunks** cut across sections: the procurement table
  ended up in a different chunk from its heading, and the net-zero sentence
  shared a chunk with fire-evacuation rules, which the reranker scored ~0.
- **Query rewriting** expands "Q1" to "first quarter", which drops the exact
  term BM25 needs; BM25 now searches the original question plus the rewrite.
- **RRF** favours chunks found by both retrievers, which pushed BM25's top hit
  (the right answer for "office days per week") out of the reranker's pool.
- **The low-confidence warning** required two chunks above 0.3; with
  section-sized chunks one strong chunk is normal, so ~4 in 5 answers carried
  the warning. It now fires when the best chunk scores below 0.02.
- **HyDE** gave identical retrieval scores with or without it, at the cost of
  one model call and ~0.9 s per question, so it is off by default.
