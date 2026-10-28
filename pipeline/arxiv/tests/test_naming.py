import json
from typing import Any

import pytest

from arxiv_corpus import naming

ENTRIES: dict[str, dict[str, object]] = {
    "g1-l1": {"size": 300, "titles": ["Grasping with tactile hands"], "words": ["grasp"], "categories": {"cs.RO": 0.9}},
    "g1-l2": {"size": 200, "titles": ["Legged locomotion"], "words": ["legged"], "categories": {"cs.RO": 1.0}},
}


def _input_of(prompt: str) -> Any:
    return json.loads(prompt.split(naming.INPUT_MARKER, 1)[1])


def _answer(names: object) -> str:
    return json.dumps({"names": names})


def test_the_leaf_prompt_states_the_rules_and_carries_every_entry() -> None:
    prompt = naming.naming_prompt("leaf", ENTRIES)
    assert f"prompt version {naming.PROMPT_VERSION}" in prompt
    assert f"at most {naming.LEAF_NAME_MAXIMUM_LENGTH} characters" in prompt
    assert 'Never use "Other"' in prompt
    assert "not the arXiv category that happens to be largest" in prompt
    payload = _input_of(prompt)
    assert payload["kind"] == "leaf"
    assert payload["entries"] == ENTRIES
    assert payload["taken"] == []
    assert "tried" not in prompt


def test_the_group_prompt_uses_the_group_length() -> None:
    prompt = naming.naming_prompt("group", ENTRIES)
    assert f"at most {naming.GROUP_NAME_MAXIMUM_LENGTH} characters" in prompt
    assert _input_of(prompt)["kind"] == "group"


def test_a_renaming_prompt_lists_taken_names_and_each_failed_score_with_its_lost_titles() -> None:
    feedback = {"g1-l2": naming.Feedback(share=0.25, lost=[("Legged locomotion", "Robot Hands")])}
    prompt = naming.naming_prompt("leaf", {"g1-l2": ENTRIES["g1-l2"]}, {"g1-l1": "Robot Hands"}, feedback)
    payload = _input_of(prompt)
    assert payload["taken"] == ["Robot Hands"]
    assert payload["feedback"] == {
        "g1-l2": {"share": 0.25, "lost": [{"title": "Legged locomotion", "chosen": "Robot Hands"}]}
    }
    assert "tried" in prompt


def test_names_schema_requires_exactly_the_ids() -> None:
    schema = naming.names_schema(["a", "b"], 32)
    names = schema["properties"]["names"]
    assert names["required"] == ["a", "b"]
    assert names["additionalProperties"] is False
    assert set(names["properties"]) == {"a", "b"}


def test_names_schema_holds_every_name_to_the_level_length() -> None:
    schema = naming.names_schema(["a", "b"], 24)
    properties = schema["properties"]["names"]["properties"]
    assert properties == {identifier: {"type": "string", "minLength": 1, "maxLength": 24} for identifier in ("a", "b")}


def test_parse_names_returns_the_names_by_id() -> None:
    text = _answer({"a": "Robot Hands", "b": "Legged Robots"})
    assert naming.parse_names(text, ["a", "b"], 32) == {"a": "Robot Hands", "b": "Legged Robots"}


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("not json", "not JSON"),
        (json.dumps({"other": {}}), "no names object"),
        (json.dumps({"names": ["a"]}), "no names object"),
        (_answer({"a": "Robot Hands"}), "missing ids"),
        (_answer({"a": "Robot Hands", "b": "Legs", "c": "Extra"}), "unexpected ids"),
        (_answer({"a": "Robot Hands", "b": 3}), "not a string"),
        (_answer({"a": "Robot Hands", "b": ""}), "empty"),
        (_answer({"a": "Robot Hands", "b": " Legs"}), "surrounding spaces"),
        (_answer({"a": "Robot Hands", "b": "x" * 33}), "longer than 32"),
        (_answer({"a": "Robot Hands", "b": "robot hands"}), "repeated"),
        (_answer({"a": "Robot Hands", "b": "Other"}), "Other"),
        (_answer({"a": "Robot Hands", "b": "other papers"}), "Other"),
    ],
)
def test_parse_names_refuses_a_malformed_answer_with_the_raw_text(text: str, reason: str) -> None:
    with pytest.raises(naming.NamingError, match=reason) as caught:
        naming.parse_names(text, ["a", "b"], 32)
    assert text in str(caught.value)
    assert caught.value.raw == text


def test_parse_names_refuses_a_name_already_taken_in_any_case() -> None:
    with pytest.raises(naming.NamingError, match="repeated"):
        naming.parse_names(_answer({"b": "ROBOT HANDS"}), ["b"], 32, taken_names=["Robot Hands"])


def test_a_name_that_only_starts_with_other_letters_is_fine() -> None:
    assert naming.parse_names(_answer({"a": "Otherworldly Graphics"}), ["a"], 32) == {"a": "Otherworldly Graphics"}


def test_request_names_asks_with_the_schema_and_parses_the_answer() -> None:
    calls: list[tuple[str, dict[str, object]]] = []

    def ask(prompt: str, schema: dict[str, object]) -> naming.Answer:
        calls.append((prompt, schema))
        return naming.Answer(_answer({"g1-l1": "Tactile Grasping"}), "model", 10, 5)

    names, answer = naming.request_names(ask, "leaf", {"g1-l1": ENTRIES["g1-l1"]}, {"g1-l2": "Legged Robots"})
    assert names == {"g1-l1": "Tactile Grasping"}
    assert answer.input_tokens == 10
    prompt, schema = calls[0]
    assert schema == naming.names_schema(["g1-l1"], naming.LEAF_NAME_MAXIMUM_LENGTH)
    assert _input_of(prompt)["taken"] == ["Legged Robots"]


def test_request_names_holds_a_group_name_to_the_group_length() -> None:
    def ask(_prompt: str, _schema: dict[str, object]) -> naming.Answer:
        return naming.Answer(_answer({"g1": "x" * 21}), "model", 1, 1)

    with pytest.raises(naming.NamingError, match="longer than 20"):
        naming.request_names(ask, "group", {"g1": ENTRIES["g1-l1"]})
