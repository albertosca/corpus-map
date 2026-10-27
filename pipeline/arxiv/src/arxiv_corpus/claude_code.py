"""The same Claude call as `claude.py`, through Claude Code's headless mode on the owner's subscription.

`claude -p` with structured output held to the caller's schema. `--safe-mode`, `--strict-mcp-config`, a
one-line system prompt and no tools keep the call to the prompt alone (the default context is over a hundred
thousand tokens of agent instructions); no session is saved. The child never sees ANTHROPIC_API_KEY, which
would otherwise route the call to the API instead of the subscription. Token counts are what the CLI reports:
input includes the cached prompt it writes and reads.
"""

import json
import os
import subprocess
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from arxiv_corpus.claude import NAMING_MODEL
from arxiv_corpus.naming import Answer, Ask, NamingError

SYSTEM_PROMPT = "You name clusters of research papers. Answer only with the JSON the schema asks for."
TIMEOUT_SECONDS = 1800


@dataclass(frozen=True)
class Completed:
    exit_code: int
    stdout: str
    stderr: str


Run = Callable[[Sequence[str], str], Completed]


def command(model: str, schema: dict[str, Any]) -> list[str]:
    return [
        "claude",
        "-p",
        "--safe-mode",
        "--strict-mcp-config",
        "--system-prompt",
        SYSTEM_PROMPT,
        "--tools",
        "",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--model",
        model,
        "--effort",
        "high",
        "--json-schema",
        json.dumps(schema),
    ]


def ask_through(run: Run, model: str, prompt: str, schema: dict[str, Any]) -> Answer:
    completed = run(command(model, schema), prompt)
    if completed.exit_code != 0:
        raise NamingError(f"claude -p exited {completed.exit_code}: {completed.stderr.strip()}", completed.stdout)
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError:
        result = None
    if not isinstance(result, dict):
        raise NamingError("claude -p printed no JSON result", completed.stdout)
    raw = str(result.get("result", ""))
    if result.get("is_error") or result.get("subtype") != "success":
        raise NamingError(f"claude -p failed ({result.get('subtype')})", raw)
    structured = result.get("structured_output")
    if not isinstance(structured, dict):
        raise NamingError("claude -p returned no structured output", raw)
    models = sorted(result.get("modelUsage") or {})
    if models != [model]:
        raise NamingError(f"claude -p answered with {', '.join(models)}, not {model}", raw)
    usage = result.get("usage") or {}
    input_tokens = sum(
        int(usage.get(key, 0)) for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
    )
    return Answer(json.dumps(structured), model, input_tokens, int(usage.get("output_tokens", 0)))


def child_environment(environment: Mapping[str, str]) -> dict[str, str]:
    return {key: value for key, value in environment.items() if key != "ANTHROPIC_API_KEY"}


def subscription_ask(model: str = NAMING_MODEL) -> Ask:  # pragma: no cover -- spawns the real CLI
    """The real `Ask` through `claude -p`, logged in to the owner's subscription."""

    def run(arguments: Sequence[str], standard_input: str) -> Completed:
        finished = subprocess.run(
            list(arguments),
            input=standard_input,
            capture_output=True,
            text=True,
            env=child_environment(os.environ),
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
        return Completed(finished.returncode, finished.stdout, finished.stderr)

    return lambda prompt, schema: ask_through(run, model, prompt, schema)
