"""Cross-category edges: each paper's nearest neighbours in other categories (spec slice E §8)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import numpy.typing as npt

EDGE_FLOOR = 0.80
EDGES_PER_PAPER = 3
# Rows per similarity block: 512 x 8000 float32 is 16 MB, never the whole 8000 x 8000 matrix.
BLOCK = 512


def cross_category_edges(
    embeddings: npt.NDArray[np.floating],
    categories: Sequence[str],
    floor: float = EDGE_FLOOR,
    per_paper: int = EDGES_PER_PAPER,
) -> list[tuple[int, int, int]]:
    """At most `per_paper` edges per paper, each to a paper in another category with cosine
    similarity at least `floor`, as `(low, high, weight)` index triples sorted and deduplicated.

    `embeddings` rows are expected unit length; a zero row links to nothing and nothing links to it.
    Ties go to the lower index (stable sort); `weight` is the similarity in percent, rounded.
    """
    count = len(categories)
    if count == 0:
        return []
    labels = np.asarray(categories)
    matrix = np.asarray(embeddings, dtype=np.float32)
    empty = ~np.any(matrix, axis=1)
    best: dict[tuple[int, int], float] = {}
    for start in range(0, count, BLOCK):
        stop = min(start + BLOCK, count)
        similarity_block = matrix[start:stop] @ matrix.T
        excluded = (labels[start:stop, None] == labels[None, :]) | empty[None, :] | empty[start:stop, None]
        masked = np.where(excluded, -np.inf, similarity_block)
        for offset, row in enumerate(masked):
            paper = start + offset
            order = np.argsort(-row, kind="stable")[:per_paper]
            for neighbour in order:
                similarity = float(row[neighbour])
                # `not >=` also stops on NaN.
                if not similarity >= floor:
                    break
                pair = (min(paper, int(neighbour)), max(paper, int(neighbour)))
                best[pair] = max(best.get(pair, similarity), similarity)
    # A paper many others propose (a hub) still ends with at most `per_paper` edges: the
    # heaviest pairs go first, ties by index, and a pair is kept only while both ends have room.
    degrees: dict[int, int] = {}
    kept: list[tuple[int, int, int]] = []
    for (low, high), similarity in sorted(best.items(), key=lambda item: (-item[1], item[0])):
        if degrees.get(low, 0) < per_paper and degrees.get(high, 0) < per_paper:
            degrees[low] = degrees.get(low, 0) + 1
            degrees[high] = degrees.get(high, 0) + 1
            kept.append((low, high, round(similarity * 100)))
    return sorted(kept)
