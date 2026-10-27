"""The `arxiv-corpus` command: fetch, embed, project, edges, cluster, name, check, export -- and `all`.

`cluster` cuts the 2D map into Ward leaves under groups, `name` asks Claude to name them, `check`
holds the names to a blind test, and `export` writes only names that passed it. Each stage reads
the previous stage's cached intermediate under `<cache-dir>/stages/` and writes its own, so a
failed run re-runs just the failed stage. The heavy, real-world wiring (network client, the real
embedding model, the real projector, the Claude client) lives behind `make_dependencies`, a small
factory tests replace wholesale -- so the base install and the test suite never need the optional
`model` or `naming` extras, and never call Claude.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import sys
import time
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

from arxiv_corpus import blind, cluster, describe, naming
from arxiv_corpus.categories import CATEGORIES, name_of
from arxiv_corpus.claude import NAMING_MODEL, claude_ask
from arxiv_corpus.claude_code import subscription_ask
from arxiv_corpus.edges import EDGE_FLOOR, EDGES_PER_PAPER, cross_category_edges
from arxiv_corpus.embed import BgeEmbedder, Embedder
from arxiv_corpus.export import ATTRIBUTION, LICENSE_NOTE, Clustering, build_spec, clean_title, write_outputs
from arxiv_corpus.fetch import BASE_URL, Client, Paper, http_get
from arxiv_corpus.project import Projector, UmapProjector, rescale
from arxiv_corpus.sample import quotas

STAGES = ("fetch", "embed", "project", "edges", "cluster", "name", "check", "export", "all")

DEFAULT_PAPER_COUNT = 8000
DEFAULT_FLOOR = 20

# The query shape actually used, minus `start` (which varies per page) and with `category`
# and `max_results` left as placeholders -- documentary, not a literal request URL.
QUERY_SHAPE = (
    f"{BASE_URL}?search_query=cat:<category>&max_results=<max_results>&sortBy=submittedDate&sortOrder=descending"
)


@dataclass(frozen=True)
class ClusterSettings:
    """The cut ranges, how many central titles the namer sees, and how many titles per leaf the test holds out."""

    leaf_counts: range
    group_counts: range
    central_titles: int
    held_out_per_leaf: int


REAL_CLUSTER_SETTINGS = ClusterSettings(
    cluster.LEAF_COUNTS, cluster.GROUP_COUNTS, describe.CENTRAL_TITLES, blind.HELD_OUT_PER_LEAF
)


@dataclass(frozen=True)
class Dependencies:
    """Everything a stage needs from the outside world, gathered in one place.

    `embedder` and `projector` are zero-argument factories, not instances: the real ones
    (`BgeEmbedder`, `UmapProjector`) load model weights at construction time, so they are
    built only by the stage that actually needs them. `ask` is one too: the real one picks the
    naming backend (`naming_backend`), which only `name` and `check` use.
    """

    client: Client
    embedder: Callable[[], Embedder]
    projector: Callable[[], Projector]
    today: Callable[[], date]
    model_name: str
    umap_params: dict[str, object]
    ask: Callable[[], naming.Ask]
    naming_model: str
    cluster_settings: ClusterSettings


NAMING_BACKENDS: dict[str, Callable[[str], naming.Ask]] = {"api": claude_ask, "subscription": subscription_ask}


def naming_backend(environment: Mapping[str, str]) -> Callable[[str], naming.Ask]:
    """`ARXIV_NAMING_BACKEND` picks how `name` and `check` reach Claude: `subscription` (the default, `claude -p`
    on the owner's Claude Code login) or `api` (the SDK, billed to ANTHROPIC_API_KEY)."""
    chosen = environment.get("ARXIV_NAMING_BACKEND", "subscription")
    if chosen not in NAMING_BACKENDS:
        raise ValueError(
            f"unknown ARXIV_NAMING_BACKEND {chosen!r}; expected one of {', '.join(sorted(NAMING_BACKENDS))}"
        )
    return NAMING_BACKENDS[chosen]


def make_dependencies(cache_directory: Path) -> Dependencies:  # pragma: no cover -- real network + model wiring
    """The real factory: a throttled network client, the real embedder and projector.

    `model_name` and `umap_params` are read off `BgeEmbedder`/`UmapProjector` themselves,
    the single source of truth `__init__` also reads from -- so meta can never drift from
    what actually ran (M-2).
    """
    client = Client(get=http_get, sleep=time.sleep, now=time.monotonic, cache_dir=cache_directory / "responses")
    return Dependencies(
        client=client,
        embedder=BgeEmbedder,
        projector=UmapProjector,
        today=date.today,
        model_name=BgeEmbedder.MODEL,
        umap_params=UmapProjector.PARAMS,
        ask=lambda: naming_backend(os.environ)(NAMING_MODEL),
        naming_model=NAMING_MODEL,
        cluster_settings=REAL_CLUSTER_SETTINGS,
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


def _resolve_cache_dir(cache_directory: Path | None) -> Path:
    return cache_directory if cache_directory is not None else default_cache_dir()


def _stage_dir(cache_directory: Path) -> Path:
    return cache_directory / "stages"


def _papers_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "papers.json"


def _embeddings_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "embeddings.npy"


def _coordinates_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "coordinates.npy"


def _papers_fingerprint_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "papers.fingerprint"


def _embeddings_fingerprint_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "embeddings.fingerprint"


def _coordinates_fingerprint_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "coordinates.fingerprint"


def _edges_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "edges.json"


def _edges_fingerprint_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "edges.fingerprint"


def _clusters_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "clusters.json"


def _names_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "names.json"


def _check_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "check.json"


def _check_failed_path(cache_directory: Path) -> Path:
    return _stage_dir(cache_directory) / "check-failed.json"


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


def run_fetch(deps: Dependencies, cache_directory: Path, paper_count: int, floor: int) -> None:
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
    if paper_count <= 0:
        raise ValueError(f"--n must be a positive integer, got {paper_count}")
    if floor < 0:
        raise ValueError(f"--floor must be zero or a positive integer, got {floor}")

    totals = {code: deps.client.total(code) for code in sorted(CATEGORIES)}
    quota = quotas(totals, n=paper_count, floor=floor)

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
        "n": paper_count,
        "floor": floor,
        "fetched_at": deps.today().isoformat(),
        "papers": [asdict(paper) for paper in papers],
    }
    payload_text = json.dumps(payload)
    stage_directory = _stage_dir(cache_directory)
    stage_directory.mkdir(parents=True, exist_ok=True)
    _papers_path(cache_directory).write_text(payload_text, encoding="utf-8")
    _papers_fingerprint_path(cache_directory).write_text(_fingerprint(payload_text.encode("utf-8")), encoding="utf-8")


def run_embed(deps: Dependencies, cache_directory: Path) -> None:
    """Embed the cached papers' abstracts and cache the resulting vectors.

    The fingerprint of the papers actually consumed travels along in a sidecar, so `export`
    can later tell whether the coordinates it is about to read trace back to today's
    `papers.json` or to a fetch that has since been replaced.
    """
    papers_path = _papers_path(cache_directory)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    fingerprint_path = _papers_fingerprint_path(cache_directory)
    _require_cached(fingerprint_path, prior_stage="fetch", what="papers fingerprint")
    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    abstracts = [paper["abstract"] for paper in payload["papers"]]
    vectors = deps.embedder().embed(abstracts)
    np.save(_embeddings_path(cache_directory), vectors)
    _embeddings_fingerprint_path(cache_directory).write_text(
        fingerprint_path.read_text(encoding="utf-8"), encoding="utf-8"
    )


def run_project(deps: Dependencies, cache_directory: Path) -> None:
    """Project the cached embeddings to 2D, rescale them, and cache the coordinates.

    Copies `embed`'s fingerprint sidecar forward unchanged -- see `run_embed`.
    """
    embeddings_path = _embeddings_path(cache_directory)
    _require_cached(embeddings_path, prior_stage="embed", what="embeddings")
    fingerprint_path = _embeddings_fingerprint_path(cache_directory)
    _require_cached(fingerprint_path, prior_stage="embed", what="embeddings fingerprint")
    vectors = np.load(embeddings_path)
    coordinates = rescale(deps.projector().project(vectors))
    np.save(_coordinates_path(cache_directory), coordinates)
    _coordinates_fingerprint_path(cache_directory).write_text(
        fingerprint_path.read_text(encoding="utf-8"), encoding="utf-8"
    )


def run_edges(cache_directory: Path) -> None:
    """Link each cached paper to its nearest neighbours in other categories, and cache them.

    Rows are normalised here (a zero row stays zero and links to nothing), so the stage does
    not depend on the embedder having normalised them. Copies `embed`'s fingerprint sidecar
    forward, as `project` does, so `export` can refuse edges from a replaced fetch.
    """
    papers_path = _papers_path(cache_directory)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    embeddings_path = _embeddings_path(cache_directory)
    _require_cached(embeddings_path, prior_stage="embed", what="embeddings")
    fingerprint_path = _embeddings_fingerprint_path(cache_directory)
    _require_cached(fingerprint_path, prior_stage="embed", what="embeddings fingerprint")
    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    categories = [paper["category"] for paper in payload["papers"]]
    vectors = np.load(embeddings_path).astype(np.float32)
    if len(vectors) != len(categories):
        raise ValueError(
            f"{len(vectors)} embeddings for {len(categories)} papers — run 'arxiv-corpus embed' to refresh them"
        )
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    unit_rows = np.divide(vectors, norms, out=np.zeros_like(vectors), where=norms > 0)
    edges = cross_category_edges(unit_rows, categories)
    _edges_path(cache_directory).write_text(
        json.dumps([list(edge) for edge in edges], separators=(",", ":")), encoding="utf-8"
    )
    _edges_fingerprint_path(cache_directory).write_text(fingerprint_path.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"{len(edges)} edges")


def _cached_edges(cache_directory: Path, current_fingerprint: str) -> list[tuple[int, int, int]] | None:
    """The cached edges, `None` when the edges stage never ran, refused when they are stale."""
    edges_path = _edges_path(cache_directory)
    if not edges_path.exists():
        return None
    fingerprint_path = _edges_fingerprint_path(cache_directory)
    if not fingerprint_path.exists() or fingerprint_path.read_text(encoding="utf-8") != current_fingerprint:
        raise ValueError(
            "the cached edges were produced from a different papers.json than the one now in the "
            "cache — run 'arxiv-corpus edges' to refresh them before exporting"
        )
    return [(low, high, weight) for low, high, weight in json.loads(edges_path.read_text(encoding="utf-8"))]


def _current_papers(cache_directory: Path) -> tuple[str, str]:
    """The cached papers' text and fingerprint, refused when the coordinates came from another fetch."""
    papers_path = _papers_path(cache_directory)
    _require_cached(papers_path, prior_stage="fetch", what="papers")
    _require_cached(_coordinates_path(cache_directory), prior_stage="project", what="projected coordinates")
    coordinates_fingerprint_path = _coordinates_fingerprint_path(cache_directory)
    _require_cached(coordinates_fingerprint_path, prior_stage="project", what="coordinates fingerprint")
    payload_text = papers_path.read_text(encoding="utf-8")
    current_fingerprint = _fingerprint(payload_text.encode("utf-8"))
    if current_fingerprint != coordinates_fingerprint_path.read_text(encoding="utf-8"):
        raise ValueError(
            "the cached coordinates were produced from a different papers.json than the one now in the "
            "cache — run 'arxiv-corpus embed' (then 'project') to refresh them"
        )
    return payload_text, current_fingerprint


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _text_fingerprint(path: Path) -> str:
    return _fingerprint(path.read_bytes())


def _load_clusters(cache_directory: Path, papers_fingerprint: str) -> Any:
    """`clusters.json`, refused unless it was cut from these papers and these coordinates."""
    path = _clusters_path(cache_directory)
    _require_cached(path, prior_stage="cluster", what="clusters")
    clusters = _read_json(path)
    coordinates_fingerprint = _text_fingerprint(_coordinates_path(cache_directory))
    if clusters["fingerprint"] != papers_fingerprint or clusters["coordinates"] != coordinates_fingerprint:
        raise ValueError(
            "the cached clusters were cut from other papers or coordinates than the ones now in the cache "
            "— run 'arxiv-corpus cluster' to refresh them"
        )
    return clusters


def _load_names(cache_directory: Path, papers_fingerprint: str) -> tuple[Any, Any]:
    """`clusters.json` and `names.json`, refused unless the names were given to these clusters."""
    clusters = _load_clusters(cache_directory, papers_fingerprint)
    path = _names_path(cache_directory)
    _require_cached(path, prior_stage="name", what="names")
    names = _read_json(path)
    if names["clusters"] != _text_fingerprint(_clusters_path(cache_directory)):
        raise ValueError(
            "the cached names were given to other clusters than the ones now in the cache "
            "— run 'arxiv-corpus name' to refresh them"
        )
    return clusters, names


def _load_check(cache_directory: Path, papers_fingerprint: str) -> Any:
    """The passed blind-test report, refused unless it tested the names now in the cache."""
    _load_names(cache_directory, papers_fingerprint)
    path = _check_path(cache_directory)
    _require_cached(path, prior_stage="check", what="blind-test result that passed")
    report = _read_json(path)
    if report["names"] != _text_fingerprint(_names_path(cache_directory)):
        raise ValueError(
            "the cached blind test tested other names than the ones now in the cache "
            "— run 'arxiv-corpus check' to test them"
        )
    return report


def run_cluster(deps: Dependencies, cache_directory: Path) -> None:
    """Cut the map into leaves and groups (Ward), score the cuts, and describe every cluster for naming."""
    payload_text, current_fingerprint = _current_papers(cache_directory)
    embeddings_path = _embeddings_path(cache_directory)
    _require_cached(embeddings_path, prior_stage="embed", what="embeddings")
    papers = [Paper(**fields) for fields in json.loads(payload_text)["papers"]]
    coordinates = np.load(_coordinates_path(cache_directory)).astype(np.float64)
    settings = deps.cluster_settings
    largest = max(settings.leaf_counts.stop, settings.group_counts.stop) - 1
    if largest >= len(papers):
        raise ValueError(f"{largest} clusters need more than {len(papers)} papers")

    tree = cluster.ward_tree(coordinates)
    leaf_cut = cluster.best_cut(tree, coordinates, settings.leaf_counts)
    group_cut = cluster.best_cut(tree, coordinates, settings.group_counts)
    nested = cluster.hierarchy(leaf_cut.labels, group_cut.labels)
    share = cluster.contiguity(coordinates, nested.leaf_of)
    unit_embeddings = describe.unit_rows(np.load(embeddings_path).astype(np.float64))
    group_members = {
        group: sorted(index for leaf in leaves for index in nested.leaf_members[leaf])
        for group, leaves in nested.group_leaves.items()
    }
    clusters = {
        "fingerprint": current_fingerprint,
        "coordinates": _text_fingerprint(_coordinates_path(cache_directory)),
        "leaf_count": leaf_cut.count,
        "group_count": group_cut.count,
        "silhouettes": {
            "leaves": {str(count): value for count, value in leaf_cut.silhouettes.items()},
            "groups": {str(count): value for count, value in group_cut.silhouettes.items()},
        },
        "contiguity": share,
        "leaf_of": nested.leaf_of,
        "group_of": nested.group_of,
        "group_leaves": nested.group_leaves,
        "leaves": describe.describe(nested.leaf_members, papers, unit_embeddings, settings.central_titles),
        "groups": describe.describe(group_members, papers, unit_embeddings, settings.central_titles),
    }
    _clusters_path(cache_directory).write_text(json.dumps(clusters), encoding="utf-8")
    print(f"{leaf_cut.count} leaves in {group_cut.count} groups, contiguity {share:.2f}")


def _entry(description: Any, papers: Sequence[Any]) -> dict[str, object]:
    """What the namer sees of one cluster: its central titles, distinctive words, categories and size."""
    return {
        "size": description["size"],
        "titles": [clean_title(papers[index]["title"]) for index in description["central"]],
        "words": description["words"],
        "categories": description["categories"],
    }


def _leaf_entries(clusters: Any, papers: Sequence[Any]) -> dict[str, dict[str, object]]:
    return {identifier: _entry(description, papers) for identifier, description in clusters["leaves"].items()}


def _group_entries(clusters: Any, papers: Sequence[Any], leaf_names: dict[str, str]) -> dict[str, dict[str, object]]:
    return {
        identifier: {
            **_entry(description, papers),
            "leaves": [leaf_names[leaf] for leaf in clusters["group_leaves"][identifier]],
        }
        for identifier, description in clusters["groups"].items()
    }


def _usage(answers: Sequence[naming.Answer]) -> dict[str, int]:
    return {
        "calls": len(answers),
        "input_tokens": sum(answer.input_tokens for answer in answers),
        "output_tokens": sum(answer.output_tokens for answer in answers),
    }


def run_name(deps: Dependencies, cache_directory: Path) -> None:
    """Ask Claude for a name for every leaf, then every group (seeing its leaves' names), and cache them."""
    payload_text, current_fingerprint = _current_papers(cache_directory)
    clusters = _load_clusters(cache_directory, current_fingerprint)
    papers = json.loads(payload_text)["papers"]
    ask = deps.ask()
    leaf_names, leaf_answer = naming.request_names(ask, "leaf", _leaf_entries(clusters, papers))
    group_names, group_answer = naming.request_names(ask, "group", _group_entries(clusters, papers, leaf_names))
    names = {
        "clusters": _text_fingerprint(_clusters_path(cache_directory)),
        "prompt_version": naming.PROMPT_VERSION,
        "model": deps.naming_model,
        "leaves": leaf_names,
        "groups": group_names,
        "usage": _usage([leaf_answer, group_answer]),
    }
    _names_path(cache_directory).write_text(json.dumps(names, indent=1), encoding="utf-8")


def _renamer(ask: naming.Ask, level: naming.Level, entries: Callable[[], dict[str, dict[str, object]]]) -> blind.Rename:
    """Re-names only the failing ids, keeping the others' names as taken, with the blind test's feedback."""

    def rename(
        failing: set[str], kept: dict[str, str], feedback: dict[str, naming.Feedback]
    ) -> tuple[dict[str, str], naming.Answer]:
        every = entries()
        return naming.request_names(
            ask, level, {identifier: every[identifier] for identifier in sorted(failing)}, kept, feedback
        )

    return rename


def _level_report(result: blind.LevelResult) -> dict[str, object]:
    return {"names": result.names, "passed": result.passed, "attempts": result.attempts}


def run_check(deps: Dependencies, cache_directory: Path) -> None:
    """Hold the names to the blind test: leaves against the arXiv categories, then groups.

    A failing leaf or group is re-named with feedback, at most `blind.MAXIMUM_RENAMES` times.
    A pass writes `check.json` (the names `export` uses); a failure writes `check-failed.json`,
    removes any earlier pass, and stops with the report's path.
    """
    payload_text, current_fingerprint = _current_papers(cache_directory)
    clusters, names = _load_names(cache_directory, current_fingerprint)
    papers = json.loads(payload_text)["papers"]
    settings = deps.cluster_settings
    leaf_members: dict[str, list[int]] = {}
    for index, leaf in enumerate(clusters["leaf_of"]):
        leaf_members.setdefault(leaf, []).append(index)
    central = {identifier: description["central"] for identifier, description in clusters["leaves"].items()}
    drawn = blind.held_out(leaf_members, central, settings.held_out_per_leaf)
    titles = [clean_title(papers[index]["title"]) for index in drawn]
    ask = deps.ask()

    codes = sorted({paper["category"] for paper in papers})
    baseline_names = {code: name_of(code) for code in codes}
    baseline, baseline_answer = blind.run_test(
        ask, titles, [papers[index]["category"] for index in drawn], baseline_names
    )
    answers = [baseline_answer]

    leaf_truth = [clusters["leaf_of"][index] for index in drawn]
    leaves = blind.check_level(
        ask,
        _renamer(ask, "leaf", lambda: _leaf_entries(clusters, papers)),
        titles,
        leaf_truth,
        names["leaves"],
        lambda result: blind.leaf_gate(result, baseline.lift),
    )
    answers.extend(leaves.answers)
    groups: blind.LevelResult | None = None
    if leaves.passed:
        group_truth = [clusters["group_of"][leaf] for leaf in leaf_truth]
        groups = blind.check_level(
            ask,
            _renamer(ask, "group", lambda: _group_entries(clusters, papers, leaves.names)),
            titles,
            group_truth,
            names["groups"],
            blind.group_gate,
        )
        answers.extend(groups.answers)

    passed = leaves.passed and groups is not None and groups.passed
    report = {
        "names": _text_fingerprint(_names_path(cache_directory)),
        "passed": passed,
        "seed": blind.SEED,
        "held_out": len(drawn),
        "baseline": {"names": sorted(baseline_names.values()), "overall": baseline.overall, "lift": baseline.lift},
        "leaves": _level_report(leaves),
        "groups": _level_report(groups) if groups is not None else None,
        "usage": _usage(answers),
    }
    report_text = json.dumps(report, indent=1)
    if not passed:
        failed_path = _check_failed_path(cache_directory)
        failed_path.write_text(report_text, encoding="utf-8")
        _check_path(cache_directory).unlink(missing_ok=True)
        raise ValueError(f"blind test failed after {blind.MAXIMUM_RENAMES} re-namings — report at {failed_path}")
    _check_path(cache_directory).write_text(report_text, encoding="utf-8")
    _check_failed_path(cache_directory).unlink(missing_ok=True)


def run_export(deps: Dependencies, cache_directory: Path, out_directory: Path) -> None:
    """Build the checked `MapSpec` from the cached papers, coordinates, clusters and passed names, and write it.

    Refuses, before reading anything else, if the cached coordinates were produced from a
    different `papers.json` than the one sitting in the cache now -- a refetch (same length
    or not) must not get silently paired with stale coordinates from the fetch it replaced --
    and then anything down the chain (clusters, names, the blind test) that no longer matches.
    """
    payload_text, current_fingerprint = _current_papers(cache_directory)
    report = _load_check(cache_directory, current_fingerprint)
    clusters = _load_clusters(cache_directory, current_fingerprint)
    edges = _cached_edges(cache_directory, current_fingerprint)
    payload = json.loads(payload_text)
    papers = [Paper(**fields) for fields in payload["papers"]]
    coordinates = np.load(_coordinates_path(cache_directory))

    clustering = Clustering(
        leaf_of=clusters["leaf_of"],
        group_of=clusters["group_of"],
        leaf_names=report["leaves"]["names"],
        group_names=report["groups"]["names"],
    )
    spec = build_spec(papers, coordinates, clustering, edges=edges)
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
    if edges is not None:
        meta["edges"] = {"floor": EDGE_FLOOR, "per_paper": EDGES_PER_PAPER, "count": len(edges)}
    meta["clusters"] = {
        "leaves": clusters["leaf_count"],
        "groups": clusters["group_count"],
        "silhouettes": clusters["silhouettes"],
        "contiguity": clusters["contiguity"],
    }
    names = _read_json(_names_path(cache_directory))
    meta["naming"] = {
        "model": names["model"],
        "prompt_version": names["prompt_version"],
        "check": {key: value for key, value in report.items() if key != "names"},
    }
    write_outputs(spec, meta, out_directory)


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="arxiv-corpus")
    subparsers = parser.add_subparsers(dest="stage", required=True)
    for name in STAGES:
        subparser = subparsers.add_parser(name)
        subparser.add_argument("--out", type=Path, default=None)
        subparser.add_argument("--cache-dir", type=Path, default=None)
        subparser.add_argument("--n", type=int, default=DEFAULT_PAPER_COUNT)
        subparser.add_argument("--floor", type=int, default=DEFAULT_FLOOR)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parse_args(argv)
    cache_directory = _resolve_cache_dir(arguments.cache_dir)
    out_directory = _resolve_out(arguments.out)
    deps = make_dependencies(cache_directory)

    try:
        if arguments.stage in {"fetch", "all"}:
            run_fetch(deps, cache_directory, arguments.n, arguments.floor)
        if arguments.stage in {"embed", "all"}:
            run_embed(deps, cache_directory)
        if arguments.stage in {"project", "all"}:
            run_project(deps, cache_directory)
        if arguments.stage in {"edges", "all"}:
            run_edges(cache_directory)
        if arguments.stage in {"cluster", "all"}:
            run_cluster(deps, cache_directory)
        if arguments.stage in {"name", "all"}:
            run_name(deps, cache_directory)
        if arguments.stage in {"check", "all"}:
            run_check(deps, cache_directory)
        if arguments.stage in {"export", "all"}:
            run_export(deps, cache_directory, out_directory)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":  # pragma: no cover -- exercised via the `arxiv-corpus` entry point
    raise SystemExit(main())
