import json
from typing import Any

import pytest

from arxiv_corpus import blind, naming

NAMES = {"a": "Robot Hands", "b": "Legged Robots", "c": "Language Models"}


def _input_of(prompt: str) -> Any:
    return json.loads(prompt.split(naming.INPUT_MARKER, 1)[1])


def _answers(chosen: list[str]) -> str:
    return json.dumps({"answers": [{"number": number, "name": name} for number, name in enumerate(chosen, start=1)]})


def test_held_out_never_takes_a_central_title_and_takes_all_of_a_small_leaf() -> None:
    members = {"a": list(range(0, 30)), "b": [30, 31, 32, 33]}
    central = {"a": [0, 1, 2], "b": [30]}
    drawn = blind.held_out(members, central, per_leaf=5)
    assert not set(drawn) & {0, 1, 2, 30}
    assert len([index for index in drawn if index < 30]) == 5
    assert sorted(index for index in drawn if index >= 30) == [31, 32, 33]


def test_held_out_is_fixed_by_its_seed() -> None:
    members = {"a": list(range(100))}
    central = {"a": [0]}
    assert blind.held_out(members, central, per_leaf=20) == blind.held_out(members, central, per_leaf=20)
    assert blind.held_out(members, central, per_leaf=20) != blind.held_out(members, central, per_leaf=20, seed=1)


def test_a_leaf_whose_members_are_all_central_contributes_no_title() -> None:
    assert blind.held_out({"a": [0, 1], "b": [2, 3, 4]}, {"a": [0, 1], "b": [2]}, per_leaf=5) in ([3, 4], [4, 3])


def test_the_check_prompt_numbers_titles_and_offers_only_names() -> None:
    prompt = blind.check_prompt(["First title", "Second title"], ["Legged Robots", "Robot Hands"])
    payload = _input_of(prompt)
    assert payload == {
        "kind": "check",
        "names": ["Legged Robots", "Robot Hands"],
        "titles": [{"number": 1, "title": "First title"}, {"number": 2, "title": "Second title"}],
    }
    assert "g1" not in prompt
    assert "size" not in prompt


def test_answers_schema_only_allows_the_offered_names() -> None:
    schema = blind.answers_schema(["Legged Robots", "Robot Hands"])
    item = schema["properties"]["answers"]["items"]
    assert item["properties"]["name"]["enum"] == ["Legged Robots", "Robot Hands"]
    assert item["required"] == ["number", "name"]


def test_parse_answers_gives_one_name_per_title_in_title_order() -> None:
    text = json.dumps({"answers": [{"number": 2, "name": "Robot Hands"}, {"number": 1, "name": "Legged Robots"}]})
    assert blind.parse_answers(text, 2, ["Robot Hands", "Legged Robots"]) == ["Legged Robots", "Robot Hands"]


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("nope", "not JSON"),
        (json.dumps({"answers": {}}), "no answers list"),
        (json.dumps([]), "no answers list"),
        (json.dumps({"answers": ["x"]}), "malformed answer"),
        (json.dumps({"answers": [{"number": "1", "name": "Robot Hands"}]}), "malformed answer"),
        (json.dumps({"answers": [{"number": True, "name": "Robot Hands"}]}), "malformed answer"),
        (_answers(["Robot Hands"]), "missing title numbers \\[2\\]"),
        (_answers(["Robot Hands", "Robot Hands", "Robot Hands"]), "out of range"),
        (json.dumps({"answers": [{"number": 0, "name": "Robot Hands"}]}), "out of range"),
        (
            json.dumps({"answers": [{"number": 1, "name": "Robot Hands"}, {"number": 1, "name": "Robot Hands"}]}),
            "repeated",
        ),
        (_answers(["Robot Hands", "Space Robots"]), "not offered"),
    ],
)
def test_parse_answers_refuses_a_malformed_answer_with_the_raw_text(text: str, reason: str) -> None:
    with pytest.raises(naming.NamingError, match=reason) as caught:
        blind.parse_answers(text, 2, ["Robot Hands", "Legged Robots"])
    assert caught.value.raw == text


def test_score_measures_each_id_overall_lift_and_lost_titles() -> None:
    titles = ["t1", "t2", "t3", "t4", "t5"]
    truth = ["a", "a", "b", "b", "b"]
    chosen = ["Robot Hands", "Legged Robots", "Legged Robots", "Legged Robots", "Robot Hands"]
    result = blind.score(chosen, truth, titles, NAMES)
    assert result.shares == {"a": 0.5, "b": 2 / 3, "c": None}
    assert result.overall == 0.6
    assert result.lift == pytest.approx(1.8)
    assert result.lost == {"a": [("t2", "Legged Robots")], "b": [("t5", "Robot Hands")], "c": []}


def test_two_equal_titles_from_different_leaves_are_scored_by_position() -> None:
    result = blind.score(["Robot Hands", "Legged Robots"], ["a", "b"], ["Same title", "Same title"], NAMES)
    assert result.shares["a"] == 1.0
    assert result.shares["b"] == 1.0


def _score(shares: dict[str, float | None], overall: float, lift: float) -> blind.Score:
    return blind.Score(shares=shares, overall=overall, lift=lift, lost={identifier: [] for identifier in shares})


def test_leaf_gate_passes_at_the_floors() -> None:
    assert blind.leaf_gate(_score({"a": 0.4, "b": 0.8, "c": None}, 0.6, 1.8)) == (True, set())


def test_leaf_gate_fails_a_leaf_below_its_floor_alone() -> None:
    assert blind.leaf_gate(_score({"a": 0.35, "b": 0.9}, 0.7, 1.4)) == (False, {"a"})


