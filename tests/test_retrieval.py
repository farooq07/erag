"""
Fast unit tests for retrieval building blocks (no model calls, no index).
Each test pins down a bug the eval set exposed.
"""
from pathlib import Path

from langchain_core.documents import Document

import ingest
import rag

ROOT = Path(__file__).resolve().parent.parent


# ── BM25 tokenisation ────────────────────────────────────────────────────

def test_punctuation_does_not_glue_to_words():
    # "ESOP:" and "Net-zero" used to become the tokens "esop:" / "net-zero".
    assert {"esop", "net", "zero"} <= set(rag._bm25_tokens("**ESOP:** Net-zero carbon"))


def test_codes_and_numbers_survive():
    tokens = rag._bm25_tokens("Form IT-14 (Q1: 304), £2,000 and 18.4m")
    assert {"it", "14", "q1", "304", "2000", "18.4"} <= set(tokens)


def test_thousands_separator_matches_plain_number():
    assert "2000" in rag._bm25_tokens("over £2,000") and "2000" in rag._bm25_tokens("2000")


def test_question_filler_is_dropped():
    assert rag._bm25_tokens("What is the policy?") == ["policy"]


# ── Section-aware chunking ───────────────────────────────────────────────

def _chunks(path):
    docs, pre_chunked = ingest._loader_for(path)
    return ingest._split(docs, path.name, "Operations", [], pre_chunked)


def test_markdown_splits_one_section_per_chunk():
    chunks = _chunks(ROOT / "demo" / "Operations_SOPs.md")
    first_lines = [c.page_content.splitlines()[0] for c in chunks]
    assert "Operations Standard Operating Procedures › 2. Procurement Thresholds" in first_lines
    # The procurement table stays with its heading.
    table = next(c for c in chunks if "Procurement Thresholds" in c.page_content.splitlines()[0])
    assert "£25,001 – £100,000 | CFO" in table.page_content
    # The environmental section is its own chunk, not glued to fire safety.
    env = next(c for c in chunks if "Environmental" in c.page_content.splitlines()[0])
    assert "2035" in env.page_content and "Fire evacuation" not in env.page_content


def test_chunks_have_unique_ids_and_metadata():
    chunks = _chunks(ROOT / "demo" / "Company_Handbook.md")
    assert [c.metadata["chunk_id"] for c in chunks] == list(range(len(chunks)))
    assert all(c.metadata["department"] == "Operations" and c.metadata["source"] == "Company_Handbook.md"
               for c in chunks)


def test_long_section_is_sub_split_with_location_kept():
    body = "## 1. Long\n\n" + ("A sentence about policy. " * 120)
    doc = Document(page_content="# Acme Corp — Test Doc\n\nIntro.\n\n" + body + "\n## 2. Short\n\nEnd.", metadata={})
    chunks = ingest._split([doc], "test.md", "General", [])
    long_parts = [c for c in chunks if c.page_content.startswith("Test Doc › 1. Long")]
    assert len(long_parts) > 1
    assert all(len(c.page_content) <= ingest.CHUNK_SIZE + 60 for c in long_parts)


def test_plain_text_gets_title_prefix():
    doc = Document(page_content="Just a paragraph of text with no headings.", metadata={"page": 0})
    (chunk,) = ingest._split([doc], "Board_Minutes.pdf", "Legal", [])
    assert chunk.page_content.startswith("Board Minutes (page 1)\n")
