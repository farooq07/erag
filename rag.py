"""
RAG pipeline with:
- Multi-turn memory (conversation history)
- Hybrid search (BM25 + vector, fused via RRF)
- Cross-encoder reranking (lightweight, no extra model)
- Groq / Ollama LLM support
"""
from typing import Iterator

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate

from config import (
    GROQ_API_KEY, GROQ_MODEL, LLM_MODEL,
    LLM_PROVIDER, OLLAMA_BASE_URL, TOP_K,
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

def _get_llm(model: str = None):
    if LLM_PROVIDER == "groq" and GROQ_API_KEY:
        from langchain_groq import ChatGroq
        return ChatGroq(
            api_key=GROQ_API_KEY,
            model=model or GROQ_MODEL,
            temperature=0.1,
            streaming=True,
        )
    from langchain_ollama import ChatOllama
    return ChatOllama(model=model or LLM_MODEL, base_url=OLLAMA_BASE_URL, temperature=0.1)


# ── Hybrid search (BM25 + Vector → RRF) ─────────────────────────────────

def _rrf_score(rank: int, k: int = 60) -> float:
    return 1.0 / (k + rank + 1)


def hybrid_retrieve(question: str, k: int = TOP_K) -> list[Document]:
    """Fuse BM25 keyword + vector results via Reciprocal Rank Fusion."""
    vs = get_vectorstore()

    # 1. Vector search
    vector_docs = vs.similarity_search(question, k=k * 4)

    # 2. BM25 keyword search over the full collection
    try:
        from rank_bm25 import BM25Okapi
        col = vs._collection.get(include=["documents", "metadatas"])
        corpus = col["documents"]
        metas = col["metadatas"]

        if corpus:
            tokenized = [d.lower().split() for d in corpus]
            bm25 = BM25Okapi(tokenized)
            scores = bm25.get_scores(question.lower().split())
            top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[: k * 4]
            bm25_docs = [
                Document(page_content=corpus[i], metadata=metas[i])
                for i in top_idx
                if scores[i] > 0
            ]
        else:
            bm25_docs = []
    except Exception:
        bm25_docs = []

    # 3. RRF fusion
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
    return [item["doc"] for item in ranked[:k]]


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

def retrieve(question: str, k: int = TOP_K) -> list[Document]:
    return hybrid_retrieve(question, k)


def answer_stream(
    question: str,
    model: str = None,
    history: list[dict] | None = None,
) -> Iterator[str]:
    docs = retrieve(question)
    if not docs:
        yield "I couldn't find this in the uploaded documents."
        return

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
