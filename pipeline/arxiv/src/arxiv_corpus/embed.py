"""Turning abstracts into vectors, behind an injectable `Embedder`.

`HashEmbedder` is the deterministic fake tests and CI use: no network, no model weights.
`BgeEmbedder` is the real thing — `BAAI/bge-small-en-v1.5` through sentence-transformers —
and only runs when the optional `model` extra is installed.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from typing import Protocol

import numpy as np
import numpy.typing as npt

HASH_EMBED_DIM = 16


class Embedder(Protocol):
    """Turns a batch of texts into one unit-length vector per text."""

    def embed(self, texts: Sequence[str]) -> npt.NDArray[np.float32]: ...


class HashEmbedder:
    """Deterministic fake embedder for tests and CI.

    Hashes each text with SHA-256 and reads its 32-byte digest as sixteen `uint16` values,
    then L2-normalises them to a unit vector. Same text -> same vector; different text ->
    (with overwhelming probability) a different vector; no network, no model weights.
    """

    def embed(self, texts: Sequence[str]) -> npt.NDArray[np.float32]:
        if not texts:
            return np.zeros((0, HASH_EMBED_DIM), dtype=np.float32)
        return np.stack([_hash_vector(text) for text in texts])


def _hash_vector(text: str) -> npt.NDArray[np.float32]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    raw = np.frombuffer(digest, dtype=np.uint16).astype(np.float32)
    unit = raw / np.linalg.norm(raw)
    return unit.astype(np.float32)


class BgeEmbedder:
    """Real embedder: `BAAI/bge-small-en-v1.5` through sentence-transformers, CPU, batched.

    Not exercised by the test suite — it needs the optional `model` extra (which pulls
    PyTorch), so the base install and CI never see it.
    """

    def __init__(self) -> None:  # pragma: no cover -- needs the model extra
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer("BAAI/bge-small-en-v1.5", device="cpu")

    def embed(self, texts: Sequence[str]) -> npt.NDArray[np.float32]:  # pragma: no cover -- needs the model extra
        vectors = self._model.encode(list(texts), normalize_embeddings=True, batch_size=64)
        return np.asarray(vectors, dtype=np.float32)
