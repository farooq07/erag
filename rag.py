from typing import Iterator

from langchain_core.prompts import ChatPromptTemplate

from config import (
    GROQ_API_KEY, GROQ_MODEL, LLM_MODEL,
    LLM_PROVIDER, OLLAMA_BASE_URL, TOP_K,
)
from ingest import get_vectorstore

SYSTEM_PROMPT = """You are a helpful office assistant. Answer the user's question using ONLY the context below.

Rules:
- If the answer is not in the context, reply exactly: "I couldn't find this in the uploaded documents."
- Be concise and direct.
- Quote specific facts/numbers when relevant.
- Do NOT invent information."""

USER_PROMPT = """Context from documents:
---
{context}
---

Question: {question}

Answer:"""


def _get_llm(model: str = None):
    if LLM_PROVIDER == "groq" and GROQ_API_KEY:
        from langchain_groq import ChatGroq
        return ChatGroq(
            api_key=GROQ_API_KEY,
            model=model or GROQ_MODEL,
            temperature=0.1,
            streaming=True,
        )
    else:
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model or LLM_MODEL,
            base_url=OLLAMA_BASE_URL,
            temperature=0.1,
        )


def _format_context(docs) -> str:
    parts = []
    for i, d in enumerate(docs, 1):
        src = d.metadata.get("source", "?")
        page = d.metadata.get("page", d.metadata.get("page_number", "?"))
        parts.append(f"[{i}] (source: {src}, page: {page})\n{d.page_content}")
    return "\n\n".join(parts)


def retrieve(question: str, k: int = TOP_K):
    vs = get_vectorstore()
    retriever = vs.as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": k * 4, "lambda_mult": 0.5},
    )
    return retriever.invoke(question)


def answer_stream(question: str, model: str = None) -> Iterator[str]:
    docs = retrieve(question)
    if not docs:
        yield "I couldn't find this in the uploaded documents."
        return

    context = _format_context(docs)
    llm = _get_llm(model)
    prompt = ChatPromptTemplate.from_messages(
        [("system", SYSTEM_PROMPT), ("user", USER_PROMPT)]
    )
    chain = prompt | llm
    for chunk in chain.stream({"context": context, "question": question}):
        yield chunk.content


def answer(question: str, model: str = None) -> tuple[str, list]:
    docs = retrieve(question)
    if not docs:
        return "I couldn't find this in the uploaded documents.", []
    text = "".join(answer_stream(question, model))
    return text, docs
