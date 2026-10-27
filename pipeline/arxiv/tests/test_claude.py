from types import SimpleNamespace, TracebackType
from typing import Any

import pytest

from arxiv_corpus import claude, naming


class _Stream:
    def __init__(self, message: Any) -> None:
        self.message = message

    def __enter__(self) -> "_Stream":
        return self

    def __exit__(
        self, _kind: type[BaseException] | None, _error: BaseException | None, _trace: TracebackType | None
    ) -> None:
        return None

    def get_final_message(self) -> Any:
        return self.message


class _Client:
    def __init__(self, message: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self.messages = SimpleNamespace(stream=self._stream)
        self._message = message

    def _stream(self, **keywords: Any) -> _Stream:
        self.calls.append(keywords)
        return _Stream(self._message)


def _message(stop_reason: str = "end_turn") -> Any:
    return SimpleNamespace(
        stop_reason=stop_reason,
        model="claude-opus-5-5",
        usage=SimpleNamespace(input_tokens=1200, output_tokens=300),
        content=[
            SimpleNamespace(type="thinking", thinking="hmm"),
            SimpleNamespace(type="text", text='{"names": '),
            SimpleNamespace(type="text", text='{"a": "Robot Hands"}}'),
        ],
    )


SCHEMA = {"type": "object"}


def test_ask_with_streams_one_user_message_with_adaptive_thinking_and_a_json_schema() -> None:
    client = _Client(_message())
    claude.ask_with(client, "claude-opus-5-5", "Name these", SCHEMA)
    assert client.calls == [
        {
            "model": "claude-opus-5-5",
            "max_tokens": claude.MAXIMUM_TOKENS,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": "Name these"}],
        }
    ]


def test_ask_with_joins_only_the_text_blocks_and_carries_the_model_and_usage() -> None:
    answer = claude.ask_with(_Client(_message()), "claude-opus-5-5", "Name these", SCHEMA)
    assert answer == naming.Answer('{"names": {"a": "Robot Hands"}}', "claude-opus-5-5", 1200, 300)


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_ask_with_refuses_an_answer_that_stopped_early(stop_reason: str) -> None:
    with pytest.raises(naming.NamingError, match=stop_reason):
        claude.ask_with(_Client(_message(stop_reason)), "claude-opus-5-5", "Name these", SCHEMA)


def test_the_naming_model_is_opus() -> None:
    assert claude.NAMING_MODEL == "claude-opus-5-5"
