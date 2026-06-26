"""
RAG pipeline with:
- Multi-turn memory (conversation history)
- Query rewriting (LLM-based expansion / decomposition, history-aware)
- HyDE (Hypothetical Document Embeddings) for vector search
- Hybrid search (BM25 + vector, fused via RRF)
- Cross-encoder reranking (ms-marco-MiniLM-L-6-v2)
- CRAG-lite relevance filtering with low-confidence warning
- Groq / Ollama LLM support
"""
import json
import math
import re
from typing import Iterator

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate

from config import (
    CRAG_ENABLED, CRAG_MIN_CHUNKS, CRAG_THRESHOLD,
    GROQ_API_KEY, GROQ_MODEL,
    HYDE_ENABLED, LLM_MODEL, LLM_PROVIDER,
    OLLAMA_BASE_URL, QUERY_REWRITE_ENABLED,
    RERANK_POOL, RERANKER_ENABLED, RERANKER_MODEL,
    TOP_K,
)
from ingest import get_vectorstore

# ── Prompts ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a helpful office assistant. Answer the user's question using ONLY \
the context below.

{history_block}
Rules:
- If the answer is NOT in the context, say exactly: \
"I couldn't find this in the uploaded documents."
- Be concise and direct. Quote specific facts or numbers when relevant.
- Do NOT invent or assume anything beyond the context.
- When referencing information, mention the source document name naturally."""

USER_PROMPT = """\
Context from documents:
────────────────────────
{context}
────────────────────────

Question: {question}

