"""The blind test (spec 2026-10-27, section 2.3): can a reader who sees only the names place unseen titles?

Held-out titles (never the central ones the namer saw) are shuffled and shown with the names alone; the
answer gives each title one name. The score is the share placed under the right name, per id and overall,
and the lift (overall share times the number of names; 1.0 is chance) so different name lists compare.
"""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from arxiv_corpus.naming import INPUT_MARKER, Answer, Ask, Feedback, NamingError

SEED = 20261027
HELD_OUT_PER_LEAF = 20
LEAF_FLOOR = 0.40
OVERALL_FLOOR = 0.60
GROUP_FLOOR = 0.70
MAXIMUM_RENAMES = 2
# Lost titles shown per failing id when re-naming: enough to see the confusion, short enough to read.
LOST_TITLES_SHOWN = 10


@dataclass(frozen=True)
class Score:
    shares: dict[str, float | None]
    overall: float
    lift: float
    lost: dict[str, list[tuple[str, str]]]


Gate = Callable[[Score], tuple[bool, set[str]]]
# (failing ids, names kept, feedback per failing id) -> (new names for the failing ids, the answer).
Rename = Callable[[set[str], dict[str, str], dict[str, Feedback]], tuple[dict[str, str], Answer]]


@dataclass(frozen=True)
class LevelResult:
    names: dict[str, str]
    passed: bool
    attempts: list[dict[str, object]] = field(default_factory=list)
    answers: list[Answer] = field(default_factory=list)


def held_out(
    leaf_members: Mapping[str, Sequence[int]],
    central: Mapping[str, Sequence[int]],
    per_leaf: int = HELD_OUT_PER_LEAF,
    seed: int = SEED,
) -> list[int]:
    generator = np.random.default_rng(seed)
    drawn: list[int] = []
    for identifier, members in leaf_members.items():
        candidates = sorted(set(members) - set(central[identifier]))
        if candidates:
            chosen = generator.choice(candidates, size=min(per_leaf, len(candidates)), replace=False)
            drawn.extend(int(index) for index in chosen)
    return [drawn[position] for position in generator.permutation(len(drawn))]


def check_prompt(titles: Sequence[str], names: Sequence[str]) -> str:
    payload = {
        "kind": "check",
        "names": list(names),
        "titles": [{"number": number, "title": title} for number, title in enumerate(titles, start=1)],
    }
    return "\n\n".join(
        [
            "Each name below is a region of a map of recent arXiv computer-science papers. For every numbered"
            " paper title, choose the one name of the region it most likely lies in. Use only the names given,"
            " exactly as written, and answer every number once.",
            'Answer with JSON only: {"answers": [{"number": <number>, "name": "<name>"}]}.',
            f"{INPUT_MARKER}\n{json.dumps(payload, indent=1)}",
        ]
    )


def answers_schema(names: Sequence[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "answers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"number": {"type": "integer"}, "name": {"type": "string", "enum": list(names)}},
                    "required": ["number", "name"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["answers"],
        "additionalProperties": False,
    }


def parse_answers(text: str, title_count: int, names: Sequence[str]) -> list[str]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise NamingError("the check answer is not JSON", text) from None
    answers = parsed.get("answers") if isinstance(parsed, dict) else None
    if not isinstance(answers, list):
        raise NamingError("the check answer has no answers list", text)
    offered = set(names)
    by_number: dict[int, str] = {}
    for item in answers:
        number = item.get("number") if isinstance(item, dict) else None
        name = item.get("name") if isinstance(item, dict) else None
        if not isinstance(number, int) or isinstance(number, bool) or not isinstance(name, str):
            raise NamingError(f"the check answer has a malformed answer {item!r}", text)
        if not 1 <= number <= title_count:
            raise NamingError(f"the check answer has title number {number} out of range", text)
        if number in by_number:
            raise NamingError(f"the check answer has title number {number} repeated", text)
        if name not in offered:
            raise NamingError(f"the check answer chose {name!r}, a name not offered", text)
        by_number[number] = name
    missing = [number for number in range(1, title_count + 1) if number not in by_number]
    if missing:
        raise NamingError(f"the check answer has missing title numbers {missing}", text)
    return [by_number[number] for number in range(1, title_count + 1)]


def score(chosen: Sequence[str], truth: Sequence[str], titles: Sequence[str], names: Mapping[str, str]) -> Score:
    """Scores by position: two equal titles from different ids are each held to their own id."""
    if not titles:
        raise ValueError("no held-out titles to test: every cluster's papers are all central")
    matched = dict.fromkeys(names, 0)
    total = dict.fromkeys(names, 0)
    lost: dict[str, list[tuple[str, str]]] = {identifier: [] for identifier in names}
    for title, name, identifier in zip(titles, chosen, truth, strict=True):
        total[identifier] += 1
        if name == names[identifier]:
            matched[identifier] += 1
        else:
            lost[identifier].append((title, name))
    shares = {
        identifier: matched[identifier] / total[identifier] if total[identifier] else None for identifier in names
    }
    overall = sum(matched.values()) / len(titles)
    return Score(shares=shares, overall=overall, lift=overall * len(names), lost=lost)


def run_test(ask: Ask, titles: Sequence[str], truth: Sequence[str], names: Mapping[str, str]) -> tuple[Score, Answer]:
    offered = sorted(names.values())
    answer = ask(check_prompt(titles, offered), answers_schema(offered))
    chosen = parse_answers(answer.text, len(titles), offered)
    return score(chosen, truth, titles, names), answer


def _below(result: Score, floor: float) -> set[str]:
    return {identifier for identifier, share in result.shares.items() if share is not None and share < floor}


def leaf_gate(result: Score, baseline_lift: float) -> tuple[bool, set[str]]:
    """Each leaf at its floor, all together at theirs, and better than the arXiv categories."""
    failing = _below(result, LEAF_FLOOR)
    if result.overall < OVERALL_FLOOR or result.lift <= baseline_lift:
        failing |= _below(result, OVERALL_FLOOR)
        return False, failing
    return not failing, failing


def group_gate(result: Score) -> tuple[bool, set[str]]:
    failing = _below(result, GROUP_FLOOR)
    return not failing, failing


def check_level(
    ask: Ask,
    rename: Rename,
    titles: Sequence[str],
    truth: Sequence[str],
    names: Mapping[str, str],
    gate: Gate,
) -> LevelResult:
    """Tests the names; re-names only the failing ids, at most MAXIMUM_RENAMES times."""
    current = dict(names)
    attempts: list[dict[str, object]] = []
    answers: list[Answer] = []
    for attempt in range(MAXIMUM_RENAMES + 1):
        result, answer = run_test(ask, titles, truth, current)
        answers.append(answer)
        passed, failing = gate(result)
        attempts.append(
            {
                "names": dict(current),
                "shares": result.shares,
                "overall": result.overall,
                "lift": result.lift,
                "failing": sorted(failing),
            }
        )
        if passed or not failing or attempt == MAXIMUM_RENAMES:
            return LevelResult(names=current, passed=passed, attempts=attempts, answers=answers)
        feedback = {
            identifier: Feedback(
                share=result.shares[identifier] or 0.0, lost=result.lost[identifier][:LOST_TITLES_SHOWN]
            )
            for identifier in sorted(failing)
        }
        kept = {identifier: name for identifier, name in current.items() if identifier not in failing}
        renamed, rename_answer = rename(failing, kept, feedback)
        answers.append(rename_answer)
        current.update(renamed)
    raise AssertionError("unreachable: the loop returns on its last attempt")  # pragma: no cover