def test_leaf_gate_failing_overall_re_names_the_leaves_below_the_overall_floor() -> None:
    assert blind.leaf_gate(_score({"a": 0.45, "b": 0.7, "c": 0.5}, 0.55, 1.65)) == (
        False,
        {"a", "c"},
    )


def test_leaf_gate_ignores_the_lift_which_caps_at_the_number_of_names() -> None:
    # 18 leaves cap the lift at 18; the 38 arXiv categories scored 25.4 in the real run (owner ruling 2026-10-27).
    assert blind.leaf_gate(_score({"a": 0.5, "b": 0.9}, 0.7, 0.01)) == (True, set())


def test_group_gate_needs_each_group_at_its_floor() -> None:
    assert blind.group_gate(_score({"g1": 0.7, "g2": 0.9}, 0.8, 1.6)) == (True, set())
    assert blind.group_gate(_score({"g1": 0.69, "g2": 0.9, "g3": None}, 0.8, 2.4)) == (False, {"g1"})


class _Judge:
    """Answers each title with its true name, except the titles listed under `wrong` per attempt."""

    def __init__(self, truth: list[str], wrong_by_attempt: list[set[int]]) -> None:
        self.truth = truth
        self.wrong_by_attempt = wrong_by_attempt
        self.calls = 0

    def __call__(self, prompt: str, _schema: dict[str, Any]) -> naming.Answer:
        payload = _input_of(prompt)
        offered = payload["names"]
        wrong = self.wrong_by_attempt[min(self.calls, len(self.wrong_by_attempt) - 1)]
        self.calls += 1
        chosen = []
        for position, identifier in enumerate(self.truth):
            true_name = self.current_names[identifier]
            chosen.append(next(name for name in offered if name != true_name) if position in wrong else true_name)
        return naming.Answer(_answers(chosen), "judge", 100, 10)

    current_names: dict[str, str]


def test_check_level_passes_first_time_with_one_call() -> None:
    truth = ["a", "a", "b", "b"]
    judge = _Judge(truth, [set()])
    judge.current_names = dict(NAMES)

    def rename(*_arguments: object) -> tuple[dict[str, str], naming.Answer]:
        raise AssertionError("no re-naming expected")

    result = blind.check_level(judge, rename, ["t1", "t2", "t3", "t4"], truth, NAMES, blind.group_gate)
    assert result.passed
    assert len(result.attempts) == 1
    assert len(result.answers) == 1
    assert result.names == NAMES


def test_check_level_renames_only_the_failing_ids_with_feedback_and_passes_on_the_next_attempt() -> None:
    truth = ["a", "a", "b", "b"]
    judge = _Judge(truth, [{0, 1}, set()])
    judge.current_names = dict(NAMES)
    calls: list[tuple[set[str], dict[str, str], dict[str, naming.Feedback]]] = []

    def rename(
        failing: set[str], kept: dict[str, str], feedback: dict[str, naming.Feedback]
    ) -> tuple[dict[str, str], naming.Answer]:
        calls.append((failing, kept, feedback))
        judge.current_names = {**judge.current_names, "a": "Dexterous Grasping"}
        return {"a": "Dexterous Grasping"}, naming.Answer("{}", "namer", 50, 5)

    result = blind.check_level(judge, rename, ["t1", "t2", "t3", "t4"], truth, NAMES, blind.group_gate)
    assert result.passed
    assert result.names == {**NAMES, "a": "Dexterous Grasping"}
    failing, kept, feedback = calls[0]
    assert failing == {"a"}
    assert kept == {"b": "Legged Robots", "c": "Language Models"}
    assert feedback["a"].share == 0.0
    assert [title for title, _chosen in feedback["a"].lost] == ["t1", "t2"]
    assert len(result.attempts) == 2
    assert result.attempts[0]["names"] == NAMES
    assert len(result.answers) == 3


def test_check_level_stops_after_the_last_renaming_and_reports_every_attempt() -> None:
    truth = ["a", "a", "b", "b"]
    judge = _Judge(truth, [{0, 1}])
    judge.current_names = dict(NAMES)
    renamings: list[set[str]] = []

    def rename(
        failing: set[str], _kept: dict[str, str], _feedback: dict[str, naming.Feedback]
    ) -> tuple[dict[str, str], naming.Answer]:
        renamings.append(failing)
        name = f"Hands {len(renamings)}"
        judge.current_names = {**judge.current_names, "a": name}
        return {"a": name}, naming.Answer("{}", "namer", 1, 1)

    result = blind.check_level(judge, rename, ["t1", "t2", "t3", "t4"], truth, NAMES, blind.group_gate)
    assert not result.passed
    assert len(renamings) == blind.MAXIMUM_RENAMES
    assert len(result.attempts) == blind.MAXIMUM_RENAMES + 1


def test_check_level_stops_at_once_when_the_gate_fails_with_nothing_to_rename() -> None:
    truth = ["a", "b"]
    judge = _Judge(truth, [set()])
    judge.current_names = dict(NAMES)

    def rename(*_arguments: object) -> tuple[dict[str, str], naming.Answer]:
        raise AssertionError("nothing to re-name")

    result = blind.check_level(judge, rename, ["t1", "t2"], truth, NAMES, lambda _score: (False, set()))
    assert not result.passed
    assert len(result.attempts) == 1


def test_the_real_constants_are_the_spec_values() -> None:
    assert blind.HELD_OUT_PER_LEAF == 20
    assert (blind.LEAF_FLOOR, blind.OVERALL_FLOOR, blind.GROUP_FLOOR) == (0.40, 0.60, 0.70)
    assert blind.MAXIMUM_RENAMES == 4


def test_score_refuses_an_empty_title_list_instead_of_dividing_by_zero() -> None:
    with pytest.raises(ValueError, match="no held-out titles"):
        blind.score([], [], [], NAMES)
