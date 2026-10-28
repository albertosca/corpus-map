"""The one Claude call the name and check stages make, through any client shaped like the official SDK's.

Streamed (long answers time out otherwise), adaptive thinking, structured JSON output held to the schema the
caller passes. A refusal or an answer cut at the token limit stops the stage; it is never parsed.
"""

from typing import Any

from arxiv_corpus.naming import Answer, Ask, NamingError

NAMING_MODEL = "claude-opus-5-5"
MAXIMUM_TOKENS = 32_000
_EARLY_STOPS = {"refusal", "max_tokens"}


def ask_with(client: Any, model: str, prompt: str, schema: dict[str, Any]) -> Answer:
    with client.messages.stream(
        model=model,
        max_tokens=MAXIMUM_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        message = stream.get_final_message()
    text = "".join(block.text for block in message.content if block.type == "text")
    if message.stop_reason in _EARLY_STOPS:
        raise NamingError(f"Claude stopped early ({message.stop_reason})", text)
    if message.model != model:
        raise NamingError(f"Claude answered with {message.model}, not {model}", text)
    return Answer(text, message.model, message.usage.input_tokens, message.usage.output_tokens)


def claude_ask(model: str = NAMING_MODEL) -> Ask:  # pragma: no cover -- real client, never built in tests
    """The real `Ask`: builds the SDK client (key from ANTHROPIC_API_KEY) once, when the stage starts."""
    import anthropic  # imported here: the naming extra is only installed for a real run

    client = anthropic.Anthropic()
    return lambda prompt, schema: ask_with(client, model, prompt, schema)
