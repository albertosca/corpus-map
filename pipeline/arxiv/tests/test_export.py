from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import numpy as np
import pytest

from arxiv_corpus.export import (
    ATTRIBUTION,
    LICENSE_NOTE,
    Clustering,
    build_spec,
    check_spec,
    clean_title,
    write_outputs,
    year_of_id,
)
from arxiv_corpus.fetch import Paper


def make_paper(paper_id: str, title: str, category: str, year: int = 2026, abstract: str = "an abstract") -> Paper:
    return Paper(id=paper_id, title=title, abstract=abstract, category=category, year=year)


def _clustering(leaf_of: list[str], group_of: dict[str, str] | None = None) -> Clustering:
    """Leaves named `Leaf <id>`, groups `Group <id>`; by default every leaf sits under `g1`."""
    group_of = group_of if group_of is not None else dict.fromkeys(leaf_of, "g1")
    return Clustering(
        leaf_of=leaf_of,
        group_of=group_of,
        leaf_names={leaf: f"Leaf {leaf}" for leaf in group_of},
        group_names={group: f"Group {group}" for group in group_of.values()},
    )


def _spec(papers: list[Paper], coordinates: np.ndarray, leaf_of: list[str] | None = None) -> dict[str, object]:
    return build_spec(papers, coordinates, _clustering(leaf_of if leaf_of is not None else ["g1-l1"] * len(papers)))


def _one(category: str = "cs.CL", year: int = 2026, title: str = "A") -> dict[str, object]:
    return _spec([make_paper("2601.00001", title, category, year=year)], np.array([[0.0, 0.0]]))


def _nodes(spec: dict[str, object]) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], spec["nodes"])


def _territories(spec: dict[str, object]) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], spec["territories"])


def _by_id(spec: dict[str, object]) -> dict[str, dict[str, object]]:
    return {cast(str, territory["id"]): territory for territory in _territories(spec)}


