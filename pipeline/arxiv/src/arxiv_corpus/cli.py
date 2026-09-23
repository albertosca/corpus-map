"""The `arxiv-corpus` command: fetch, embed, project, export -- and `all` in one shot.

Each stage reads the previous stage's cached intermediate under `<cache-dir>/stages/` and
writes its own, so a failed run re-runs just the failed stage. The heavy, real-world wiring
(network client, the real embedding model, the real projector) lives behind `make_dependencies`,
a small factory tests replace wholesale -- so the base install and the test suite never need
the optional `model` extra.
"""

from __future__ import annotations

import argparse
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
DEFAULT_CACHE_DIR = Path(".cache")

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
    """The real factory: a throttled network client, the real embedder and projector."""
    client = Client(get=http_get, sleep=time.sleep, now=time.monotonic, cache_dir=cache_dir / "responses")
    return Dependencies(
        client=client,
        embedder=BgeEmbedder,
        projector=UmapProjector,
        today=date.today,
        model_name="BAAI/bge-small-en-v1.5",
        umap_params={"n_neighbors": 15, "min_dist": 0.1, "metric": "cosine", "random_state": 42},
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


def _resolve_out(out: Path | None) -> Path:
    return out if out is not None else default_out_dir()


def _resolve_cache_dir(cache_dir: Path | None) -> Path:
    return cache_dir if cache_dir is not None else DEFAULT_CACHE_DIR


def _stage_dir(cache_dir: Path) -> Path:
    return cache_dir / "stages"


def _papers_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "papers.json"


def _embeddings_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "embeddings.npy"


def _coordinates_path(cache_dir: Path) -> Path:
    return _stage_dir(cache_dir) / "coordinates.npy"


def _require_cached(path: Path, prior_stage: str, what: str) -> None:
    """Raise a clear `ValueError` if `path` (this stage's expected input) is not there yet.

    The stage split is the recovery mechanism a failed run relies on -- Task 6 runs stages
    by hand -- so a missing intermediate must name both the file and the command that
    produces it, not surface as a raw `FileNotFoundError` deep in `json.loads`/`np.load`.
    """
    if not path.exists():
        raise ValueError(f"no cached {what} at {path} — run 'arxiv-corpus {prior_stage}' first")


def run_fetch(deps: Dependencies, cache_dir: Path, n: int, floor: int) -> None:
    """Count and sample every `cs.*` category, then cache the resulting papers."""
    totals = {code: deps.client.total(code) for code in sorted(CATEGORIES)}
    quota = quotas(totals, n=n, floor=floor)

    papers: list[Paper] = []
    for code in sorted(CATEGORIES):
        if quota[code] > 0:
            papers.extend(deps.client.papers(code, quota[code]))

    payload = {"n": n, "floor": floor, "papers": [asdict(paper) for paper in papers]}
    stage_dir = _stage_dir(cache_dir)
    stage_dir.mkdir(parents=True, exist_ok=True)
    _papers_path(cache_dir).write_text(json.dumps(payload), encoding="utf-8")


def run_embed(deps: Dependencies, cache_dir: Path) -> None:
    """Embed the cached papers' abstracts and cache the resulting vectors."""
    papers_path = _papers_path(cache_dir)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    abstracts = [paper["abstract"] for paper in payload["papers"]]
    vectors = deps.embedder().embed(abstracts)
    np.save(_embeddings_path(cache_dir), vectors)


def run_project(deps: Dependencies, cache_dir: Path) -> None:
    """Project the cached embeddings to 2D, rescale them, and cache the coordinates."""
    embeddings_path = _embeddings_path(cache_dir)
    _require_cached(embeddings_path, prior_stage="embed", what="embeddings")
    vectors = np.load(embeddings_path)
    xy = rescale(deps.projector().project(vectors))
    np.save(_coordinates_path(cache_dir), xy)


def run_export(deps: Dependencies, cache_dir: Path, out_dir: Path) -> None:
    """Build the checked `MapSpec` from the cached papers and coordinates, and write it."""
    papers_path = _papers_path(cache_dir)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    coordinates_path = _coordinates_path(cache_dir)
    _require_cached(coordinates_path, prior_stage="project", what="projected coordinates")

    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    papers = [Paper(**fields) for fields in payload["papers"]]
    xy = np.load(coordinates_path)

    spec = build_spec(papers, xy)
    per_category = dict(sorted(Counter(paper.category for paper in papers).items()))
    meta: dict[str, object] = {
        "fetched_at": deps.today().isoformat(),
        "query": QUERY_SHAPE,
        "n": payload["n"],
        "floor": payload["floor"],
        "model": deps.model_name,
        "umap": deps.umap_params,
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
