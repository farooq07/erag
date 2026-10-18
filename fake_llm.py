import re
from typing import Any, Iterator

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult


def _parse_prompt(messages: list[BaseMessage]) -> str:
    system_text = ""
    user_text = ""
    full_prompt = ""

    for m in messages:
        text = m.content if isinstance(m.content, str) else str(m.content)
        full_prompt += "\n" + text
        m_type = getattr(m, "type", "")
        if m_type == "system" or isinstance(m, SystemMessage):
            system_text += "\n" + text
        elif m_type in ("human", "user") or isinstance(m, HumanMessage):
            user_text += "\n" + text

    sys_lower = system_text.lower()
    full_lower = full_prompt.lower()

    # System message contains "rewrite" -> returns the latest question unchanged
    if "rewrite" in sys_lower:
        if "Latest question:" in user_text:
            return user_text.split("Latest question:")[-1].strip()
        return user_text.strip()

    # System message contains "fact-checker" or "grounded"
    if "fact-checker" in sys_lower or "grounded" in sys_lower:
        return '{"grounded": [], "ungrounded": []}'

    # Prompt contains "Context from documents:"
    if "context from documents:" in full_lower:
        from rag import NO_ANSWER

        match = re.search(r"\[1\]\s+([^\s\(\n]+)", full_prompt)
        if not match:
            return NO_ANSWER + "."
        source = match.group(1)

        chunk_match = re.search(r"\[1\]\s+[^\n]+\n([\s\S]*?)(?=(?:\n\s*\[2\]|\n─+|\nQuestion:|$))", full_prompt)
        first_sentence = ""
        if chunk_match:
            chunk_body = chunk_match.group(1).strip()
            sents = re.split(r"(?<=[.!?])\s+|\n+", chunk_body)
            first_sentence = sents[0].strip() if sents else ""

        return f"From {source}: {first_sentence} [1]"

    # Otherwise -> "- Summary unavailable in test mode"
    return "- Summary unavailable in test mode"


class EchoChatModel(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "echo"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        text = _parse_prompt(messages)
        message = AIMessage(content=text)
        generation = ChatGeneration(message=message)
        return ChatResult(generations=[generation])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        text = _parse_prompt(messages)
        words = text.split(" ")
        for i, word in enumerate(words):
            token = word if i == len(words) - 1 else word + " "
            chunk = ChatGenerationChunk(message=AIMessageChunk(content=token))
            if run_manager:
                run_manager.on_llm_new_token(token, chunk=chunk)
            yield chunk
