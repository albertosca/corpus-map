"""Building and checking the corpus-map `MapSpec` from papers and their 2D coordinates.

No author field is ever emitted -- CC0 allows author names, but a public map of real
people's names adds risk for no gain (see the design spec). `build_spec`'s output is
walked, not spot-checked, in the tests that guard this.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Sequence
from pathlib import Path
from typing import cast

import numpy as np
import numpy.typing as npt

from arxiv_corpus.categories import name_of
from arxiv_corpus.fetch import Paper

ATTRIBUTION = "Thank you to arXiv for use of its open access interoperability."
LICENSE_NOTE = "Metadata from arXiv, CC0 1.0; no full text; no author names."

# `YYMM.NNNN` (2007-2014) or `YYMM.NNNNN` (2015 on).
_NEW_STYLE_ID = re.compile(r"(\d{2})\d{2}\.\d{4,5}")
# `archive[.XX]/YYMMNNN`, 1991-2007.
_OLD_STYLE_ID = re.compile(r"[a-z-]+(?:\.[A-Z]{2})?/(\d{2})\d{5}")
# Old-style ids started in 1991, so a two-digit year from 91 up is the 1900s.
_FIRST_OLD_STYLE_YEAR = 91


def year_of_id(paper_id: str) -> int | None:
    """The year an arXiv id was registered, read from its `YY` digits; None for anything else.

    Mirrors `yearOfArxivId` in `demo/corpora/compact.ts`, which rebuilds each node's year from
    its id: the payload leaves the year out, so the two must read every id the same way.
    """
    new_style = _NEW_STYLE_ID.fullmatch(paper_id)
    if new_style:
        return 2000 + int(new_style.group(1))
    old_style = _OLD_STYLE_ID.fullmatch(paper_id)
    if old_style is None:
        return None
    two_digits = int(old_style.group(1))
    return 1900 + two_digits if two_digits >= _FIRST_OLD_STYLE_YEAR else 2000 + two_digits


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

    One territory per category present among `papers` (sorted by code), whose `centroid` is
    the mean of its papers' (unrounded) `coordinates` rows, rounded to 3 decimals. One node per
    paper, in `papers` order, with `x`/`y` each rounded to 3 decimals -- never an author.
    `edges`, when given, are `(low, high, weight)` node-index triples, written as lists.

    The payload is compact: territories carry no `members` (each node names its territory)
    and nodes carry no `meta` (the year and the abstract-page url follow from the id). The
    demo rebuilds both on load (`demo/corpora/compact.ts`), so a paper whose `year` is not
    the one its id gives is refused here, before it could be shown with the wrong year.
    """
    if len(papers) != len(coordinates):
        raise ValueError(f"papers and coordinates must be the same length, got {len(papers)} and {len(coordinates)}")
    for paper in papers:
        if year_of_id(paper.id) != paper.year:
            raise ValueError(
                f"paper {paper.id}: year {paper.year} is not the year its id gives ({year_of_id(paper.id)})"
            )

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
            }
        )

    territories: list[dict[str, object]] = []
    for code in sorted(indices_by_territory):
        indices = indices_by_territory[code]
        centroid = coordinates[indices].mean(axis=0)
        territories.append(
            {
                "id": code,
                "name": name_of(code),
                "centroid": [round(float(centroid[0]), 3), round(float(centroid[1]), 3)],
            }
        )

    spec: dict[str, object] = {"version": "1", "territories": territories, "nodes": nodes}
    if edges is not None:
        spec["edges"] = [list(edge) for edge in edges]
    return spec


def check_spec(spec: dict[str, object]) -> None:
    """Sanity-check `spec` before it is written, raising `ValueError` on the first problem.

    Checked: the payload is compact (no territory `members`, no node `meta`: the demo keeps
    either as it finds it instead of deriving it), no duplicate node id, every node's
    territory names a known territory, every territory is named by at least one node (the
    demo derives its `members` from those nodes, and the library's `validateSpec` refuses an
    empty list), and every node coordinate is finite.
    """
    territories = cast("list[dict[str, object]]", spec["territories"])
    nodes = cast("list[dict[str, object]]", spec["nodes"])

    for territory in territories:
        if "members" in territory:
            raise ValueError(f"territory {territory['id']}: carries members, which the demo derives")
    territory_ids = {cast(str, territory["id"]) for territory in territories}
    named_territories: set[str] = set()

    node_ids: set[str] = set()
    for node in nodes:
        node_id = cast(str, node["id"])
        if node_id in node_ids:
            raise ValueError(f"duplicate node id: {node_id}")
        node_ids.add(node_id)

        if "meta" in node:
            raise ValueError(f"node {node_id}: carries meta, which the demo derives")
        node_territory = cast(str, node["territory"])
        if node_territory not in territory_ids:
            raise ValueError(f"node {node_id}: unknown territory {node_territory!r}")
        named_territories.add(node_territory)

        if not _is_finite(node["x"]) or not _is_finite(node["y"]):
            raise ValueError(f"node {node_id}: non-finite coordinate ({node['x']!r}, {node['y']!r})")

    unnamed = sorted(territory_ids - named_territories)
    if unnamed:
        raise ValueError(f"territory {unnamed[0]}: no node names it")

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
