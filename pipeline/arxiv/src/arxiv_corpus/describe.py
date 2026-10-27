"""What Claude sees of each cluster when it names it (spec 2026-10-27, section 2.1).

Per cluster: the central titles (cosine nearest the centroid in the embedding space), the distinctive
words by class-based TF-IDF over title plus abstract, the arXiv categories holding at least 5%, the size.
"""

import math
import re
from collections import Counter
from collections.abc import Mapping, Sequence
from typing import TypedDict

import numpy as np
from numpy.typing import NDArray
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from arxiv_corpus.fetch import Paper

CENTRAL_TITLES = 10
DISTINCTIVE_WORDS = 12
CATEGORY_SHARE_FLOOR = 0.05


class Description(TypedDict):
    size: int
    central: list[int]
    words: list[str]
    categories: dict[str, float]


_WORD = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")


def unit_rows(embeddings: NDArray[np.float64]) -> NDArray[np.float64]:
    rows = np.asarray(embeddings, dtype=np.float64)
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    unit: NDArray[np.float64] = np.divide(rows, norms, out=np.zeros_like(rows), where=norms > 0)
    return unit


def central_indices(unit_embeddings: NDArray[np.float64], members: Sequence[int], count: int) -> list[int]:
    rows = unit_embeddings[list(members)]
    centroid = rows.mean(axis=0)
    norm = float(np.linalg.norm(centroid))
    similarity = rows @ (centroid / norm) if norm > 0 else np.zeros(len(members))
    order = sorted(range(len(members)), key=lambda position: (-float(similarity[position]), members[position]))
    return [members[position] for position in order[:count]]


def tokens(text: str) -> list[str]:
    return [word for word in _WORD.findall(text.lower()) if len(word) > 1 and word not in ENGLISH_STOP_WORDS]


def distinctive_words(texts_by_class: Mapping[str, Sequence[str]], count: int) -> dict[str, list[str]]:
    """Class-based TF-IDF: a word's share of its class, weighted by how rare it is across all classes."""
    counts = {name: Counter(word for text in texts for word in tokens(text)) for name, texts in texts_by_class.items()}
    overall: Counter[str] = Counter()
    for counter in counts.values():
        overall.update(counter)
    average = sum(overall.values()) / len(counts)
    result: dict[str, list[str]] = {}
    for name, counter in counts.items():
        total = sum(counter.values())
        scores = {word: (seen / total) * math.log(1 + average / overall[word]) for word, seen in counter.items()}
        ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        result[name] = [word for word, _score in ranked[:count]]
    return result


def category_mix(categories: Sequence[str], members: Sequence[int]) -> dict[str, float]:
    counter = Counter(categories[index] for index in members)
    shares = {
        code: seen / len(members) for code, seen in counter.items() if seen / len(members) >= CATEGORY_SHARE_FLOOR
    }
    return {code: round(share, 3) for code, share in sorted(shares.items(), key=lambda item: (-item[1], item[0]))}


def describe(
    members_by_id: Mapping[str, Sequence[int]],
    papers: Sequence[Paper],
    unit_embeddings: NDArray[np.float64],
    central_count: int = CENTRAL_TITLES,
) -> dict[str, Description]:
    texts = {
        identifier: [f"{papers[index].title} {papers[index].abstract}" for index in members]
        for identifier, members in members_by_id.items()
    }
    words = distinctive_words(texts, DISTINCTIVE_WORDS)
    categories = [paper.category for paper in papers]
    return {
        identifier: Description(
            size=len(members),
            central=central_indices(unit_embeddings, members, central_count),
            words=words[identifier],
            categories=category_mix(categories, members),
        )
        for identifier, members in members_by_id.items()
    }