def _walk_keys(value: object) -> Iterator[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _walk_keys(child)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_keys(item)


# --- clean_title ---


def test_clean_title_collapses_newlines_and_leading_run_of_spaces() -> None:
    raw = "Sparse Attention Routing for Long-Context\n  Retrieval Augmented Generation"
    assert clean_title(raw) == "Sparse Attention Routing for Long-Context Retrieval Augmented Generation"


def test_clean_title_collapses_tabs_and_multiple_spaces() -> None:
    assert clean_title("A\t\tTitle   With    Spaces") == "A Title With Spaces"


def test_clean_title_strips_leading_and_trailing_whitespace() -> None:
    assert clean_title("  Padded Title  \n") == "Padded Title"


def test_clean_title_keeps_latex_markup_as_written() -> None:
    assert clean_title("A result about   $\\alpha$-convergence") == "A result about $\\alpha$-convergence"


# --- build_spec: territories are the clusters ---

FOUR_PAPERS = [
    make_paper("2601.00001", "A", "cs.LG"),
    make_paper("2601.00002", "B", "cs.CL"),
    make_paper("2601.00003", "C", "cs.CL"),
    make_paper("2601.00004", "D", "cs.AI"),
]
FOUR_COORDINATES = np.array([[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [9.0, 9.0]])
FOUR_LEAVES = ["g1-l1", "g1-l1", "g1-l2", "g2-l1"]
FOUR_GROUPS = {"g1-l1": "g1", "g1-l2": "g1", "g2-l1": "g2"}


def _four() -> dict[str, object]:
    return build_spec(FOUR_PAPERS, FOUR_COORDINATES, _clustering(FOUR_LEAVES, FOUR_GROUPS))


def test_build_spec_version_is_1() -> None:
    assert _one()["version"] == "1"


def test_build_spec_writes_each_group_then_its_leaves_in_id_order() -> None:
    assert [territory["id"] for territory in _territories(_four())] == ["g1", "g1-l1", "g1-l2", "g2", "g2-l1"]


def test_build_spec_groups_have_no_parent_and_leaves_name_their_group() -> None:
    territories = _by_id(_four())
    assert "parent" not in territories["g1"]
    assert "parent" not in territories["g2"]
    assert territories["g1-l1"]["parent"] == "g1"
    assert territories["g1-l2"]["parent"] == "g1"
    assert territories["g2-l1"]["parent"] == "g2"


def test_build_spec_territory_names_are_the_given_names() -> None:
    territories = _by_id(_four())
    assert territories["g1"]["name"] == "Group g1"
    assert territories["g1-l2"]["name"] == "Leaf g1-l2"


def test_build_spec_each_node_names_its_leaf() -> None:
    assert [node["territory"] for node in _nodes(_four())] == FOUR_LEAVES


def test_build_spec_territories_carry_no_members_list() -> None:
    """Every node names its territory; the demo derives `members` from that (compact.ts)."""
    assert all("members" not in territory for territory in _territories(_four()))


def test_build_spec_leaf_centroid_is_the_mean_of_its_papers_rounded_to_three_decimals() -> None:
    papers = [make_paper("2601.00001", "A", "cs.CL"), make_paper("2601.00002", "B", "cs.CL")]
    papers.append(make_paper("2601.00003", "C", "cs.CL"))
    spec = _spec(papers, np.array([[0.0, 0.0], [0.0, 1.0], [1.0, 0.0]]))
    assert _by_id(spec)["g1-l1"]["centroid"] == [0.333, 0.333]


def test_build_spec_group_centroid_is_the_mean_of_all_its_papers_not_of_its_leaves() -> None:
    """g1 holds three papers in two leaves, (0,0), (0,1) and (1,0): the mean of the papers, not of the leaves."""
    assert _by_id(_four())["g1"]["centroid"] == [0.333, 0.333]
    assert _by_id(_four())["g2"]["centroid"] == [9.0, 9.0]


def test_build_spec_lists_the_categories_present_sorted_by_code_with_their_names() -> None:
    assert _four()["categories"] == [
        {"id": "cs.AI", "name": "Artificial Intelligence"},
        {"id": "cs.CL", "name": "Computation and Language"},
        {"id": "cs.LG", "name": "Machine Learning"},
    ]


def test_build_spec_each_node_carries_the_index_of_its_category() -> None:
    assert [node["category"] for node in _nodes(_four())] == [2, 1, 1, 0]


def test_build_spec_refuses_a_clustering_of_another_length() -> None:
    with pytest.raises(ValueError, match="clustering"):
        build_spec(FOUR_PAPERS, FOUR_COORDINATES, _clustering(FOUR_LEAVES[:3], FOUR_GROUPS))


def test_build_spec_refuses_a_leaf_without_a_group() -> None:
    with pytest.raises(ValueError, match="g2-l1"):
        build_spec(FOUR_PAPERS, FOUR_COORDINATES, _clustering(FOUR_LEAVES, {"g1-l1": "g1", "g1-l2": "g1"}))


def test_build_spec_node_coordinates_are_rounded_to_three_decimals() -> None:
    spec = _spec([make_paper("2601.00001", "A", "cs.CL")], np.array([[1.0 / 3, 2.0 / 3]]))

    node = _nodes(spec)[0]
    assert node["x"] == 0.333
    assert node["y"] == 0.667


def test_build_spec_node_label_is_the_cleaned_title() -> None:
    assert _nodes(_one(title="A\nTitle   With Whitespace"))[0]["label"] == "A Title With Whitespace"


def test_build_spec_nodes_carry_no_meta() -> None:
    """Year and abstract-page url follow from the id, the category from the table; the demo rebuilds them."""
    assert "meta" not in _nodes(_one())[0]


def test_build_spec_keeps_an_old_style_id_with_a_slash() -> None:
    spec = _spec([make_paper("cs/0112017", "Old style id", "cs.CL", year=2001)], np.array([[0.0, 0.0]]))
    assert _nodes(spec)[0]["id"] == "cs/0112017"


@pytest.mark.parametrize(
    ("paper_id", "year"),
    [("2601.00001", 2025), ("cs/0112017", 2002), ("not-an-arxiv-id", 2026), ("2601.00001v2", 2026)],
)
def test_build_spec_refuses_a_paper_whose_year_its_id_does_not_give(paper_id: str, year: int) -> None:
    """The payload leaves the year out, so it must be exactly what the demo reads back from the id."""
    with pytest.raises(ValueError, match=paper_id):
        _spec([make_paper(paper_id, "A", "cs.CL", year=year)], np.array([[0.0, 0.0]]))


@pytest.mark.parametrize(
    ("paper_id", "year"),
    [
        ("2609.26779", 2026),
        ("0704.0001", 2007),
        ("1501.00001", 2015),
        ("cs/0112017", 2001),
        ("math/9901001", 1999),
        ("hep-th/9108001", 1991),
        ("math.GT/0309136", 2003),
    ],
)
def test_year_of_id_reads_the_two_year_digits(paper_id: str, year: int) -> None:
    """The same cases as `yearOfArxivId` in demo/corpora/compact.test.ts: the two must agree."""
    assert year_of_id(paper_id) == year


@pytest.mark.parametrize("paper_id", ["", "garbage", "2609.267", "26090.12345", "cs/011201", "2609.26779v2"])
def test_year_of_id_has_no_year_for_what_is_not_an_arxiv_id(paper_id: str) -> None:
    assert year_of_id(paper_id) is None


def test_build_spec_raises_when_papers_and_xy_lengths_differ() -> None:
    papers = [make_paper("2601.00001", "A", "cs.CL")]
    coordinates = np.array([[0.0, 0.0], [1.0, 1.0]])

    with pytest.raises(ValueError, match="same length"):
        build_spec(papers, coordinates, _clustering(["g1-l1"]))


def test_build_spec_never_contains_an_author_or_authors_key_anywhere() -> None:
    keys = set(_walk_keys(_four()))
    assert "author" not in keys
    assert "authors" not in keys


# --- check_spec ---


def test_check_spec_accepts_a_well_formed_spec() -> None:
    check_spec(_four())


def test_check_spec_accepts_a_parent_no_node_names() -> None:
    """A group's members are its leaves' -- no node names a group, and that is the point."""
    spec = _four()
    assert not {"g1", "g2"} & {node["territory"] for node in _nodes(spec)}
    check_spec(spec)


def test_check_spec_rejects_duplicate_node_ids() -> None:
    spec = _four()
    spec["nodes"] = [*_nodes(spec), _nodes(spec)[0]]

    with pytest.raises(ValueError, match="duplicate node id"):
        check_spec(spec)


def _with_node(spec: dict[str, object], **changes: object) -> dict[str, object]:
    spec["nodes"] = [{**_nodes(spec)[0], **changes}, *_nodes(spec)[1:]]
    return spec


def test_check_spec_rejects_a_node_whose_territory_does_not_exist() -> None:
    with pytest.raises(ValueError, match="g9-l1"):
        check_spec(_with_node(_four(), territory="g9-l1"))


def test_check_spec_rejects_a_node_that_names_a_parent() -> None:
    with pytest.raises(ValueError, match="parent"):
        check_spec(_with_node(_four(), territory="g1"))


def test_check_spec_rejects_a_leaf_no_node_names() -> None:
    """The demo would derive an empty `members` list, which the library's `validateSpec` refuses."""
    spec = _four()
    spec["territories"] = [*_territories(spec), {"id": "g1-l3", "name": "Empty", "centroid": [0, 0], "parent": "g1"}]

    with pytest.raises(ValueError, match="g1-l3"):
        check_spec(spec)


def test_check_spec_rejects_a_parent_that_is_not_a_territory() -> None:
    spec = _four()
    spec["territories"] = [
        {**territory, "parent": "g7"} if territory["id"] == "g2-l1" else territory for territory in _territories(spec)
    ]

    with pytest.raises(ValueError, match="g7"):
        check_spec(spec)


def test_check_spec_rejects_a_parent_that_has_a_parent() -> None:
    spec = _four()
    spec["territories"] = [
        {**territory, "parent": "g2"} if territory["id"] == "g1" else territory for territory in _territories(spec)
    ]

    with pytest.raises(ValueError, match="two levels"):
        check_spec(spec)


@pytest.mark.parametrize("index", [3, -1, 1.0, True, "1", None])
def test_check_spec_rejects_a_category_index_out_of_range_or_not_an_integer(index: object) -> None:
    with pytest.raises(ValueError, match="category"):
        check_spec(_with_node(_four(), category=index))


def test_check_spec_rejects_a_node_without_a_category() -> None:
    spec = _four()
    node = {key: value for key, value in _nodes(spec)[0].items() if key != "category"}
    spec["nodes"] = [node, *_nodes(spec)[1:]]

    with pytest.raises(ValueError, match="category"):
        check_spec(spec)


@pytest.mark.parametrize("entry", [{"id": "cs.AI"}, {"id": "cs.AI", "name": ""}, {"name": "X"}, "cs.AI"])
def test_check_spec_rejects_a_categories_entry_missing_its_id_or_name(entry: object) -> None:
    spec = _four()
    spec["categories"] = [entry, *cast("list[object]", spec["categories"])[1:]]

    with pytest.raises(ValueError, match="categor"):
        check_spec(spec)


@pytest.mark.parametrize("table", [None, {"cs.AI": "Artificial Intelligence"}])
def test_check_spec_rejects_a_spec_without_a_categories_list(table: object) -> None:
    spec = _four()
    spec["categories"] = table

    with pytest.raises(ValueError, match="no categories table"):
        check_spec(spec)


def test_check_spec_rejects_a_non_finite_coordinate() -> None:
    with pytest.raises(ValueError, match="non-finite"):
        check_spec(_with_node(_four(), x=float("nan")))


@pytest.mark.parametrize(("part", "key"), [("territories", "members"), ("nodes", "meta")])
def test_check_spec_rejects_a_field_the_compact_payload_leaves_out(part: str, key: str) -> None:
    """A stale `members` or `meta` would be kept by the demo as it is, never re-derived."""
    spec = _four()
    first = dict(cast("list[dict[str, object]]", spec[part])[0])
    first[key] = []
    spec[part] = [first, *cast("list[dict[str, object]]", spec[part])[1:]]

    with pytest.raises(ValueError, match=key):
        check_spec(spec)


# --- write_outputs ---


def test_write_outputs_round_trips_spec_and_meta(tmp_path: Path) -> None:
    spec = _four()
    meta: dict[str, object] = {"fetched_at": "2026-09-23", "n": 2, "floor": 1}

    write_outputs(spec, meta, tmp_path)

    written_spec = json.loads((tmp_path / "arxiv.json").read_text(encoding="utf-8"))
    written_meta = json.loads((tmp_path / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert written_spec == spec
    assert written_meta == meta


def test_write_outputs_spec_json_is_compact_and_meta_json_is_indented(tmp_path: Path) -> None:
    write_outputs(_four(), {"a": 1}, tmp_path)

    spec_text = (tmp_path / "arxiv.json").read_text(encoding="utf-8")
    meta_text = (tmp_path / "arxiv.meta.json").read_text(encoding="utf-8")
    assert "\n" not in spec_text
    assert ", " not in spec_text
    assert "\n" in meta_text


def test_write_outputs_checks_the_spec_before_writing_anything(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="non-finite"):
        write_outputs(_with_node(_four(), x=float("nan")), {}, tmp_path)

    assert not (tmp_path / "arxiv.json").exists()
    assert not (tmp_path / "arxiv.meta.json").exists()


def test_write_outputs_creates_the_output_directory(tmp_path: Path) -> None:
    out_directory = tmp_path / "nested" / "out"

    write_outputs(_four(), {}, out_directory)

    assert (out_directory / "arxiv.json").exists()


# --- constants ---


def test_attribution_and_license_note_match_spec_wording() -> None:
    assert ATTRIBUTION == "Thank you to arXiv for use of its open access interoperability."
    assert LICENSE_NOTE == "Metadata from arXiv, CC0 1.0; no full text; no author names."


# --- edges ---


def test_build_spec_carries_the_given_edges_as_lists() -> None:
    spec = build_spec(FOUR_PAPERS, FOUR_COORDINATES, _clustering(FOUR_LEAVES, FOUR_GROUPS), edges=[(0, 3, 87)])

    assert spec["edges"] == [[0, 3, 87]]
    check_spec(spec)


def test_build_spec_without_edges_has_no_edges_key() -> None:
    assert "edges" not in _four()


@pytest.mark.parametrize(
    ("edge", "message"),
    [
        ([0, 4, 80], "out of range"),
        ([1, 0, 80], "out of range"),
        ([0, 0, 80], "out of range"),
        ([-1, 1, 80], "out of range"),
        ([0, 1, 101], "weight"),
        ([0, 1, -1], "weight"),
        ([0, 1], "triple"),
        ([0.5, 1, 80], "triple"),
        ([0, 1, True], "triple"),
    ],
)
def test_check_spec_rejects_a_malformed_edge(edge: list[object], message: str) -> None:
    spec = _four()
    spec["edges"] = [edge]

    with pytest.raises(ValueError, match=message):
        check_spec(spec)
