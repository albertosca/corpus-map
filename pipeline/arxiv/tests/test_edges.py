from __future__ import annotations

import numpy as np
import pytest

from arxiv_corpus import edges
from arxiv_corpus.edges import EDGE_FLOOR, EDGES_PER_PAPER, cross_category_edges


def unit(rows: list[list[float]]) -> np.ndarray:
    matrix = np.asarray(rows, dtype=np.float32)
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def test_links_only_across_categories_above_the_floor() -> None:
    embeddings = unit([[1, 0], [1, 0.01], [1, 0.02], [0, 1]])
    edges = cross_category_edges(embeddings, ["a", "a", "b", "b"], floor=0.9, per_paper=3)
    assert edges == [(0, 2, 100), (1, 2, 100)]


def test_keeps_at_most_per_paper_neighbours_and_dedupes_pairs() -> None:
    embeddings = unit([[1, 0], [1, 0.1], [1, 0.2], [1, 0.3], [1, 0.4]])
    edges = cross_category_edges(embeddings, ["a", "b", "c", "d", "e"], floor=0.0, per_paper=1)
    pairs = {(low, high) for low, high, _ in edges}
    assert len(pairs) == len(edges)
    assert all(low < high for low, high, _ in edges)
    assert all(degree <= 1 for degree in _degrees(edges).values())
    assert edges


def _degrees(edges: list[tuple[int, int, int]]) -> dict[int, int]:
    degrees: dict[int, int] = {}
    for low, high, _ in edges:
        degrees[low] = degrees.get(low, 0) + 1
        degrees[high] = degrees.get(high, 0) + 1
    return degrees


def test_a_hub_keeps_only_its_per_paper_heaviest_edges() -> None:
    # Paper 0 is every other paper's nearest neighbour; it keeps the two most similar.
    embeddings = unit([[1, 0], [1, 0.05], [1, 0.1], [1, 0.2], [1, 0.3], [1, -0.4]])
    edges = cross_category_edges(embeddings, ["hub", "a", "a", "a", "a", "a"], floor=0.0, per_paper=2)
    assert [(low, high) for low, high, _ in edges] == [(0, 1), (0, 2)]


def test_is_deterministic_on_ties_preferring_the_lower_index() -> None:
    embeddings = unit([[1, 0], [1, 0], [1, 0]])
    first = cross_category_edges(embeddings, ["a", "b", "c"], floor=0.5, per_paper=1)
    assert first == cross_category_edges(embeddings, ["a", "b", "c"], floor=0.5, per_paper=1)
    assert first == [(0, 1, 100)]


def test_weight_is_the_similarity_in_percent_rounded() -> None:
    embeddings = unit([[1, 0], [0.8, 0.6]])
    assert cross_category_edges(embeddings, ["a", "b"], floor=0.5) == [(0, 1, 80)]


def test_a_zero_vector_links_to_nothing() -> None:
    embeddings = np.asarray([[0, 0], [1, 0]], dtype=np.float32)
    assert cross_category_edges(embeddings, ["a", "b"], floor=0.0) == []


def test_no_neighbour_in_another_category_means_no_edge() -> None:
    embeddings = unit([[1, 0], [1, 0.01]])
    assert cross_category_edges(embeddings, ["a", "a"], floor=0.0) == []


def test_empty_input() -> None:
    assert cross_category_edges(np.zeros((0, 4), dtype=np.float32), []) == []


def test_defaults() -> None:
    assert EDGE_FLOOR == 0.80
    assert EDGES_PER_PAPER == 3


def test_the_result_does_not_depend_on_the_block_size(monkeypatch: pytest.MonkeyPatch) -> None:
    generator = np.random.default_rng(7)
    embeddings = unit(generator.normal(size=(40, 8)).tolist())
    categories = [f"c{index % 4}" for index in range(40)]
    whole = cross_category_edges(embeddings, categories, floor=0.3)

    monkeypatch.setattr(edges, "BLOCK", 3)

    assert whole
    assert cross_category_edges(embeddings, categories, floor=0.3) == whole
