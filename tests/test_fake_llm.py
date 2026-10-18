from langchain_core.documents import Document
import rag


def test_rewrite_returns_question():
    assert rag._rewrite_query("How many leave days?") == "How many leave days?"


def test_answer_cites_first_source():
    docs = [
        Document(
            page_content="HR Leave Policy 2024 › 1. Annual Leave\nAll staff get 25 days. More text.",
            metadata={"source": "HR_Leave_Policy.md", "page": 1},
        ),
        Document(
            page_content="Some other policy text.",
            metadata={"source": "Other_Policy.md", "page": 2},
        ),
    ]
    ans = rag.generate_answer("q", docs)
    assert "HR_Leave_Policy.md" in ans
    assert "[1]" in ans


def test_no_docs_returns_no_answer():
    ans = rag.generate_answer("q", [])
    assert ans.startswith(rag.NO_ANSWER)


def test_stream_yields_multiple_tokens():
    docs = [
        Document(
            page_content="HR Leave Policy 2024 › 1. Annual Leave\nAll staff get 25 days. More text.",
            metadata={"source": "HR_Leave_Policy.md", "page": 1},
        ),
    ]
    tokens = list(rag.generate_answer_stream("q", docs))
    assert len(tokens) > 1
