"""Claude names the clusters (spec 2026-10-27, section 2.2): the prompt, the answer schema, the checks.

Every answer is checked, never fixed: a missing or extra id, a repeated name (in any case), a name with
surrounding spaces, one over the length limit, or "Other" stops the stage with the raw answer in the error.
"""

import json
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

PROMPT_VERSION = 1
LEAF_NAME_MAXIMUM_LENGTH = 32
# The library's group-name budget (src/shared, GROUP_NAME_MAXIMUM_LENGTH).
GROUP_NAME_MAXIMUM_LENGTH = 24
# Every prompt ends with this marker and its input as JSON, so a test double can read what was asked.
INPUT_MARKER = "Input (JSON):"

Level = Literal["leaf", "group"]

_MAXIMUM_LENGTH: dict[Level, int] = {"leaf": LEAF_NAME_MAXIMUM_LENGTH, "group": GROUP_NAME_MAXIMUM_LENGTH}

_RULES: dict[Level, str] = {
    "leaf": (
        "Each entry is a region of a map of recent arXiv computer-science papers, placed by what their abstracts"
        " say; you see its most central titles, its most distinctive words, its arXiv categories and its size."
        " Name every region in at most {limit} characters, in English, so a reader can guess which papers lie"
        " there: name what its papers share, not the arXiv category that happens to be largest."
    ),
    "group": (
        "Each entry is a family of neighbouring regions of a map of recent arXiv computer-science papers; you see"
        " its regions' names, its most central titles, its most distinctive words, its arXiv categories and its"
        " size. Name every family in at most {limit} characters, in English, broader than its regions' names, so"
        " a reader can guess which papers lie there."
    ),
}


@dataclass(frozen=True)
class Answer:
    text: str
    model: str
    input_tokens: int
    output_tokens: int


# (prompt, JSON schema of the answer) -> the answer.
Ask = Callable[[str, dict[str, Any]], Answer]


class NamingError(ValueError):
    """An answer that breaks the contract; carries the raw text so the report shows what came back."""

    def __init__(self, reason: str, raw: str) -> None:
        super().__init__(f"{reason}; raw answer: {raw}")
        self.raw = raw


@dataclass(frozen=True)
class Feedback:
    """A blind-test failure shown when re-naming: the share matched and titles that went elsewhere."""

    share: float
    lost: list[tuple[str, str]]


def names_schema(ids: Sequence[str], maximum_length: int) -> dict[str, Any]:
    """The answer's shape, the length limit included: the prompt alone does not hold Claude to it."""
    return {
        "type": "object",
        "properties": {
            "names": {
                "type": "object",
                "properties": {
                    identifier: {"type": "string", "minLength": 1, "maxLength": maximum_length} for identifier in ids
                },
                "required": list(ids),
                "additionalProperties": False,
            }
        },
        "required": ["names"],
        "additionalProperties": False,
    }


def naming_prompt(
    level: Level,
    entries: Mapping[str, Mapping[str, object]],
    taken: Mapping[str, str] | None = None,
    feedback: Mapping[str, Feedback] | None = None,
) -> str:
    taken = taken or {}
    feedback = feedback or {}
    parts = [
        _RULES[level].format(limit=_MAXIMUM_LENGTH[level]),
        'Names must differ from each other and from the names listed under "taken". Never use "Other" or a catch-all.',
    ]
    if feedback:
        parts.append(
            'Some entries were named before and tested blind: under "feedback", each shows the share of its own'
            " papers readers placed in it and titles that went to another name. Those names were tried; find"
            " names that tell these papers apart."
        )
    parts.append(f'Answer with JSON only: {{"names": {{"<id>": "<name>"}}}}. (prompt version {PROMPT_VERSION})')
    payload = {
        "kind": level,
        "taken": sorted(taken.values()),
        "feedback": {
            identifier: {
                "share": item.share,
                "lost": [{"title": title, "chosen": chosen} for title, chosen in item.lost],
            }
            for identifier, item in feedback.items()
        },
        "entries": entries,
    }
    parts.append(f"{INPUT_MARKER}\n{json.dumps(payload, indent=1)}")
    return "\n\n".join(parts)


def parse_names(text: str, ids: Sequence[str], maximum_length: int, taken_names: Iterable[str] = ()) -> dict[str, str]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise NamingError("the answer is not JSON", text) from None
    names = parsed.get("names") if isinstance(parsed, dict) else None
    if not isinstance(names, dict):
        raise NamingError("the answer has no names object", text)
    missing = sorted(set(ids) - set(names))
    if missing:
        raise NamingError(f"the answer has missing ids {missing}", text)
    unexpected = sorted(set(names) - set(ids))
    if unexpected:
        raise NamingError(f"the answer has unexpected ids {unexpected}", text)
    seen = {name.casefold() for name in taken_names}
    result: dict[str, str] = {}
    for identifier in ids:
        name = names[identifier]
        if not isinstance(name, str):
            raise NamingError(f"the name for {identifier} is not a string", text)
        if not name:
            raise NamingError(f"the name for {identifier} is empty", text)
        if name != name.strip():
            raise NamingError(f"the name for {identifier} has surrounding spaces", text)
        if len(name) > maximum_length:
            raise NamingError(f"the name for {identifier} is longer than {maximum_length} characters", text)
        if name.split()[0].casefold() == "other":
            raise NamingError(f'the name for {identifier} uses "Other"', text)
        if name.casefold() in seen:
            raise NamingError(f"the name for {identifier} is repeated: {name!r}", text)
        seen.add(name.casefold())
        result[identifier] = name
    return result


def request_names(
    ask: Ask,
    level: Level,
    entries: Mapping[str, Mapping[str, object]],
    taken: Mapping[str, str] | None = None,
    feedback: Mapping[str, Feedback] | None = None,
) -> tuple[dict[str, str], Answer]:
    ids = list(entries)
    answer = ask(naming_prompt(level, entries, taken, feedback), names_schema(ids, _MAXIMUM_LENGTH[level]))
    names = parse_names(answer.text, ids, _MAXIMUM_LENGTH[level], (taken or {}).values())
    return names, answer
