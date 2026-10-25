"""Building and checking the corpus-map `MapSpec` from papers and their 2D coordinates.

No author field is ever emitted -- CC0 allows author names, but a public map of real
people's names adds risk for no gain (see the design spec). `build_spec`'s output is
walked, not spot-checked, in the tests that guard this.
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from pathlib import Path
from typing import cast

import numpy as np
import numpy.typing as npt

from arxiv_corpus.categories import name_of
from arxiv_corpus.fetch import Paper

ATTRIBUTION = "Thank you to arXiv for use of its open access interoperability."
LICENSE_NOTE = "Metadata from arXiv, CC0 1.0; no full text; no author names."


def clean_title(raw: str) -> str:
    """Collapse every run of whitespace in `raw` to a single space, and strip the ends.

    LaTeX markup (e.g. ``$\\alpha$``) is kept exactly as written -- only whitespace is
    touched.
    """
    return " ".join(raw.split())


def build_spec(
    papers: Sequence[Paper],
    coordinates: npt.NDArray[np.float64],
    edges: Sequence[tuple[int, int, int]] | None = None,
) -> dict[str, object]:
    """Build a corpus-map `MapSpec` from `papers` and their parallel `coordinates`.

    One territory per category present among `papers` (sorted by code); its `members` are
    the ids of that category's papers, in the same order they appear in `papers`, and its
    `centroid` is the mean of their (unrounded) `coordinates` rows, rounded to 3 decimals. One node
    per paper, in `papers` order, with `x`/`y` each rounded to 3 decimals and `meta` holding
    only `year` and the arXiv abstract-page `url` -- never an author. `edges`, when given, are
    `(low, high, weight)` node-index triples, written as lists.
    """
    if len(papers) != len(coordinates):
        raise ValueError(f"papers and coordinates must be the same length, got {len(papers)} and {len(coordinates)}")

    indices_by_territory: dict[str, list[int]] = {}
    nodes: list[dict[str, object]] = []

    for index, paper in enumerate(papers):
        indices_by_territory.setdefault(paper.category, []).append(index)
        nodes.append(
            {
                "id": paper.id,
                "label": clean_title(paper.title),
                "x": round(float(coordinates[index, 0]), 3),
                "y": round(float(coordinates[index, 1]), 3),
                "territory": paper.category,
                "meta": {
                    "year": paper.year,
                    "url": f"https://arxiv.org/abs/{paper.id}",
                },
            }
        )

    territories: list[dict[str, object]] = []
    for code in sorted(indices_by_territory):
        indices = indices_by_territory[code]
        member_ids = [papers[index].id for index in indices]
        centroid = coordinates[indices].mean(axis=0)
        territories.append(
            {
                "id": code,
                "name": name_of(code),
                "members": member_ids,
                "centroid": [round(float(centroid[0]), 3), round(float(centroid[1]), 3)],
            }
        )

    spec: dict[str, object] = {"version": "1", "territories": territories, "nodes": nodes}
    if edges is not None:
        spec["edges"] = [list(edge) for edge in edges]
    return spec


def check_spec(spec: dict[str, object]) -> None:
    """Sanity-check `spec` before it is written, raising `ValueError` on the first problem.

    Checked: no duplicate node id, every node's territory names a known territory, that
    territory in turn lists the node among its own members (and vice versa -- every
    territory member resolves to a node that claims it), and every node coordinate is
    finite. The two membership directions mirror the library's own `validateSpec`, which
    requires both: the painter walks `members`, the tree walks `territory`, and they must
    agree on which nodes a territory holds.
    """
    territories = cast("list[dict[str, object]]", spec["territories"])
    nodes = cast("list[dict[str, object]]", spec["nodes"])

    members_by_territory = {
        cast(str, territory["id"]): cast("list[str]", territory["members"]) for territory in territories
    }
    territory_ids = set(members_by_territory)

    node_ids: set[str] = set()
    for node in nodes:
        node_id = cast(str, node["id"])
        if node_id in node_ids:
            raise ValueError(f"duplicate node id: {node_id}")
        node_ids.add(node_id)

        territory = cast(str, node["territory"])
        if territory not in territory_ids:
            raise ValueError(f"node {node_id}: unknown territory {territory!r}")
        if node_id not in members_by_territory[territory]:
            raise ValueError(f"node {node_id}: territory {territory!r} does not list it among its members")

        if not _is_finite(node["x"]) or not _is_finite(node["y"]):
            raise ValueError(f"node {node_id}: non-finite coordinate ({node['x']!r}, {node['y']!r})")

    for territory_id, members in members_by_territory.items():
        for member in members:
            if member not in node_ids:
                raise ValueError(f"territory {territory_id}: member {member!r} does not resolve")

    for edge in cast("list[object]", spec.get("edges", [])):
        _check_edge(edge, len(nodes))


def _check_edge(edge: object, node_count: int) -> None:
    """An edge is `[low, high, weight]`: integers, `0 <= low < high < node_count`, weight 0-100."""
    if not isinstance(edge, list) or len(edge) != 3 or not all(_is_integer(part) for part in edge):
        raise ValueError(f"edge {edge!r} is not an integer triple")
    low, high, weight = edge
    if not 0 <= low < high < node_count:
        raise ValueError(f"edge {edge!r}: node indices out of range or not ordered")
    if not 0 <= weight <= 100:
        raise ValueError(f"edge {edge!r}: weight outside 0-100")


def _is_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_finite(value: object) -> bool:
    return isinstance(value, int | float) and math.isfinite(value)


def write_outputs(spec: dict[str, object], meta: dict[str, object], out_directory: Path) -> None:
    """Check `spec`, then write `arxiv.json` (compact) and `arxiv.meta.json` (indented).

    Both files go into `out_directory`, created if needed. Nothing is written if `check_spec`
    raises.
    """
    check_spec(spec)
    out_directory.mkdir(parents=True, exist_ok=True)
    (out_directory / "arxiv.json").write_text(
        json.dumps(spec, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    (out_directory / "arxiv.meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
