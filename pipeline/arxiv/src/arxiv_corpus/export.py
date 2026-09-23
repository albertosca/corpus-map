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


def build_spec(papers: Sequence[Paper], xy: npt.NDArray[np.float64]) -> dict[str, object]:
    """Build a corpus-map `MapSpec` from `papers` and their parallel `xy` coordinates.

    One territory per category present among `papers` (sorted by code); its `members` are
    the ids of that category's papers, in the same order they appear in `papers`, and its
    `centroid` is the mean of their (unrounded) `xy` rows, rounded to 3 decimals. One node
    per paper, in `papers` order, with `x`/`y` each rounded to 3 decimals and `meta` holding
    only `year` and the arXiv abstract-page `url` -- never an author.
    """
    if len(papers) != len(xy):
        raise ValueError(f"papers and xy must be the same length, got {len(papers)} and {len(xy)}")

    indices_by_territory: dict[str, list[int]] = {}
    nodes: list[dict[str, object]] = []

    for i, paper in enumerate(papers):
        indices_by_territory.setdefault(paper.category, []).append(i)
        nodes.append(
            {
                "id": paper.id,
                "label": clean_title(paper.title),
                "x": round(float(xy[i, 0]), 3),
                "y": round(float(xy[i, 1]), 3),
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
        member_ids = [papers[i].id for i in indices]
        centroid_xy = xy[indices].mean(axis=0)
        territories.append(
            {
                "id": code,
                "name": name_of(code),
                "members": member_ids,
                "centroid": [round(float(centroid_xy[0]), 3), round(float(centroid_xy[1]), 3)],
            }
        )

    return {"version": "1", "territories": territories, "nodes": nodes}


def check_spec(spec: dict[str, object]) -> None:
    """Sanity-check `spec` before it is written, raising `ValueError` on the first problem.

    Checked: no duplicate node id, every territory member resolves to a known node, every
    node's territory names a known territory, and every node coordinate is finite.
    """
    territories = cast("list[dict[str, object]]", spec["territories"])
    nodes = cast("list[dict[str, object]]", spec["nodes"])

    territory_ids = {cast(str, territory["id"]) for territory in territories}

    node_ids: set[str] = set()
    for node in nodes:
        node_id = cast(str, node["id"])
        if node_id in node_ids:
            raise ValueError(f"duplicate node id: {node_id}")
        node_ids.add(node_id)

        territory = node["territory"]
        if territory not in territory_ids:
            raise ValueError(f"node {node_id}: unknown territory {territory!r}")

        if not _is_finite(node["x"]) or not _is_finite(node["y"]):
            raise ValueError(f"node {node_id}: non-finite coordinate ({node['x']!r}, {node['y']!r})")

    for territory in territories:
        for member in cast("list[str]", territory["members"]):
            if member not in node_ids:
                raise ValueError(f"territory {territory['id']}: member {member!r} does not resolve")


def _is_finite(value: object) -> bool:
    return isinstance(value, int | float) and math.isfinite(value)


def write_outputs(spec: dict[str, object], meta: dict[str, object], out_dir: Path) -> None:
    """Check `spec`, then write `arxiv.json` (compact) and `arxiv.meta.json` (indented).

    Both files go into `out_dir`, created if needed. Nothing is written if `check_spec`
    raises.
    """
    check_spec(spec)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "arxiv.json").write_text(
        json.dumps(spec, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    (out_dir / "arxiv.meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