Answer:"""


# ── LLM factory ─────────────────────────────────────────────────────────

def _get_llm(model: str = None, streaming: bool = True):
    if LLM_PROVIDER == "groq" and GROQ_API_KEY:
        from langchain_groq import ChatGroq
        return ChatGroq(
            api_key=GROQ_API_KEY,
            model=model or GROQ_MODEL,
            temperature=0.1,
            streaming=streaming,
        )
    from langchain_ollama import ChatOllama
    return ChatOllama(model=model or LLM_MODEL, base_url=OLLAMA_BASE_URL, temperature=0.1)


# ── [QUERY REWRITE] ─────────────────────────────────────────────────────
# Bounded in-process cache so /chat doesn't re-run rewrite+HyDE twice
# (retrieve() is called once for sources, then answer_stream() runs again).
_REWRITE_CACHE: dict[str, str] = {}
_HYDE_CACHE: dict[str, str] = {}
_CACHE_MAX = 128


def _cache_set(cache: dict, key: str, val: str) -> None:
    if len(cache) >= _CACHE_MAX:
        cache.pop(next(iter(cache)))
    cache[key] = val


def _rewrite_query(
    question: str,
    history: list[dict] | None = None,
    model: str | None = None,
) -> str:
    """Expand acronyms, resolve follow-up references, normalise for retrieval.

    When history is provided, the rewriter resolves pronouns and implicit
    references ("what about Q3?") into self-contained keyword-rich queries
    before BM25/vector search fires on them.
    """
    if not QUERY_REWRITE_ENABLED or not question.strip():
        return question

    history_tail = ""
    if history:
        recent = history[-(4 * 2):]
        history_tail = " | ".join(
            f"{m['role'][:1].upper()}:{m['content'][:150]}" for m in recent
        )

    cache_key = f"{question}||{history_tail}"
    if cache_key in _REWRITE_CACHE:
        return _REWRITE_CACHE[cache_key]

    try:
        llm = _get_llm(model, streaming=False)
        if history_tail:
            system_msg = (
                "You rewrite follow-up questions into standalone retrieval queries "
                "for a document search system. Given the conversation history, "
                "resolve all pronouns, references, and implicit context in the latest "
                "question. Make it fully self-contained and keyword-rich (under 40 words). "
                "Output ONLY the rewritten question — no preface, no quotes."
            )
            user_msg = f"History:\n{history_tail}\n\nLatest question: {question}"
        else:
            system_msg = (
                "You rewrite user questions for a document-retrieval system. "
                "Expand acronyms, fix typos, and make the question explicit and "
                "keyword-rich. Keep it under 30 words. Output ONLY the rewritten "
                "question — no preface, no quotes, no explanation."
            )
            user_msg = question

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_msg),
            ("user", "{q}"),
        ])
        out = (prompt | llm).invoke({"q": user_msg}).content.strip()
        if not out or len(out) > 500:
            out = question
        _cache_set(_REWRITE_CACHE, cache_key, out)
        return out
    except Exception:
        return question


# ── [HYDE] ──────────────────────────────────────────────────────────────

def _generate_hyde(question: str, model: str | None = None) -> str:
    """Generate a hypothetical answer to embed for vector search.

    The hypothetical doc is more similar in style/length to real chunks than
    the raw question, so its embedding pulls in better neighbours.
    """
    if not HYDE_ENABLED or not question.strip():
        return question
    if question in _HYDE_CACHE:
        return _HYDE_CACHE[question]
    try:
        llm = _get_llm(model, streaming=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "Write a short, plausible passage (2-3 sentences) that would "
             "appear in an office document and would directly answer the "
             "user's question. It does not need to be factually correct — "
             "it is used only for semantic similarity search. Output ONLY "
             "the passage."),
            ("user", "{q}"),
        ])
        out = (prompt | llm).invoke({"q": question}).content.strip()
        if not out:
            out = question
        _cache_set(_HYDE_CACHE, question, out)
        return out
    except Exception:
        return question


# ── [RERANKER] Cross-encoder lazy loader ────────────────────────────────

_CROSS_ENCODER = None


def _get_cross_encoder():
    global _CROSS_ENCODER
    if _CROSS_ENCODER is None:
        from sentence_transformers import CrossEncoder
        _CROSS_ENCODER = CrossEncoder(RERANKER_MODEL)
    return _CROSS_ENCODER


def _sigmoid(x: float) -> float:
    # ms-marco logits roughly span [-10, 10]; sigmoid maps to a usable 0-1.
    try:
        return 1.0 / (1.0 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0


def _score_pairs(question: str, docs: list[Document]) -> list[float]:
    """Return sigmoid-normalised cross-encoder relevance scores in [0,1]."""
    if not docs:
        return []
    try:
        ce = _get_cross_encoder()
        pairs = [(question, d.page_content) for d in docs]
        raw = ce.predict(pairs)
        return [_sigmoid(float(s)) for s in raw]
    except Exception:
        # If model fails to load, treat all as moderately relevant so we don't
        # filter the user out of an answer.
        return [0.5] * len(docs)


# ── BM25 corpus cache ────────────────────────────────────────────────────
# Built once from the full Chroma collection; invalidated by ingest/delete.
# Avoids O(corpus) tokenization + Chroma I/O on every /chat request.

_BM25_CACHE: dict | None = None  # {"corpus": list[str], "metas": list[dict], "bm25": BM25Okapi}


def invalidate_bm25_cache() -> None:
    """Drop the cached BM25 index. Called by ingest after corpus mutations."""
    global _BM25_CACHE
    _BM25_CACHE = None


def _get_bm25_cache() -> dict:
    global _BM25_CACHE
    if _BM25_CACHE is not None:
        return _BM25_CACHE
    vs = get_vectorstore()
    col = vs._collection.get(include=["documents", "metadatas"])
    corpus: list[str] = col.get("documents") or []
    metas: list[dict] = col.get("metadatas") or []
    bm25 = None
    if corpus:
        from rank_bm25 import BM25Okapi
        bm25 = BM25Okapi([d.lower().split() for d in corpus])
    _BM25_CACHE = {"corpus": corpus, "metas": metas, "bm25": bm25}
    return _BM25_CACHE


def _meta_matches_filter(meta: dict, dept_filter: dict | None) -> bool:
    if dept_filter is None:
        return True
    val = dept_filter.get("department")
    if val is None:
        return True
    doc_dept = meta.get("department", "")
    if isinstance(val, str):
        return doc_dept == val
    if isinstance(val, dict):
        return doc_dept in val.get("$in", [])
    return False


# ── Hybrid search (BM25 + Vector → RRF) ─────────────────────────────────

def _rrf_score(rank: int, k: int = 60) -> float:
    return 1.0 / (k + rank + 1)


def _build_dept_filter(department: str | None, allowed_departments: list[str] | None) -> dict | None:
    """Resolve the active department filter from user scope + role permissions.

    - `allowed_departments` (from the user's role) is the hard ceiling.
    - `department` is the user-chosen scope; "All"/None means "any allowed dept".
    - Intersection determines the actual filter.
    """
    if department and department.lower() != "all":
        wanted = [department]
    elif allowed_departments is not None:
        wanted = list(allowed_departments)
    else:
        return None

    if allowed_departments is not None:
        wanted = [d for d in wanted if d in allowed_departments]

    if not wanted:
        # Return an impossible filter so retrieval yields nothing.
        return {"department": "__no_access__"}
    if len(wanted) == 1:
        return {"department": wanted[0]}
    return {"department": {"$in": wanted}}


def hybrid_retrieve(
    question: str,
    k: int = TOP_K,
    department: str | None = None,
    allowed_departments: list[str] | None = None,
) -> list[Document]:
    """Fuse BM25 keyword + (HyDE-augmented) vector results via RRF.

    Retrieval is scoped to chunks the current user is allowed to see, optionally
    further narrowed to a single department.
    """
    vs = get_vectorstore()
    dept_filter = _build_dept_filter(department, allowed_departments)

    # [HYDE] Embed a hypothetical answer instead of the raw question.
    # We still use the real question for BM25 (keywords) and reranking.
    if HYDE_ENABLED:
        hyde_text = _generate_hyde(question)
        try:
            embed_fn = vs._embedding_function
            vec = embed_fn.embed_query(hyde_text)
            vector_docs = vs.similarity_search_by_vector(vec, k=k * 4, filter=dept_filter)
        except Exception:
            vector_docs = vs.similarity_search(question, k=k * 4, filter=dept_filter)
    else:
        vector_docs = vs.similarity_search(question, k=k * 4, filter=dept_filter)

    # BM25 keyword search — uses the cached full-corpus index.
    # Department filtering is applied post-scoring so the index is shared
    # across all user scopes and only built once per ingest cycle.
    try:
        cache = _get_bm25_cache()
        if cache["bm25"] is not None:
            scores = cache["bm25"].get_scores(question.lower().split())
            top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
            bm25_docs = []
            for i in top_idx:
                if len(bm25_docs) >= k * 4:
                    break
                if scores[i] <= 0:
                    break
                if not _meta_matches_filter(cache["metas"][i], dept_filter):
                    continue
                bm25_docs.append(
                    Document(page_content=cache["corpus"][i], metadata=cache["metas"][i])
                )
        else:
            bm25_docs = []
    except Exception:
        bm25_docs = []

    # RRF fusion
    fused: dict[str, dict] = {}
    for rank, doc in enumerate(vector_docs):
        key = doc.page_content[:120]
        if key not in fused:
            fused[key] = {"doc": doc, "score": 0.0}
        fused[key]["score"] += _rrf_score(rank)

    for rank, doc in enumerate(bm25_docs):
        key = doc.page_content[:120]
        if key not in fused:
            fused[key] = {"doc": doc, "score": 0.0}
        fused[key]["score"] += _rrf_score(rank)

    ranked = sorted(fused.values(), key=lambda x: x["score"], reverse=True)
    # Return a larger pool so the reranker has room to work; caller trims to k.
    pool = max(k, RERANK_POOL) if RERANKER_ENABLED else k
    return [item["doc"] for item in ranked[:pool]]


# ── Pipeline orchestration ──────────────────────────────────────────────

def _retrieve_pipeline(
    question: str,
    k: int = TOP_K,
    department: str | None = None,
    allowed_departments: list[str] | None = None,
    history: list[dict] | None = None,
) -> tuple[list[Document], bool]:
    """Full retrieval pipeline. Returns (docs, low_confidence)."""
    # [QUERY REWRITE] resolves follow-up references using history, then cleans.
    effective_q = _rewrite_query(question, history=history) if QUERY_REWRITE_ENABLED else question

    docs = hybrid_retrieve(
        effective_q, k=k,
        department=department, allowed_departments=allowed_departments,
    )
    if not docs:
        return [], False

    # [RERANKER] cross-encoder rescore + reorder the fused pool.
    scores: list[float] | None = None
    if RERANKER_ENABLED:
        scores = _score_pairs(effective_q, docs)
        ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
        docs = [d for d, _ in ranked]
        scores = [s for _, s in ranked]

    # [CRAG] Drop chunks below threshold; flag low-confidence if too few survive.
    low_confidence = False
    if CRAG_ENABLED:
        if scores is None:
            scores = _score_pairs(effective_q, docs)
        kept = [(d, s) for d, s in zip(docs, scores) if s >= CRAG_THRESHOLD]
        if len(kept) < CRAG_MIN_CHUNKS:
            low_confidence = True
            # Fall back to top-k of the unfiltered list so we still answer.
            kept_docs = docs[:k]
        else:
            kept_docs = [d for d, _ in kept][:k]
        return kept_docs, low_confidence

    return docs[:k], low_confidence


# ── Context formatter ────────────────────────────────────────────────────

def _format_context(docs: list[Document]) -> str:
    parts = []
    for i, d in enumerate(docs, 1):
        src = d.metadata.get("source", "?")
        page = d.metadata.get("page", d.metadata.get("page_number", "?"))
        parts.append(f"[{i}] {src} (page {page})\n{d.page_content}")
    return "\n\n".join(parts)


def _format_history(history: list[dict], max_turns: int = 6) -> str:
    """Format last N conversation turns for the system prompt."""
    if not history:
        return ""
    recent = history[-(max_turns * 2):]
    lines = ["Previous conversation:"]
    for msg in recent:
        role = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"{role}: {msg['content']}")
    lines.append("")
    return "\n".join(lines) + "\n"


# ── Public API ───────────────────────────────────────────────────────────

def retrieve(
    question: str,
    k: int = TOP_K,
    department: str | None = None,
    allowed_departments: list[str] | None = None,
    history: list[dict] | None = None,
) -> list[Document]:
    docs, _ = _retrieve_pipeline(
        question, k=k,
        department=department, allowed_departments=allowed_departments,
        history=history,
    )
    return docs


def answer_stream(
    question: str,
    model: str = None,
    history: list[dict] | None = None,
    department: str | None = None,
    allowed_departments: list[str] | None = None,
) -> Iterator[str]:
    docs, low_confidence = _retrieve_pipeline(
        question,
        department=department, allowed_departments=allowed_departments,
        history=history,
    )
    if not docs:
        scope = f" for the **{department}** department" if department and department.lower() != "all" else ""
        yield f"I couldn't find this in the uploaded documents{scope}."
        return

    # [CRAG] Prepend low-confidence warning if filtering thinned the pool.
    if low_confidence:
        yield ("⚠️ *Low-confidence answer — limited relevant context was found "
               "for this question. Please verify against the cited sources.*\n\n")

    context = _format_context(docs)
    history_block = _format_history(history or [])

    llm = _get_llm(model)
    prompt = ChatPromptTemplate.from_messages(
        [("system", SYSTEM_PROMPT), ("user", USER_PROMPT)]
    )
    chain = prompt | llm
    for chunk in chain.stream(
        {"context": context, "question": question, "history_block": history_block}
    ):
        yield chunk.content


def check_answer_grounding(
    answer: str,
    docs: list[Document],
    model: str | None = None,
) -> dict:
    """Post-generation faithfulness check: classify each answer claim as grounded or not.

    Uses an LLM judge to split the answer into atomic claims and verify each
    against the retrieved chunks.  Surfaces ungrounded sentences so the UI can
    flag them to the user without altering the answer text.

    Returns:
        grounded   — sentences directly supported by context
        ungrounded — sentences with no support in retrieved chunks
        score      — fraction grounded (1.0 = fully faithful, no hallucination)
        warning    — True when any ungrounded sentences exist
    """
    if not answer.strip() or not docs:
        return {"grounded": [], "ungrounded": [], "score": 1.0, "warning": False}

    context = "\n\n".join(
        f"[{i}] {d.metadata.get('source', '?')}\n{d.page_content}"
        for i, d in enumerate(docs, 1)
    )[:4000]

    try:
        llm = _get_llm(model, streaming=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "You verify whether an AI-generated answer is grounded in a given context. "
             "Split the answer into individual factual claims or sentences. "
             "Classify each as GROUNDED (directly supported by context) or "
             "UNGROUNDED (not present in or contradicted by context). "
             "Reply with ONLY valid JSON — no markdown, no explanation:\n"
             '{"grounded": ["..."], "ungrounded": ["..."]}'),
            ("user",
             f"Context:\n{context}\n\n"
             f"Answer to verify:\n{answer}"),
        ])
        raw = (prompt | llm).invoke({}).content.strip()
        # Strip markdown code fences if the model wraps its output.
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json\n"):
                raw = raw[5:]
        parsed = json.loads(raw)
        grounded = [s for s in parsed.get("grounded", []) if s]
        ungrounded = [s for s in parsed.get("ungrounded", []) if s]
        total = len(grounded) + len(ungrounded)
        score = len(grounded) / total if total else 1.0
        return {
            "grounded": grounded,
            "ungrounded": ungrounded,
            "score": round(score, 3),
            "warning": len(ungrounded) > 0,
        }
    except Exception:
        # Safe fallback — never disrupt the chat flow on LLM or parse errors.
        return {"grounded": [], "ungrounded": [], "score": 1.0, "warning": False}


def generate_doc_summary(file_name: str, model: str = None) -> str:
    """Auto-summarize a document right after ingestion."""
    vs = get_vectorstore()
    try:
        results = vs._collection.get(
            where={"source": file_name},
            include=["documents"],
            limit=8,
        )
        chunks = results.get("documents", [])
    except Exception:
        chunks = []

    if not chunks:
        return "No content found to summarize."

    combined = "\n\n".join(chunks[:6])[:4000]
    llm = _get_llm(model)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a concise document summarizer."),
        ("user", (
            "Summarize this document in 4-5 bullet points. "
            "Focus on key facts, policies, numbers, and important rules.\n\n"
            f"Document: {file_name}\n\nContent:\n{combined}\n\nSummary:"
        )),
    ])
    response = (prompt | llm).invoke({})
    return response.content


# ── Answer grounding check ───────────────────────────────────────────────

_GROUNDING_SYSTEM = """\
You are a strict fact-checker. Classify each sentence in the answer as
GROUNDED (supported by context) or UNGROUNDED (not supported or contradicted).

Return JSON only, exactly:
{"grounded": ["sentence..."], "ungrounded": ["sentence..."]}
No markdown fences, no extra keys."""

_GROUNDING_USER = """\
CONTEXT:
{context}

ANSWER:
{answer}

Classify each sentence. Return JSON only."""


def check_answer_grounding(answer: str, docs: list, model: str = None) -> dict:
    """Return {grounded, ungrounded, score, warning} for the given answer."""
    try:
        context = "\n\n".join(d.page_content[:600] for d in docs[:5])
        llm = _get_llm(model, streaming=False)
        prompt = ChatPromptTemplate.from_messages([
            ("system", _GROUNDING_SYSTEM),
            ("user", _GROUNDING_USER),
        ])
        response = (prompt | llm).invoke({"context": context, "answer": answer})
        raw = response.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        grounded = parsed.get("grounded", [])
        ungrounded = parsed.get("ungrounded", [])
        total = len(grounded) + len(ungrounded)
        score = len(grounded) / total if total > 0 else 1.0
        return {
            "grounded": grounded,
            "ungrounded": ungrounded,
            "score": round(score, 2),
            "warning": score < 0.8 and len(ungrounded) > 0,
        }
    except Exception:
        return {"grounded": [], "ungrounded": [], "score": 1.0, "warning": False}
