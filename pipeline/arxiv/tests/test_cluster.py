import numpy as np
import pytest

from arxiv_corpus import cluster


def _clouds(centres: list[tuple[float, float]], per_cloud: int, spread: float = 0.05) -> np.ndarray:
    generator = np.random.default_rng(7)
    return np.concatenate([generator.normal(centre, spread, size=(per_cloud, 2)) for centre in centres])


def test_best_cut_picks_the_count_of_separated_clouds() -> None:
    coordinates = _clouds([(0, 0), (5, 0), (0, 5), (5, 5)], per_cloud=30)
    cut = cluster.best_cut(cluster.ward_tree(coordinates), coordinates, range(2, 7))
    assert cut.count == 4
    assert set(cut.silhouettes) == {2, 3, 4, 5, 6}
    assert len(set(cut.labels.tolist())) == 4


def test_best_cut_breaks_a_tie_towards_the_smaller_count(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cluster, "silhouette_score", lambda _coordinates, _labels: 0.5)
    coordinates = _clouds([(0, 0), (5, 0), (0, 5)], per_cloud=10)
    assert cluster.best_cut(cluster.ward_tree(coordinates), coordinates, range(2, 5)).count == 2


def test_best_cut_treats_float_noise_as_a_tie(monkeypatch: pytest.MonkeyPatch) -> None:
    scores = iter([0.50000001, 0.50000004])
    monkeypatch.setattr(cluster, "silhouette_score", lambda _coordinates, _labels: next(scores))
    coordinates = _clouds([(0, 0), (5, 0), (0, 5)], per_cloud=10)
    assert cluster.best_cut(cluster.ward_tree(coordinates), coordinates, range(2, 4)).count == 2


def test_cuts_of_one_tree_nest() -> None:
    coordinates = _clouds([(0, 0), (5, 0), (0, 5), (5, 5), (10, 10)], per_cloud=12, spread=0.8)
    tree = cluster.ward_tree(coordinates)
    leaves = cluster.best_cut(tree, coordinates, range(4, 6))
    groups = cluster.best_cut(tree, coordinates, range(2, 3))
    result = cluster.hierarchy(leaves.labels, groups.labels)
    assert sum(len(members) for members in result.leaf_members.values()) == len(coordinates)


def test_hierarchy_nests_leaves_in_groups_with_ids_by_size() -> None:
    # Group with leaves of 3 and 1 papers (4 in all) comes before nothing: the other group has 5 papers.
    leaf_labels = np.array([0, 0, 0, 1, 2, 2, 2, 2, 2])
    group_labels = np.array([0, 0, 0, 0, 1, 1, 1, 1, 1])
    result = cluster.hierarchy(leaf_labels, group_labels)
    assert result.group_leaves == {"g1": ["g1-l1"], "g2": ["g2-l1", "g2-l2"]}
    assert result.leaf_members == {"g1-l1": [4, 5, 6, 7, 8], "g2-l1": [0, 1, 2], "g2-l2": [3]}
    assert result.leaf_of == ["g2-l1", "g2-l1", "g2-l1", "g2-l2", "g1-l1", "g1-l1", "g1-l1", "g1-l1", "g1-l1"]
    assert result.group_of == {"g1-l1": "g1", "g2-l1": "g2", "g2-l2": "g2"}


def test_hierarchy_refuses_a_leaf_split_across_two_groups() -> None:
    with pytest.raises(ValueError, match="spans groups"):
        cluster.hierarchy(np.array([0, 0, 1]), np.array([0, 1, 1]))


def test_hierarchy_breaks_a_size_tie_by_the_smallest_member_index() -> None:
    result = cluster.hierarchy(np.array([1, 1, 0, 0]), np.array([1, 1, 0, 0]))
    assert result.leaf_members == {"g1-l1": [0, 1], "g2-l1": [2, 3]}
    tied_leaves = cluster.hierarchy(np.array([1, 0, 1, 0]), np.array([0, 0, 0, 0]))
    assert tied_leaves.leaf_members == {"g1-l1": [0, 2], "g1-l2": [1, 3]}


def test_contiguity_is_one_for_separated_clouds_and_lower_when_labels_cross() -> None:
    coordinates = _clouds([(0, 0), (9, 9)], per_cloud=20)
    clean = ["a"] * 20 + ["b"] * 20
    assert cluster.contiguity(coordinates, clean, neighbours=5) == 1.0
    mixed = ["a", "b"] * 20
    assert cluster.contiguity(coordinates, mixed, neighbours=5) < 0.7


def test_the_real_ranges_are_the_spec_values() -> None:
    assert range(18, 27) == cluster.LEAF_COUNTS
    assert range(5, 10) == cluster.GROUP_COUNTS
    assert cluster.NEIGHBOURS == 10
