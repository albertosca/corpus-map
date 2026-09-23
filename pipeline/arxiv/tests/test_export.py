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
    build_spec,
    check_spec,
    clean_title,
    write_outputs,
)
from arxiv_corpus.fetch import Paper


def make_paper(id_: str, title: str, category: str, year: int = 2026, abstract: str = "an abstract") -> Paper:
    return Paper(id=id_, title=title, abstract=abstract, category=category, year=year)


def _nodes(spec: dict[str, object]) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], spec["nodes"])


def _territories(spec: dict[str, object]) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], spec["territories"])


def _walk_keys(value: object) -> Iterator[str]:
    if isinstance(value, dict):
        for key, sub in value.items():
            yield key
            yield from _walk_keys(sub)
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


# --- build_spec ---


def test_build_spec_version_is_1() -> None:
    spec = build_spec([make_paper("a", "A", "cs.CL")], np.array([[0.0, 0.0]]))
    assert spec["version"] == "1"


def test_build_spec_creates_one_territory_per_category_present_sorted_by_code() -> None:
    papers = [
        make_paper("a", "Title A", "cs.LG"),
        make_paper("b", "Title B", "cs.CL"),
        make_paper("c", "Title C", "cs.CL"),
    ]
    xy = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])

    spec = build_spec(papers, xy)

    assert [t["id"] for t in _territories(spec)] == ["cs.CL", "cs.LG"]


def test_build_spec_territory_name_comes_from_the_categories_module() -> None:
    spec = build_spec([make_paper("a", "A", "cs.CL")], np.array([[0.0, 0.0]]))
    assert _territories(spec)[0]["name"] == "Computation and Language"


def test_build_spec_territory_members_are_in_paper_order() -> None:
    papers = [
        make_paper("b", "Title B", "cs.CL"),
        make_paper("a", "Title A", "cs.LG"),
        make_paper("c", "Title C", "cs.CL"),
    ]
    xy = np.array([[0.0, 0.0], [5.0, 5.0], [2.0, 2.0]])

    spec = build_spec(papers, xy)

    cl = next(t for t in _territories(spec) if t["id"] == "cs.CL")
    assert cl["members"] == ["b", "c"]


def test_build_spec_centroid_is_the_mean_of_members_xy_rounded_to_three_decimals() -> None:
    papers = [make_paper("a", "A", "cs.CL"), make_paper("b", "B", "cs.CL"), make_paper("c", "C", "cs.CL")]
    xy = np.array([[0.0, 0.0], [0.0, 1.0], [1.0, 0.0]])

    spec = build_spec(papers, xy)

    assert _territories(spec)[0]["centroid"] == [0.333, 0.333]


def test_build_spec_node_coordinates_are_rounded_to_three_decimals() -> None:
    spec = build_spec([make_paper("a", "A", "cs.CL")], np.array([[1.0 / 3, 2.0 / 3]]))

    node = _nodes(spec)[0]
    assert node["x"] == 0.333
    assert node["y"] == 0.667


def test_build_spec_node_label_is_the_cleaned_title() -> None:
    spec = build_spec([make_paper("a", "A\nTitle   With Whitespace", "cs.CL")], np.array([[0.0, 0.0]]))
    assert _nodes(spec)[0]["label"] == "A Title With Whitespace"


def test_build_spec_node_meta_has_year_and_arxiv_url() -> None:
    spec = build_spec([make_paper("2601.00001", "A", "cs.CL", year=2026)], np.array([[0.0, 0.0]]))
    assert _nodes(spec)[0]["meta"] == {"year": 2026, "url": "https://arxiv.org/abs/2601.00001"}


def test_build_spec_node_id_and_url_handle_an_old_style_id_with_a_slash() -> None:
    spec = build_spec([make_paper("cs/0112017", "Old style id", "cs.CL", year=2001)], np.array([[0.0, 0.0]]))

    node = _nodes(spec)[0]
    assert node["id"] == "cs/0112017"
    meta = cast(dict[str, object], node["meta"])
    assert meta["url"] == "https://arxiv.org/abs/cs/0112017"
    assert _territories(spec)[0]["members"] == ["cs/0112017"]


def test_build_spec_node_territory_is_the_paper_category() -> None:
    spec = build_spec([make_paper("a", "A", "cs.LG")], np.array([[0.0, 0.0]]))
    assert _nodes(spec)[0]["territory"] == "cs.LG"


