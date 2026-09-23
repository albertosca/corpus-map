"""The `arxiv-corpus` command: fetch, embed, project, export -- and `all` in one shot.

Each stage reads the previous stage's cached intermediate under `<cache-dir>/stages/` and
writes its own, so a failed run re-runs just the failed stage. The heavy, real-world wiring
(network client, the real embedding model, the real projector) lives behind `make_dependencies`,
a small factory tests replace wholesale -- so the base install and the test suite never need
the optional `model` extra.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import sys
import time
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

import numpy as np

from arxiv_corpus.categories import CATEGORIES
from arxiv_corpus.embed import BgeEmbedder, Embedder
from arxiv_corpus.export import ATTRIBUTION, LICENSE_NOTE, build_spec, write_outputs
from arxiv_corpus.fetch import BASE_URL, Client, Paper, http_get
from arxiv_corpus.project import Projector, UmapProjector, rescale
from arxiv_corpus.sample import quotas

STAGES = ("fetch", "embed", "project", "export", "all")

DEFAULT_N = 8000
DEFAULT_FLOOR = 20

# The query shape actually used, minus `start` (which varies per page) and with `category`
# and `max_results` left as placeholders -- documentary, not a literal request URL.
QUERY_SHAPE = (
    f"{BASE_URL}?search_query=cat:<category>&max_results=<max_results>&sortBy=submittedDate&sortOrder=descending"
)


@dataclass(frozen=True)
class Dependencies:
    """Everything a stage needs from the outside world, gathered in one place.

    `embedder` and `projector` are zero-argument factories, not instances: the real ones
    (`BgeEmbedder`, `UmapProjector`) load model weights at construction time, so they are
    built only by the stage that actually needs them.
    """

    client: Client
    embedder: Callable[[], Embedder]
    projector: Callable[[], Projector]
    today: Callable[[], date]
    model_name: str
    umap_params: dict[str, object]


def make_dependencies(cache_dir: Path) -> Dependencies:  # pragma: no cover -- real network + model wiring
    """The real factory: a throttled network client, the real embedder and projector.

    `model_name` and `umap_params` are read off `BgeEmbedder`/`UmapProjector` themselves,
    the single source of truth `__init__` also reads from -- so meta can never drift from
    what actually ran (M-2).
    """
    client = Client(get=http_get, sleep=time.sleep, now=time.monotonic, cache_dir=cache_dir / "responses")
    return Dependencies(
        client=client,
        embedder=BgeEmbedder,
        projector=UmapProjector,
        today=date.today,
        model_name=BgeEmbedder.MODEL,
        umap_params=UmapProjector.PARAMS,
    )


def default_out_dir() -> Path:
    """The repository's `demo/corpora` directory, resolved from this package's location."""
    return _repo_root() / "demo" / "corpora"


def _repo_root(start: Path | None = None) -> Path:
    """Walk up from `start` (default: this file) until a directory holding `package.json`."""
    current = (start if start is not None else Path(__file__)).resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / "package.json").exists():
            return candidate
    raise RuntimeError(f"could not find the repository root (no package.json above {current})")


def default_cache_dir() -> Path:
    """This package's own `.cache` directory, resolved from this package's location.

    Anchored the same way `default_out_dir` is anchored to the repository root: run from
    the repository root without `--cache-dir` and this still resolves under
    `pipeline/arxiv/.cache` (which `.gitignore` covers), not `<cwd>/.cache` (which does not).
    """
    return _package_root() / ".cache"


def _package_root(start: Path | None = None) -> Path:
    """Walk up from `start` (default: this file) until a directory holding `pyproject.toml`."""
    current = (start if start is not None else Path(__file__)).resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / "pyproject.toml").exists():
            return candidate
    raise RuntimeError(f"could not find the arxiv-corpus package root (no pyproject.toml above {current})")


def _resolve_out(out: Path | None) -> Path:
    return out if out is not None else default_out_dir()


def _resolve_cache_dir(cache_dir: Path | None) -> Path:
    return cache_dir if cache_dir is not None else default_cache_dir()


def _stage_dir(cache_dir: Path) -> Path:
    return cache_dir / "stages"


def _papers_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "papers.json"


def _embeddings_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "embeddings.npy"


def _coordinates_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "coordinates.npy"


def _papers_fingerprint_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "papers.fingerprint"


def _embeddings_fingerprint_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "embeddings.fingerprint"


def _coordinates_fingerprint_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "coordinates.fingerprint"


def _dependency_version(distribution: str) -> str | None:
    """The installed version of `distribution`, or `None` if it is not installed.

    The base install (no `--extra model`) never has `sentence-transformers` or `umap-learn`
    on `sys.path`, so meta records `null` there rather than crashing export over metadata
    about a model that never actually ran.
    """
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def _fingerprint(data: bytes) -> str:
    """The sha256 hex digest of `data` -- the provenance token stages pass along."""
    return hashlib.sha256(data).hexdigest()


def _require_cached(path: Path, prior_stage: str, what: str) -> None:
    """Raise a clear `ValueError` if `path` (this stage's expected input) is not there yet.

    The stage split is the recovery mechanism a failed run relies on -- Task 6 runs stages
    by hand -- so a missing intermediate must name both the file and the command that
    produces it, not surface as a raw `FileNotFoundError` deep in `json.loads`/`np.load`.
    """
    if not path.exists():
        raise ValueError(f"no cached {what} at {path} — run 'arxiv-corpus {prior_stage}' first")


def run_fetch(deps: Dependencies, cache_dir: Path, n: int, floor: int) -> None:
    """Count and sample every `cs.*` category, then cache the resulting papers.

    A category arXiv itself reports as empty (`total == 0`) is skipped and named in a
    stderr warning -- that is expected, not an error (see README.md's cs.NA/cs.SY note).
    Any other category that comes back with fewer papers than its quota is a real
    shortfall -- a transient paging problem, not an empty category -- and raises
    `ValueError` naming every short category and the numbers, before anything is written.

    `--n` and `--floor` are validated before anything else (no network request yet) --
    `quotas` itself already refuses a `floor` that cannot fit every non-empty category
    inside `n`, but a non-positive `n` or a negative `floor` would otherwise reach it and
    produce a confusing downstream error instead of a message naming the bad flag.
    """
    if n <= 0:
        raise ValueError(f"--n must be a positive integer, got {n}")
    if floor < 0:
        raise ValueError(f"--floor must be zero or a positive integer, got {floor}")

    totals = {code: deps.client.total(code) for code in sorted(CATEGORIES)}
    quota = quotas(totals, n=n, floor=floor)

    dropped = sorted(code for code in quota if totals[code] == 0)
    if dropped:
        print(f"dropped: {', '.join(dropped)} (arXiv reports 0 papers)", file=sys.stderr)

    papers: list[Paper] = []
    short: dict[str, tuple[int, int]] = {}
    for code in sorted(CATEGORIES):
        if quota[code] > 0:
            got = deps.client.papers(code, quota[code])
            if len(got) < quota[code]:
                short[code] = (quota[code], len(got))
            papers.extend(got)

    if short:
        detail = ", ".join(f"{code} got {have}/{want}" for code, (want, have) in sorted(short.items()))
        raise ValueError(f"short fetch, quota not met: {detail}")

    payload = {
        "n": n,
        "floor": floor,
        "fetched_at": deps.today().isoformat(),
        "papers": [asdict(paper) for paper in papers],
    }
    payload_text = json.dumps(payload)
    stage_dir = _stage_dir(cache_dir)
    stage_dir.mkdir(parents=True, exist_ok=True)
    _papers_path(cache_dir).write_text(payload_text, encoding="utf-8")
    _papers_fingerprint_path(cache_dir).write_text(_fingerprint(payload_text.encode("utf-8")), encoding="utf-8")


def run_embed(deps: Dependencies, cache_dir: Path) -> None:
    """Embed the cached papers' abstracts and cache the resulting vectors.

    The fingerprint of the papers actually consumed travels along in a sidecar, so `export`
    can later tell whether the coordinates it is about to read trace back to today's
    `papers.json` or to a fetch that has since been replaced.
    """
    papers_path = _papers_path(cache_dir)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    fingerprint_path = _papers_fingerprint_path(cache_dir)
    _require_cached(fingerprint_path, prior_stage="fetch", what="papers fingerprint")
    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    abstracts = [paper["abstract"] for paper in payload["papers"]]
    vectors = deps.embedder().embed(abstracts)
    np.save(_embeddings_path(cache_dir), vectors)
    _embeddings_fingerprint_path(cache_dir).write_text(fingerprint_path.read_text(encoding="utf-8"), encoding="utf-8")


def run_project(deps: Dependencies, cache_dir: Path) -> None:
    """Project the cached embeddings to 2D, rescale them, and cache the coordinates.

    Copies `embed`'s fingerprint sidecar forward unchanged -- see `run_embed`.
    """
    embeddings_path = _embeddings_path(cache_dir)
    _require_cached(embeddings_path, prior_stage="embed", what="embeddings")
    fingerprint_path = _embeddings_fingerprint_path(cache_dir)
    _require_cached(fingerprint_path, prior_stage="embed", what="embeddings fingerprint")
    vectors = np.load(embeddings_path)
    xy = rescale(deps.projector().project(vectors))
    np.save(_coordinates_path(cache_dir), xy)
    _coordinates_fingerprint_path(cache_dir).write_text(fingerprint_path.read_text(encoding="utf-8"), encoding="utf-8")


def run_export(deps: Dependencies, cache_dir: Path, out_dir: Path) -> None:
    """Build the checked `MapSpec` from the cached papers and coordinates, and write it.

    Refuses, before reading anything else, if the cached coordinates were produced from a
    different `papers.json` than the one sitting in the cache now -- a refetch (same length
    or not) must not get silently paired with stale coordinates from the fetch it replaced.
    """
    papers_path = _papers_path(cache_dir)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    coordinates_path = _coordinates_path(cache_dir)
    _require_cached(coordinates_path, prior_stage="project", what="projected coordinates")
    coordinates_fingerprint_path = _coordinates_fingerprint_path(cache_dir)
    _require_cached(coordinates_fingerprint_path, prior_stage="project", what="coordinates fingerprint")

    payload_text = papers_path.read_text(encoding="utf-8")
    current_fingerprint = _fingerprint(payload_text.encode("utf-8"))
    consumed_fingerprint = coordinates_fingerprint_path.read_text(encoding="utf-8")
    if current_fingerprint != consumed_fingerprint:
        raise ValueError(
            "the cached coordinates were produced from a different papers.json than the one now in the "
            "cache — run 'arxiv-corpus embed' (then 'project') to refresh them before exporting"
        )

    payload = json.loads(payload_text)
    papers = [Paper(**fields) for fields in payload["papers"]]
    xy = np.load(coordinates_path)

    spec = build_spec(papers, xy)
    per_category = dict(sorted(Counter(paper.category for paper in papers).items()))
    meta: dict[str, object] = {
        "fetched_at": payload["fetched_at"],
        "query": QUERY_SHAPE,
        "n": payload["n"],
        "floor": payload["floor"],
        "model": deps.model_name,
        "umap": deps.umap_params,
        "model_versions": {
            "sentence_transformers": _dependency_version("sentence-transformers"),
            "umap_learn": _dependency_version("umap-learn"),
        },
        "per_category": per_category,
        "attribution": ATTRIBUTION,
        "license_note": LICENSE_NOTE,
    }
    write_outputs(spec, meta, out_dir)


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="arxiv-corpus")
    subparsers = parser.add_subparsers(dest="stage", required=True)
    for name in STAGES:
        sub = subparsers.add_parser(name)
        sub.add_argument("--out", type=Path, default=None)
        sub.add_argument("--cache-dir", type=Path, default=None)
        sub.add_argument("--n", type=int, default=DEFAULT_N)
        sub.add_argument("--floor", type=int, default=DEFAULT_FLOOR)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    cache_dir = _resolve_cache_dir(args.cache_dir)
    out_dir = _resolve_out(args.out)
    deps = make_dependencies(cache_dir)

    try:
        if args.stage in {"fetch", "all"}:
            run_fetch(deps, cache_dir, args.n, args.floor)
        if args.stage in {"embed", "all"}:
            run_embed(deps, cache_dir)
        if args.stage in {"project", "all"}:
            run_project(deps, cache_dir)
        if args.stage in {"export", "all"}:
            run_export(deps, cache_dir, out_dir)
    except ValueError as err:
        print(str(err), file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":  # pragma: no cover -- exercised via the `arxiv-corpus` entry point
    raise SystemExit(main())
