from __future__ import annotations

import numpy as np

from arxiv_corpus.embed import HASH_EMBED_DIM, HashEmbedder
from arxiv_corpus.project import FirstTwoProjector, rescale


def test_hash_embedder_shape_matches_texts_and_dimension() -> None:
    embedder = HashEmbedder()

    vectors = embedder.embed(["one", "two", "three"])

    assert vectors.shape == (3, HASH_EMBED_DIM)
    assert vectors.dtype == np.float32


def test_hash_embedder_empty_input_returns_empty_array_with_the_right_dimension() -> None:
    embedder = HashEmbedder()

    vectors = embedder.embed([])

    assert vectors.shape == (0, HASH_EMBED_DIM)


def test_hash_embedder_vectors_have_unit_norm() -> None:
    embedder = HashEmbedder()

    vectors = embedder.embed(["a short abstract about attention mechanisms"])

    assert np.isclose(np.linalg.norm(vectors[0]), 1.0, atol=1e-5)


def test_hash_embedder_is_deterministic() -> None:
    embedder = HashEmbedder()

    first = embedder.embed(["reproducible text"])
    second = embedder.embed(["reproducible text"])

    assert np.array_equal(first, second)


def test_hash_embedder_different_texts_produce_different_vectors() -> None:
    embedder = HashEmbedder()

    vectors = embedder.embed(["sparse attention routing", "federated learning at the edge"])

    assert not np.array_equal(vectors[0], vectors[1])


def test_first_two_projector_returns_first_two_components() -> None:
    projector = FirstTwoProjector()
    vectors = np.array([[1.0, 2.0, 3.0, 4.0], [5.0, 6.0, 7.0, 8.0]], dtype=np.float32)

    result = projector.project(vectors)

    assert result.shape == (2, 2)
    assert result.dtype == np.float64
    assert np.array_equal(result, [[1.0, 2.0], [5.0, 6.0]])


def test_rescale_longer_side_is_exactly_the_requested_side() -> None:
    xy = np.array([[0.0, 0.0], [10.0, 0.0], [0.0, 5.0]], dtype=np.float64)

    result = rescale(xy, side=1000.0)

    assert np.isclose(result[:, 0].max() - result[:, 0].min(), 1000.0)


def test_rescale_keeps_aspect_ratio() -> None:
    xy = np.array([[0.0, 0.0], [10.0, 0.0], [0.0, 5.0]], dtype=np.float64)

    result = rescale(xy, side=1000.0)

    assert np.allclose(result, [[0.0, 0.0], [1000.0, 0.0], [0.0, 500.0]])


def test_rescale_minimum_is_at_zero() -> None:
    xy = np.array([[3.0, 7.0], [13.0, 2.0], [8.0, 12.0]], dtype=np.float64)

    result = rescale(xy, side=1000.0)

    assert np.allclose(result.min(axis=0), [0.0, 0.0])


def test_rescale_degenerate_input_maps_to_the_centre() -> None:
    xy = np.array([[5.0, 5.0], [5.0, 5.0], [5.0, 5.0]], dtype=np.float64)

    result = rescale(xy, side=1000.0)

    assert np.allclose(result, [[500.0, 500.0], [500.0, 500.0], [500.0, 500.0]])


def test_rescale_single_point_maps_to_the_centre() -> None:
    xy = np.array([[3.0, 7.0]], dtype=np.float64)

    result = rescale(xy, side=1000.0)

    assert np.allclose(result, [[500.0, 500.0]])