def test_build_spec_raises_when_papers_and_xy_lengths_differ() -> None:
    papers = [make_paper("a", "A", "cs.CL")]
    xy = np.array([[0.0, 0.0], [1.0, 1.0]])

    with pytest.raises(ValueError, match="same length"):
        build_spec(papers, xy)


def test_build_spec_never_contains_an_author_or_authors_key_anywhere() -> None:
    papers = [make_paper("a", "A", "cs.CL"), make_paper("b", "B", "cs.LG")]
    xy = np.array([[0.0, 0.0], [1.0, 1.0]])

    spec = build_spec(papers, xy)

    keys = set(_walk_keys(spec))
    assert "author" not in keys
    assert "authors" not in keys


# --- check_spec ---


def _valid_spec() -> dict[str, object]:
    papers = [make_paper("a", "A", "cs.CL"), make_paper("b", "B", "cs.LG")]
    xy = np.array([[0.0, 0.0], [1.0, 1.0]])
    return build_spec(papers, xy)


def test_check_spec_accepts_a_well_formed_spec() -> None:
    check_spec(_valid_spec())


def test_check_spec_rejects_duplicate_node_ids() -> None:
    spec = _valid_spec()
    spec["nodes"] = [*_nodes(spec), _nodes(spec)[0]]

    with pytest.raises(ValueError, match="duplicate node id"):
        check_spec(spec)


def test_check_spec_rejects_a_node_whose_territory_does_not_exist() -> None:
    spec = _valid_spec()
    node = dict(_nodes(spec)[0])
    node["territory"] = "cs.NOPE"
    spec["nodes"] = [node, *_nodes(spec)[1:]]

    with pytest.raises(ValueError, match=r"cs\.NOPE"):
        check_spec(spec)


def test_check_spec_rejects_a_member_that_does_not_resolve() -> None:
    spec = _valid_spec()
    territory = dict(_territories(spec)[0])
    territory["members"] = [*cast(list[str], territory["members"]), "ghost-id"]
    spec["territories"] = [territory, *_territories(spec)[1:]]

    with pytest.raises(ValueError, match="ghost-id"):
        check_spec(spec)


def test_check_spec_rejects_a_non_finite_coordinate() -> None:
    spec = _valid_spec()
    node = dict(_nodes(spec)[0])
    node["x"] = float("nan")
    spec["nodes"] = [node, *_nodes(spec)[1:]]

    with pytest.raises(ValueError, match="non-finite"):
        check_spec(spec)


# --- write_outputs ---


def test_write_outputs_round_trips_spec_and_meta(tmp_path: Path) -> None:
    spec = _valid_spec()
    meta: dict[str, object] = {"fetched_at": "2026-09-23", "n": 2, "floor": 1}

    write_outputs(spec, meta, tmp_path)

    written_spec = json.loads((tmp_path / "arxiv.json").read_text(encoding="utf-8"))
    written_meta = json.loads((tmp_path / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert written_spec == spec
    assert written_meta == meta


def test_write_outputs_spec_json_is_compact_and_meta_json_is_indented(tmp_path: Path) -> None:
    write_outputs(_valid_spec(), {"a": 1}, tmp_path)

    spec_text = (tmp_path / "arxiv.json").read_text(encoding="utf-8")
    meta_text = (tmp_path / "arxiv.meta.json").read_text(encoding="utf-8")
    assert "\n" not in spec_text
    assert ", " not in spec_text
    assert "\n" in meta_text


def test_write_outputs_checks_the_spec_before_writing_anything(tmp_path: Path) -> None:
    spec = _valid_spec()
    node = dict(_nodes(spec)[0])
    node["x"] = float("nan")
    spec["nodes"] = [node, *_nodes(spec)[1:]]

    with pytest.raises(ValueError, match="non-finite"):
        write_outputs(spec, {}, tmp_path)

    assert not (tmp_path / "arxiv.json").exists()
    assert not (tmp_path / "arxiv.meta.json").exists()


def test_write_outputs_creates_the_output_directory(tmp_path: Path) -> None:
    out_dir = tmp_path / "nested" / "out"

    write_outputs(_valid_spec(), {}, out_dir)

    assert (out_dir / "arxiv.json").exists()


# --- constants ---


def test_attribution_and_license_note_match_spec_wording() -> None:
    assert ATTRIBUTION == "Thank you to arXiv for use of its open access interoperability."
    assert LICENSE_NOTE == "Metadata from arXiv, CC0 1.0; no full text; no author names."
