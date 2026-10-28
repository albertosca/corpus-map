import json
import subprocess
from collections.abc import Sequence
from typing import Any

import pytest

from arxiv_corpus import claude_code, naming

SCHEMA = {"type": "object", "properties": {"names": {"type": "object"}}, "required": ["names"]}


def _result(**overrides: Any) -> str:
    body: dict[str, Any] = {
        "type": "result",
        "subtype": "success",
        "is_error": False,
        "result": '{"names": {"a": "Robot Hands"}}',
        "structured_output": {"names": {"a": "Robot Hands"}},
        "usage": {
            "input_tokens": 2,
            "cache_creation_input_tokens": 1100,
            "cache_read_input_tokens": 300,
            "output_tokens": 450,
        },
        "modelUsage": {"claude-opus-5-5": {"inputTokens": 2, "outputTokens": 450}},
    }
    body.update(overrides)
    return json.dumps(body)


class _Runner:
    def __init__(self, completed: claude_code.Completed) -> None:
        self.completed = completed
        self.calls: list[tuple[list[str], str]] = []

    def __call__(self, arguments: Sequence[str], standard_input: str) -> claude_code.Completed:
        self.calls.append((list(arguments), standard_input))
        return self.completed


def _ok(stdout: str | None = None) -> _Runner:
    return _Runner(claude_code.Completed(0, stdout if stdout is not None else _result(), ""))


def test_ask_through_runs_claude_headless_without_tools_context_or_a_saved_session() -> None:
    runner = _ok()
    claude_code.ask_through(runner, "claude-opus-5-5", "Name these", SCHEMA)
    [(arguments, standard_input)] = runner.calls
    assert arguments == [
        "claude",
        "-p",
        "--safe-mode",
        "--strict-mcp-config",
        "--system-prompt",
        claude_code.SYSTEM_PROMPT,
        "--tools",
        "",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--model",
        "claude-opus-5-5",
        "--effort",
        "high",
        "--json-schema",
        json.dumps(SCHEMA),
    ]
    assert standard_input == "Name these"


def test_ask_through_returns_the_structured_output_as_text_with_the_model_and_all_input_tokens() -> None:
    answer = claude_code.ask_through(_ok(), "claude-opus-5-5", "Name these", SCHEMA)
    assert answer == naming.Answer('{"names": {"a": "Robot Hands"}}', "claude-opus-5-5", 1402, 450)


def test_ask_through_reports_a_failed_command_with_its_error_output() -> None:
    runner = _Runner(claude_code.Completed(1, "", "Not logged in\n"))
    with pytest.raises(naming.NamingError, match="exited 1: Not logged in"):
        claude_code.ask_through(runner, "claude-opus-5-5", "Name these", SCHEMA)


@pytest.mark.parametrize("stdout", ["", "not json", "[1, 2]"])
def test_ask_through_refuses_output_that_is_not_one_json_result(stdout: str) -> None:
    with pytest.raises(naming.NamingError, match="no JSON result"):
        claude_code.ask_through(_ok(stdout), "claude-opus-5-5", "Name these", SCHEMA)


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_error": True},
        {"subtype": "error_max_structured_output_retries"},
    ],
)
def test_ask_through_refuses_a_result_that_reports_an_error(overrides: dict[str, Any]) -> None:
    with pytest.raises(naming.NamingError, match="claude -p failed"):
        claude_code.ask_through(_ok(_result(**overrides)), "claude-opus-5-5", "Name these", SCHEMA)


@pytest.mark.parametrize("structured", [None, "names", ["a"]])
def test_ask_through_refuses_a_result_without_a_structured_object(structured: object) -> None:
    with pytest.raises(naming.NamingError, match="no structured output"):
        claude_code.ask_through(_ok(_result(structured_output=structured)), "claude-opus-5-5", "Name these", SCHEMA)


def test_ask_through_refuses_an_answer_from_another_model() -> None:
    stdout = _result(modelUsage={"claude-sonnet-5-5": {}})
    with pytest.raises(naming.NamingError, match="claude-sonnet-5-5"):
        claude_code.ask_through(_ok(stdout), "claude-opus-5-5", "Name these", SCHEMA)


def test_child_environment_drops_the_api_key_so_the_call_uses_the_subscription() -> None:
    environment = {"PATH": "/bin", "ANTHROPIC_API_KEY": "secret", "HOME": "/home"}
    assert claude_code.child_environment(environment) == {"PATH": "/bin", "HOME": "/home"}
    assert "ANTHROPIC_API_KEY" in environment


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (subprocess.TimeoutExpired(["claude"], claude_code.TIMEOUT_SECONDS), "timed out"),
        (FileNotFoundError(2, "No such file or directory", "claude"), "could not run"),
    ],
)
def test_ask_through_reports_a_command_that_never_finished_as_a_naming_error(error: Exception, message: str) -> None:
    def failing(_arguments: Sequence[str], _standard_input: str) -> claude_code.Completed:
        raise error

    with pytest.raises(naming.NamingError, match=message):
        claude_code.ask_through(failing, "claude-opus-5-5", "Name these", SCHEMA)


def test_child_environment_drops_every_variable_that_routes_the_call_off_the_subscription() -> None:
    routing = {
        "ANTHROPIC_API_KEY": "secret",
        "ANTHROPIC_AUTH_TOKEN": "token",
        "ANTHROPIC_BASE_URL": "https://proxy.example",
        "CLAUDE_CODE_USE_BEDROCK": "1",
        "CLAUDE_CODE_USE_VERTEX": "1",
    }
    assert claude_code.child_environment({"PATH": "/bin", **routing}) == {"PATH": "/bin"}
