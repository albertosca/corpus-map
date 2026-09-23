"""Turning vectors into 2D positions, behind an injectable `Projector`, and rescaling them.

`FirstTwoProjector` is the deterministic fake tests use: it just keeps the first two
components. `UmapProjector` is the real thing — UMAP with the design's fixed parameters —
and only runs when the optional `model` extra is installed.
"""

from __future__ import annotations

from typing import ClassVar, Protocol

import numpy as np
import numpy.typing as npt


class Projector(Protocol):
    """Turns a batch of vectors into one (x, y) position per vector."""

    def project(self, vectors: npt.NDArray[np.float32]) -> npt.NDArray[np.float64]: ...


class FirstTwoProjector:
    """Deterministic fake projector for tests: the vectors' first two components, unchanged."""

    def project(self, vectors: npt.NDArray[np.float32]) -> npt.NDArray[np.float64]:
        return vectors[:, :2].astype(np.float64)


class UmapProjector:
    """Real projector: UMAP with the design's fixed parameters (cosine metric, seeded).

    Not exercised by the test suite — it needs the optional `model` extra, so the base
    install and CI never see it.
    """

    PARAMS: ClassVar[dict[str, object]] = {"n_neighbors": 15, "min_dist": 0.1, "metric": "cosine", "random_state": 42}

    def __init__(self) -> None:  # pragma: no cover -- needs the model extra
        import umap

        self._model = umap.UMAP(**self.PARAMS)

    def project(
        self, vectors: npt.NDArray[np.float32]
    ) -> npt.NDArray[np.float64]:  # pragma: no cover -- needs the model extra
        result = self._model.fit_transform(vectors)
        return np.asarray(result, dtype=np.float64)


def rescale(xy: npt.NDArray[np.float64], side: float = 1000.0) -> npt.NDArray[np.float64]:
    """Translate `xy` to start at (0, 0) and scale uniformly so the longer side is `side`.

    A degenerate input (every point equal, so the extent is zero on both axes) maps every
    point to the centre of the box, `(side / 2, side / 2)`.
    """
    mins = xy.min(axis=0)
    maxs = xy.max(axis=0)
    longer = (maxs - mins).max()

    if longer == 0:
        return np.full(xy.shape, side / 2, dtype=np.float64)

    return (xy - mins) * (side / longer)
