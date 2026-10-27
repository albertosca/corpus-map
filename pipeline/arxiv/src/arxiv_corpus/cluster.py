"""Ward clusters of the 2D map: the territories the demo draws (spec 2026-10-27, section 2.1).

One Ward tree over the map coordinates, cut twice: the leaf cut and the group cut each take the count
with the best silhouette in its range. Cuts of one tree nest, so every leaf lies inside one group.
"""

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.cluster.hierarchy import cut_tree, linkage
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors

LEAF_COUNTS = range(18, 27)
GROUP_COUNTS = range(5, 10)
NEIGHBOURS = 10
# Silhouettes are compared at this precision, so a float-noise difference is a tie (and ties go smaller).
SILHOUETTE_DIGITS = 4


@dataclass(frozen=True)
class Cut:
    count: int
    labels: NDArray[np.int64]
    silhouettes: dict[int, float]


@dataclass(frozen=True)
class Hierarchy:
    leaf_of: list[str]
    leaf_members: dict[str, list[int]]
    group_leaves: dict[str, list[str]]
    group_of: dict[str, str]


def ward_tree(coordinates: NDArray[np.float64]) -> NDArray[np.float64]:
    tree: NDArray[np.float64] = linkage(np.asarray(coordinates, dtype=np.float64), method="ward")
    return tree


def best_cut(tree: NDArray[np.float64], coordinates: NDArray[np.float64], counts: range) -> Cut:
    labels_by_count = {count: cut_tree(tree, n_clusters=count).ravel().astype(np.int64) for count in counts}
    silhouettes = {
        count: round(float(silhouette_score(coordinates, labels)), SILHOUETTE_DIGITS)
        for count, labels in labels_by_count.items()
    }
    best = max(counts, key=lambda count: (silhouettes[count], -count))
    return Cut(count=best, labels=labels_by_count[best], silhouettes=silhouettes)


def _by_size(members: list[int]) -> tuple[int, int]:
    """Largest first; a size tie goes to the cluster holding the smallest paper index."""
    return (-len(members), members[0])


def hierarchy(leaf_labels: NDArray[np.int64], group_labels: NDArray[np.int64]) -> Hierarchy:
    members_of_label: dict[int, list[int]] = {}
    for index, label in enumerate(leaf_labels.tolist()):
        members_of_label.setdefault(label, []).append(index)
    leaves_of_group: dict[int, list[list[int]]] = {}
    for label, members in members_of_label.items():
        groups = {int(group_labels[index]) for index in members}
        if len(groups) != 1:
            raise ValueError(f"leaf cluster {label} spans groups {sorted(groups)}: the cuts are not nested")
        leaves_of_group.setdefault(groups.pop(), []).append(members)

    ordered_groups = sorted(
        (sorted(leaves, key=_by_size) for leaves in leaves_of_group.values()),
        key=lambda leaves: _by_size(sorted(index for leaf in leaves for index in leaf)),
    )
    leaf_of = [""] * len(leaf_labels)
    leaf_members: dict[str, list[int]] = {}
    group_leaves: dict[str, list[str]] = {}
    group_of: dict[str, str] = {}
    for group_number, leaves in enumerate(ordered_groups, start=1):
        group_id = f"g{group_number}"
        group_leaves[group_id] = []
        for leaf_number, members in enumerate(leaves, start=1):
            leaf_id = f"{group_id}-l{leaf_number}"
            group_leaves[group_id].append(leaf_id)
            group_of[leaf_id] = group_id
            leaf_members[leaf_id] = members
            for index in members:
                leaf_of[index] = leaf_id
    return Hierarchy(leaf_of=leaf_of, leaf_members=leaf_members, group_leaves=group_leaves, group_of=group_of)


def contiguity(coordinates: NDArray[np.float64], leaf_of: Sequence[str], neighbours: int = NEIGHBOURS) -> float:
    """Share of each paper's nearest map neighbours (itself excluded) that sit in its own leaf, overall.

    A corpus with fewer papers than `neighbours + 1` uses every other paper as a neighbour."""
    neighbours = min(neighbours, len(coordinates) - 1)
    finder = NearestNeighbors(n_neighbors=neighbours + 1).fit(coordinates)
    _distances, indices = finder.kneighbors(coordinates)
    labels = np.asarray(leaf_of)
    return float((labels[indices[:, 1:]] == labels[:, None]).mean())
