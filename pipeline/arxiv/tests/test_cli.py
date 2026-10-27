from __future__ import annotations

import dataclasses
import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from arxiv_corpus import blind, cli, export, naming
from arxiv_corpus.categories import name_of
from arxiv_corpus.embed import BgeEmbedder, HashEmbedder
from arxiv_corpus.fetch import Client
from arxiv_corpus.project import FirstTwoProjector, UmapProjector

FIXTURES = Path(__file__).parent / "fixtures"

# `page.atom` (shared with test_fetch.py) has exactly three entries: two primary cs.CL, one
# primary cs.LG. These are the only totals a fetch against that fixture can actually satisfy.
PAGE_ATOM_TOTALS = {"cs.CL": 2, "cs.LG": 1}


def _count_atom(total: int) -> str:
    """A minimal `max_results=1` response reporting `total` -- `Client.total()` needs nothing
    else from it."""
    return (
        "<?xml version='1.0' encoding='UTF-8'?>"
        '<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" '
        'xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">'
        f"<opensearch:totalResults>{total}</opensearch:totalResults>"
        "</feed>"
    )


ZERO_TOTAL_ATOM = _count_atom(0)


def _fixture_get(url: str) -> str:
    """Serve a real count for cs.CL/cs.LG's count request (matching `page.atom`'s actual
    entries), a zero count for every other category's count request, and `page.atom` for
    every papers page.
    """
    if "max_results=1" in url:
        for code, total in PAGE_ATOM_TOTALS.items():
            if f"cat:{code}" in url:
                return _count_atom(total)
        return ZERO_TOTAL_ATOM
    return (FIXTURES / "page.atom").read_text(encoding="utf-8")


# Small enough for the three-paper fixture: two leaves, two groups, one central title each.
FIXTURE_SETTINGS = cli.ClusterSettings(range(2, 3), range(2, 3), 1, 20)
# Three clouds of twelve: the best leaf cut is three, under two groups.
CLOUD_SETTINGS = cli.ClusterSettings(range(2, 4), range(2, 3), 2, 20)


class _Oracle:
    """A stand-in for Claude that knows the truth, read from the cache the stages write.

    Names every leaf `Leaf <id>` and every group `Group <id>`; answers a leaf or group check
    with each title's true leaf or group (or with the first name offered, when `wrong`), and the
    category baseline with a name other than the title's category, so the clusters beat it.
    """

    def __init__(self, cache_directory: Path, wrong: bool = False) -> None:
        self.cache_directory = cache_directory
        self.wrong = wrong
        self.kinds: list[str] = []

    def __call__(self, prompt: str, _schema: dict[str, Any]) -> naming.Answer:
        payload = json.loads(prompt.split(naming.INPUT_MARKER, 1)[1])
        self.kinds.append(payload["kind"])
        if payload["kind"] == "leaf":
            answer: object = {"names": {identifier: f"Leaf {identifier}" for identifier in payload["entries"]}}
        elif payload["kind"] == "group":
            answer = {"names": {identifier: f"Group {identifier}" for identifier in payload["entries"]}}
        else:
            chosen = [self._choose(item["title"], payload["names"]) for item in payload["titles"]]
            answer = {"answers": [{"number": number, "name": name} for number, name in enumerate(chosen, start=1)]}
        return naming.Answer(json.dumps(answer), "oracle", 100, 10)

    def _choose(self, title: str, offered: list[str]) -> str:
        stages = self.cache_directory / "stages"
        papers = json.loads((stages / "papers.json").read_text(encoding="utf-8"))["papers"]
        clusters = json.loads((stages / "clusters.json").read_text(encoding="utf-8"))
        index = next(index for index, paper in enumerate(papers) if export.clean_title(paper["title"]) == title)
        leaf = clusters["leaf_of"][index]
        if offered[0].startswith("Leaf "):
            return offered[0] if self.wrong else f"Leaf {leaf}"
        if offered[0].startswith("Group "):
            return offered[0] if self.wrong else f"Group {clusters['group_of'][leaf]}"
        return next(name for name in offered if name != name_of(papers[index]["category"]))


def make_fake_dependencies(
    cache_directory: Path, cluster_settings: cli.ClusterSettings = FIXTURE_SETTINGS, wrong: bool = False
) -> cli.Dependencies:
    client = Client(get=_fixture_get, sleep=lambda _seconds: None, now=lambda: 0.0, gap=0.0, cache_dir=cache_directory)
    return cli.Dependencies(
        client=client,
        embedder=HashEmbedder,
        projector=FirstTwoProjector,
        today=lambda: date(2026, 9, 23),
        model_name="hash-embedder-test",
        umap_params={"fake": True},
        ask=lambda: _Oracle(cache_directory, wrong),
        naming_model="fake-namer",
        cluster_settings=cluster_settings,
    )


@pytest.fixture
def fake_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "make_dependencies", make_fake_dependencies)


# --- end to end ---


def test_all_produces_a_spec_that_passes_check_spec(
    fake_dependencies: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"

    exit_code = cli.main(
        ["all", "--out", str(out_directory), "--cache-dir", str(cache_directory), "--n", "3", "--floor", "1"]
    )

    assert exit_code == 0
    spec = json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


def test_all_output_spans_at_least_two_territories_from_the_fixture(fake_dependencies: None, tmp_path: Path) -> None:
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"

    cli.main(["all", "--out", str(out_directory), "--cache-dir", str(cache_directory), "--n", "3", "--floor", "1"])

    spec = json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    assert {territory["id"] for territory in spec["territories"]} == {"g1", "g1-l1", "g2", "g2-l1"}
    assert spec["categories"] == [
        {"id": "cs.CL", "name": "Computation and Language"},
        {"id": "cs.LG", "name": "Machine Learning"},
    ]
    assert len(spec["nodes"]) == 3


def test_all_writes_meta_with_the_injected_and_computed_fields(
    fake_dependencies: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"
    fake_versions = {"sentence-transformers": "9.9.9", "umap-learn": None}
    monkeypatch.setattr(cli, "_dependency_version", lambda distribution: fake_versions[distribution])

    cli.main(["all", "--out", str(out_directory), "--cache-dir", str(cache_directory), "--n", "3", "--floor", "1"])

    meta = json.loads((out_directory / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert meta["fetched_at"] == "2026-09-23"
    assert meta["query"] == cli.QUERY_SHAPE
    assert meta["n"] == 3
    assert meta["floor"] == 1
    assert meta["model"] == "hash-embedder-test"
    assert meta["umap"] == {"fake": True}
    assert meta["model_versions"] == {"sentence_transformers": "9.9.9", "umap_learn": None}
    assert meta["per_category"] == {"cs.CL": 2, "cs.LG": 1}
    assert meta["attribution"] == export.ATTRIBUTION
    assert meta["license_note"] == export.LICENSE_NOTE
    assert meta["clusters"]["leaves"] == 2
    assert meta["clusters"]["groups"] == 2
    assert meta["naming"]["model"] == "fake-namer"
    assert meta["naming"]["prompt_version"] == naming.PROMPT_VERSION
    assert meta["naming"]["check"]["passed"] is True


def test_dependency_version_returns_the_installed_version_of_a_base_dependency() -> None:
    """`numpy` is a base (non-optional) dependency of this package, so it is always
    installed, in the test suite's environment as everywhere else."""
    assert cli._dependency_version("numpy") is not None


def test_dependency_version_returns_none_for_an_uninstalled_distribution() -> None:
    assert cli._dependency_version("definitely-not-a-real-package-xyz") is None


def test_make_dependencies_reads_model_name_and_umap_params_off_the_real_classes(tmp_path: Path) -> None:
    """`make_dependencies` never re-hardcodes the model name or UMAP parameters -- they come
    from the same class constants `BgeEmbedder`/`UmapProjector` read at construction time
    (M-2), so meta can never drift from what actually ran. Constructing `Dependencies` here
    needs no model weights and makes no network request."""
    deps = cli.make_dependencies(tmp_path)

    assert deps.model_name == BgeEmbedder.MODEL
    assert deps.umap_params == UmapProjector.PARAMS


# --- stage isolation ---


def _fixture_get_with_an_empty_category(url: str) -> str:
    """Like `_fixture_get`, but `cs.LG` (normally non-empty) reports zero papers this time."""
    if "max_results=1" in url and "cat:cs.LG" in url:
        return ZERO_TOTAL_ATOM
    return _fixture_get(url)


def test_run_fetch_skips_fetching_a_category_whose_quota_is_zero(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    client = Client(
        get=_fixture_get_with_an_empty_category,
        sleep=lambda _seconds: None,
        now=lambda: 0.0,
        gap=0.0,
        cache_dir=cache_directory,
    )
    deps = dataclasses.replace(make_fake_dependencies(cache_directory), client=client)

    cli.run_fetch(deps, cache_directory, paper_count=2, floor=1)

    payload = json.loads((cache_directory / "stages" / "papers.json").read_text(encoding="utf-8"))
    categories = {paper["category"] for paper in payload["papers"]}
    assert "cs.LG" not in categories
    assert "cs.CL" in categories


def test_run_fetch_warns_on_stderr_for_every_zero_total_category(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    deps = make_fake_dependencies(cache_directory)

    cli.run_fetch(deps, cache_directory, paper_count=3, floor=1)

    captured = capsys.readouterr()
    warning_line = next(line for line in captured.err.splitlines() if line.startswith("dropped:"))
    dropped = warning_line.removeprefix("dropped: ").split(" (arXiv reports 0 papers)")[0].split(", ")
    assert "cs.AI" in dropped
    assert "cs.CL" not in dropped
    assert "cs.LG" not in dropped


def test_run_fetch_prints_no_warning_when_every_category_has_papers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "CATEGORIES", {"cs.CL": "Computation and Language", "cs.LG": "Machine Learning"})
    cache_directory = tmp_path / "cache"
    deps = make_fake_dependencies(cache_directory)

    cli.run_fetch(deps, cache_directory, paper_count=3, floor=1)

    captured = capsys.readouterr()
    assert "dropped:" not in captured.err


def _fixture_get_with_cs_cl_undercounted(url: str) -> str:
    """Like `_fixture_get`, but cs.CL's count claims 5 papers though the page only has 2 (a
    transient short page, not an empty category), and cs.LG is zeroed out so it cannot
    contribute to the quota math."""
    if "max_results=1" in url and "cat:cs.CL" in url:
        return _count_atom(5)
    if "max_results=1" in url and "cat:cs.LG" in url:
        return ZERO_TOTAL_ATOM
    return _fixture_get(url)


def test_main_exits_2_naming_a_category_that_comes_back_short_of_its_quota(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"

    def fake_make_dependencies(cache_directory: Path) -> cli.Dependencies:
        client = Client(
            get=_fixture_get_with_cs_cl_undercounted,
            sleep=lambda _seconds: None,
            now=lambda: 0.0,
            gap=0.0,
            cache_dir=cache_directory,
        )
        return dataclasses.replace(make_fake_dependencies(cache_directory), client=client)

    monkeypatch.setattr(cli, "make_dependencies", fake_make_dependencies)

    exit_code = cli.main(
        ["fetch", "--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "5", "--floor", "1"]
    )

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "cs.CL" in captured.err
    assert "2/5" in captured.err
    assert not (cache_directory / "stages" / "papers.json").exists()


def test_each_stage_can_be_rerun_alone_from_cached_intermediates(fake_dependencies: None, tmp_path: Path) -> None:
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "3", "--floor", "1"]

    assert cli.main(["fetch", *common]) == 0
    stage_directory = cache_directory / "stages"
    assert (stage_directory / "papers.json").exists()
    assert not (stage_directory / "embeddings.npy").exists()

    assert cli.main(["embed", *common]) == 0
    assert (stage_directory / "embeddings.npy").exists()
    assert not (stage_directory / "coordinates.npy").exists()

    assert cli.main(["project", *common]) == 0
    assert (stage_directory / "coordinates.npy").exists()
    assert not (out_directory / "arxiv.json").exists()

    for stage in ("cluster", "name", "check"):
        assert cli.main([stage, *common]) == 0
    assert (stage_directory / "check.json").exists()

    # export alone, reading only the cached stage outputs from the runs above
    assert cli.main(["export", *common]) == 0
    spec = json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


def test_export_alone_reads_cached_papers_and_coordinates_without_touching_the_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "3", "--floor", "1"]

    monkeypatch.setattr(cli, "make_dependencies", make_fake_dependencies)
    for stage in ("fetch", "embed", "project", "cluster", "name", "check"):
        assert cli.main([stage, *common]) == 0

    def failing_get(_url: str) -> str:
        raise AssertionError("export must not call the network")

    def failing_ask() -> naming.Ask:
        raise AssertionError("export must not call Claude")

    def failing_dependencies(cache_directory: Path) -> cli.Dependencies:
        client = Client(get=failing_get, sleep=lambda _s: None, now=lambda: 0.0, cache_dir=cache_directory)
        return dataclasses.replace(make_fake_dependencies(cache_directory), client=client, ask=failing_ask)

    monkeypatch.setattr(cli, "make_dependencies", failing_dependencies)

    assert cli.main(["export", *common]) == 0
    spec = json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


def test_meta_fetched_at_is_the_fetch_date_not_the_export_date(tmp_path: Path) -> None:
    """A stage split invites `export` running on a later day than `fetch` did; meta must
    still record when the papers were actually fetched, not export's clock."""
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    client = Client(get=_fixture_get, sleep=lambda _seconds: None, now=lambda: 0.0, gap=0.0, cache_dir=cache_directory)

    fetch_deps = dataclasses.replace(
        make_fake_dependencies(cache_directory), client=client, today=lambda: date(2026, 1, 1)
    )
    cli.run_fetch(fetch_deps, cache_directory, paper_count=3, floor=1)
    cli.run_embed(fetch_deps, cache_directory)
    cli.run_project(fetch_deps, cache_directory)
    cli.run_cluster(fetch_deps, cache_directory)
    cli.run_name(fetch_deps, cache_directory)
    cli.run_check(fetch_deps, cache_directory)

    export_deps = dataclasses.replace(make_fake_dependencies(cache_directory), client=client)
    cli.run_export(export_deps, cache_directory, out_directory)

    meta = json.loads((out_directory / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert meta["fetched_at"] == "2026-01-01"


# --- quota validation (M-3) ---


def test_main_exits_2_for_a_non_positive_n(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"

    exit_code = cli.main(
        ["fetch", "--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "0", "--floor", "1"]
    )

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "--n" in captured.err
    assert "0" in captured.err
    assert not (cache_directory / "stages" / "papers.json").exists()


def test_main_exits_2_for_a_negative_floor(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"

    exit_code = cli.main(
        ["fetch", "--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "3", "--floor", "-1"]
    )

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "--floor" in captured.err
    assert "-1" in captured.err
    assert not (cache_directory / "stages" / "papers.json").exists()


# --- provenance (I-2) ---


def test_export_refuses_coordinates_from_a_different_fetch(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A refetch (same length or not) must not silently pair with stale coordinates."""
    out_directory = tmp_path / "out"
    cache_directory = tmp_path / "cache"
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "3", "--floor", "1"]

    assert cli.main(["all", *common]) == 0

    papers_path = cache_directory / "stages" / "papers.json"
    payload = json.loads(papers_path.read_text(encoding="utf-8"))
    for index, paper in enumerate(payload["papers"]):
        paper["id"] = f"9999.{index:05d}"
    papers_path.write_text(json.dumps(payload), encoding="utf-8")

    exit_code = cli.main(["export", *common])

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "arxiv-corpus embed" in captured.err


def test_run_embed_without_a_papers_fingerprint_names_fetch_as_the_predecessor(tmp_path: Path) -> None:
    """A `papers.json` with no fingerprint sidecar (e.g. a pre-existing cache) is as unusable
    as a missing `papers.json` -- `embed` has nothing trustworthy to copy forward."""
    cache_directory = tmp_path / "cache"
    stage_directory = cache_directory / "stages"
    stage_directory.mkdir(parents=True)
    (stage_directory / "papers.json").write_text(json.dumps({"n": 1, "floor": 1, "papers": []}), encoding="utf-8")
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"papers fingerprint.*run 'arxiv-corpus fetch' first"):
        cli.run_embed(deps, cache_directory)


def test_run_project_without_an_embeddings_fingerprint_names_embed_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    stage_directory = cache_directory / "stages"
    stage_directory.mkdir(parents=True)
    np.save(stage_directory / "embeddings.npy", np.zeros((1, 2), dtype=np.float32))
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"embeddings fingerprint.*run 'arxiv-corpus embed' first"):
        cli.run_project(deps, cache_directory)


def test_run_export_without_a_coordinates_fingerprint_names_project_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    stage_directory = cache_directory / "stages"
    stage_directory.mkdir(parents=True)
    (stage_directory / "papers.json").write_text(json.dumps({"n": 1, "floor": 1, "papers": []}), encoding="utf-8")
    np.save(stage_directory / "coordinates.npy", np.zeros((0, 2), dtype=np.float64))
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"coordinates fingerprint.*run 'arxiv-corpus project' first"):
        cli.run_export(deps, cache_directory, out_directory)


# --- missing predecessor stage ---


def test_run_embed_without_cached_papers_names_fetch_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus fetch' first"):
        cli.run_embed(deps, cache_directory)


def test_run_project_without_cached_embeddings_names_embed_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus embed' first"):
        cli.run_project(deps, cache_directory)


def test_run_export_without_cached_papers_names_fetch_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    deps = make_fake_dependencies(cache_directory)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus fetch' first"):
        cli.run_export(deps, cache_directory, out_directory)


def test_run_export_without_cached_projection_names_project_as_the_predecessor(
    fake_dependencies: None, tmp_path: Path
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory), "--n", "3", "--floor", "1"]
    cli.main(["fetch", *common])  # papers cached; embeddings/coordinates deliberately not

    deps = make_fake_dependencies(cache_directory)
    with pytest.raises(ValueError, match=r"run 'arxiv-corpus project' first"):
        cli.run_export(deps, cache_directory, out_directory)


def test_main_prints_the_missing_predecessor_message_to_stderr_and_returns_nonzero(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"

    exit_code = cli.main(["embed", "--cache-dir", str(cache_directory), "--out", str(out_directory)])

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "no cached papers" in captured.err
    assert "run 'arxiv-corpus fetch' first" in captured.err
    assert captured.out == ""


# --- pure helpers ---


def test_default_out_dir_points_at_the_repo_demo_corpora_directory() -> None:
    result = cli.default_out_dir()

    assert result.name == "corpora"
    assert result.parent.name == "demo"
    assert (result.parent.parent / "package.json").exists()


def test_repo_root_raises_when_no_package_json_is_found_above(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"package\.json"):
        cli._repo_root(tmp_path / "nested" / "module.py")


def test_resolve_out_defaults_to_demo_corpora_when_none() -> None:
    assert cli._resolve_out(None) == cli.default_out_dir()


def test_resolve_out_keeps_an_explicit_value(tmp_path: Path) -> None:
    assert cli._resolve_out(tmp_path) == tmp_path


def test_resolve_cache_dir_defaults_to_the_package_cache_dir_when_none() -> None:
    assert cli._resolve_cache_dir(None) == cli.default_cache_dir()


def test_resolve_cache_dir_keeps_an_explicit_value(tmp_path: Path) -> None:
    assert cli._resolve_cache_dir(tmp_path) == tmp_path


def test_default_cache_dir_points_at_the_package_cache_dir_not_cwd(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """From the repo root (or anywhere else) without `--cache-dir`, the cache still resolves
    under `pipeline/arxiv/.cache` -- which `.gitignore` covers -- not `<cwd>/.cache`, which
    does not (M-1)."""
    monkeypatch.chdir(tmp_path)

    result = cli.default_cache_dir()

    assert result.name == ".cache"
    assert result.parent.name == "arxiv"
    assert (result.parent / "pyproject.toml").exists()
    assert result != tmp_path / ".cache"


def test_package_root_raises_when_no_pyproject_toml_is_found_above(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"pyproject\.toml"):
        cli._package_root(tmp_path / "nested" / "module.py")


# --- edges ---


def _seed_cache(
    cache_directory: Path, embeddings: np.ndarray, categories: list[str], coordinates: np.ndarray | None = None
) -> None:
    """A fetch + embed + project cache written by hand: one paper per row, fingerprints agreeing.

    Coordinates default to a line, `(index, 0)` for each paper."""
    papers = [
        {
            "id": f"2610.{index:05d}",
            "title": f"Paper {index}",
            "abstract": "an abstract",
            "category": category,
            "year": 2026,
        }
        for index, category in enumerate(categories)
    ]
    payload_text = json.dumps({"n": len(papers), "floor": 0, "fetched_at": "2026-10-25", "papers": papers})
    stage_directory = cache_directory / "stages"
    stage_directory.mkdir(parents=True, exist_ok=True)
    (stage_directory / "papers.json").write_text(payload_text, encoding="utf-8")
    fingerprint = cli._fingerprint(payload_text.encode("utf-8"))
    np.save(stage_directory / "embeddings.npy", embeddings)
    if coordinates is None:
        coordinates = np.asarray([[float(index), 0.0] for index in range(len(papers))])
    np.save(stage_directory / "coordinates.npy", coordinates)
    for name in ("papers", "embeddings", "coordinates"):
        (stage_directory / f"{name}.fingerprint").write_text(fingerprint, encoding="utf-8")


# Rows 0 and 2 (and 1 and 2) are near-identical across categories; row 3 points elsewhere.
SEED_EMBEDDINGS = np.asarray([[1, 0], [1, 0.01], [1, 0.02], [0, 1]], dtype=np.float32)
SEED_CATEGORIES = ["cs.CL", "cs.CL", "cs.LG", "cs.LG"]


def test_edges_stage_writes_index_triples_and_prints_the_count(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)

    assert cli.main(["edges", "--cache-dir", str(cache_directory), "--out", str(tmp_path / "out")]) == 0

    edges = json.loads((cache_directory / "stages" / "edges.json").read_text(encoding="utf-8"))
    assert edges == [[0, 2, 100], [1, 2, 100]]
    assert "2 edges" in capsys.readouterr().out


def test_edges_stage_normalises_rows_that_are_not_unit_length(fake_dependencies: None, tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_cache(cache_directory, SEED_EMBEDDINGS * 7, SEED_CATEGORIES)

    assert cli.main(["edges", "--cache-dir", str(cache_directory), "--out", str(tmp_path / "out")]) == 0

    edges = json.loads((cache_directory / "stages" / "edges.json").read_text(encoding="utf-8"))
    assert edges == [[0, 2, 100], [1, 2, 100]]


def test_export_writes_the_cached_edges_and_their_meta(fake_dependencies: None, tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory)]

    for stage in ("edges", "cluster", "name", "check", "export"):
        assert cli.main([stage, *common]) == 0

    spec = json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    assert spec["edges"] == [[0, 2, 100], [1, 2, 100]]
    meta = json.loads((out_directory / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert meta["edges"] == {"floor": 0.8, "per_paper": 3, "count": 2}


def test_export_without_cached_edges_writes_neither_edges_nor_their_meta(
    fake_dependencies: None, tmp_path: Path
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)

    for stage in ("cluster", "name", "check", "export"):
        assert cli.main([stage, "--cache-dir", str(cache_directory), "--out", str(out_directory)]) == 0

    assert "edges" not in json.loads((out_directory / "arxiv.json").read_text(encoding="utf-8"))
    assert "edges" not in json.loads((out_directory / "arxiv.meta.json").read_text(encoding="utf-8"))


def test_export_refuses_edges_from_a_different_fetch(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)
    common = ["--cache-dir", str(cache_directory), "--out", str(out_directory)]
    for stage in ("edges", "cluster", "name", "check"):
        assert cli.main([stage, *common]) == 0
    (cache_directory / "stages" / "edges.fingerprint").write_text("stale", encoding="utf-8")

    assert cli.main(["export", *common]) == 2

    assert "arxiv-corpus edges" in capsys.readouterr().err
    assert not (out_directory / "arxiv.json").exists()


def test_run_edges_without_cached_embeddings_names_embed_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)
    (cache_directory / "stages" / "embeddings.npy").unlink()

    with pytest.raises(ValueError, match="arxiv-corpus embed"):
        cli.run_edges(cache_directory)


def test_run_edges_without_an_embeddings_fingerprint_names_embed_as_the_predecessor(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_cache(cache_directory, SEED_EMBEDDINGS, SEED_CATEGORIES)
    (cache_directory / "stages" / "embeddings.fingerprint").unlink()

    with pytest.raises(ValueError, match="arxiv-corpus embed"):
        cli.run_edges(cache_directory)


def test_run_edges_refuses_embeddings_that_do_not_match_the_papers(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_cache(cache_directory, SEED_EMBEDDINGS[:3], SEED_CATEGORIES)

    with pytest.raises(ValueError, match="3 embeddings for 4 papers"):
        cli.run_edges(cache_directory)


def test_all_runs_the_edges_stage(fake_dependencies: None, tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"

    cli.main(["all", "--out", str(tmp_path / "out"), "--cache-dir", str(cache_directory), "--n", "3", "--floor", "1"])

    assert (cache_directory / "stages" / "edges.json").exists()


# --- cluster, name, check ------------------------------------------------------------------------------------------

CLOUD_CENTRES = [(0.0, 0.0), (10.0, 0.0), (0.0, 10.0)]
PER_CLOUD = 12


def _seed_clouds(cache_directory: Path, shift: float = 0.0) -> None:
    """Three separated clouds of twelve papers, two categories mixed inside each cloud."""
    generator = np.random.default_rng(11)
    coordinates = np.concatenate(
        [
            generator.normal((horizontal + shift, vertical), 0.3, size=(PER_CLOUD, 2))
            for horizontal, vertical in CLOUD_CENTRES
        ]
    )
    count = len(coordinates)
    embeddings = np.asarray([[1.0, index / count] for index in range(count)], dtype=np.float32)
    categories = ["cs.CL" if index % 3 else "cs.LG" for index in range(count)]
    _seed_cache(cache_directory, embeddings, categories, coordinates)


@pytest.fixture
def cloud_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "make_dependencies", lambda cache: make_fake_dependencies(cache, CLOUD_SETTINGS))


@pytest.fixture
def wrong_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        cli, "make_dependencies", lambda cache: make_fake_dependencies(cache, CLOUD_SETTINGS, wrong=True)
    )


def _stages(cache_directory: Path) -> Path:
    return cache_directory / "stages"


def _run(stage: str, cache_directory: Path, out_directory: Path) -> int:
    return cli.main([stage, "--cache-dir", str(cache_directory), "--out", str(out_directory)])


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_cluster_writes_the_cut_its_scores_and_both_levels_described(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)

    assert _run("cluster", cache_directory, tmp_path / "out") == 0

    clusters = _read(_stages(cache_directory) / "clusters.json")
    papers_text = (_stages(cache_directory) / "papers.json").read_text(encoding="utf-8")
    assert clusters["fingerprint"] == cli._fingerprint(papers_text.encode("utf-8"))
    assert clusters["coordinates"] == cli._fingerprint((_stages(cache_directory) / "coordinates.npy").read_bytes())
    assert (clusters["leaf_count"], clusters["group_count"]) == (3, 2)
    assert set(clusters["silhouettes"]["leaves"]) == {"2", "3"}
    assert set(clusters["silhouettes"]["groups"]) == {"2"}
    assert clusters["contiguity"] == 1.0
    assert len(clusters["leaf_of"]) == 36
    assert clusters["group_leaves"] == {"g1": ["g1-l1", "g1-l2"], "g2": ["g2-l1"]}
    assert clusters["group_of"] == {"g1-l1": "g1", "g1-l2": "g1", "g2-l1": "g2"}
    assert set(clusters["leaves"]) == {"g1-l1", "g1-l2", "g2-l1"}
    assert set(clusters["groups"]) == {"g1", "g2"}
    leaf = clusters["leaves"]["g1-l1"]
    assert leaf["size"] == PER_CLOUD
    assert len(leaf["central"]) == CLOUD_SETTINGS.central_titles
    assert clusters["groups"]["g1"]["size"] == 2 * PER_CLOUD
    assert "3 leaves in 2 groups, contiguity 1.00" in capsys.readouterr().out


def test_name_writes_every_leaf_and_group_name_with_the_model_and_usage(
    cloud_dependencies: None, tmp_path: Path
) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    assert _run("cluster", cache_directory, tmp_path / "out") == 0

    assert _run("name", cache_directory, tmp_path / "out") == 0

    names = _read(_stages(cache_directory) / "names.json")
    clusters_text = (_stages(cache_directory) / "clusters.json").read_text(encoding="utf-8")
    assert names["clusters"] == cli._fingerprint(clusters_text.encode("utf-8"))
    assert names["leaves"] == {"g1-l1": "Leaf g1-l1", "g1-l2": "Leaf g1-l2", "g2-l1": "Leaf g2-l1"}
    assert names["groups"] == {"g1": "Group g1", "g2": "Group g2"}
    assert names["prompt_version"] == naming.PROMPT_VERSION
    assert names["model"] == "fake-namer"
    assert names["usage"] == {"calls": 2, "input_tokens": 200, "output_tokens": 20}


def test_name_shows_the_namer_central_titles_and_a_group_its_leaves_names(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    deps = make_fake_dependencies(cache_directory, CLOUD_SETTINGS)
    prompts: list[Any] = []
    oracle = deps.ask()

    def recording(prompt: str, schema: dict[str, Any]) -> naming.Answer:
        prompts.append(json.loads(prompt.split(naming.INPUT_MARKER, 1)[1]))
        return oracle(prompt, schema)

    deps = dataclasses.replace(deps, ask=lambda: recording)
    cli.run_cluster(deps, cache_directory)
    cli.run_name(deps, cache_directory)

    clusters = _read(_stages(cache_directory) / "clusters.json")
    leaf_entry = prompts[0]["entries"]["g1-l1"]
    central = clusters["leaves"]["g1-l1"]["central"]
    assert leaf_entry["titles"] == [f"Paper {index}" for index in central]
    assert leaf_entry["size"] == PER_CLOUD
    assert leaf_entry["words"] == clusters["leaves"]["g1-l1"]["words"]
    assert leaf_entry["categories"] == clusters["leaves"]["g1-l1"]["categories"]
    assert prompts[1]["kind"] == "group"
    assert prompts[1]["entries"]["g1"]["leaves"] == ["Leaf g1-l1", "Leaf g1-l2"]


def test_check_writes_the_report_and_export_writes_leaves_under_groups(
    cloud_dependencies: None, tmp_path: Path
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name", "check", "export"):
        assert _run(stage, cache_directory, out_directory) == 0

    report = _read(_stages(cache_directory) / "check.json")
    names_text = (_stages(cache_directory) / "names.json").read_text(encoding="utf-8")
    assert report["names"] == cli._fingerprint(names_text.encode("utf-8"))
    assert report["passed"] is True
    assert report["seed"] == blind.SEED
    assert report["held_out"] == 3 * (PER_CLOUD - CLOUD_SETTINGS.central_titles)
    assert report["baseline"]["names"] == ["Computation and Language", "Machine Learning"]
    assert report["baseline"]["overall"] == 0.0
    assert report["leaves"]["passed"] is True
    assert report["leaves"]["names"] == {"g1-l1": "Leaf g1-l1", "g1-l2": "Leaf g1-l2", "g2-l1": "Leaf g2-l1"}
    assert report["leaves"]["attempts"][0]["overall"] == 1.0
    assert report["groups"]["names"] == {"g1": "Group g1", "g2": "Group g2"}
    assert report["groups"]["passed"] is True
    assert report["usage"] == {"calls": 3, "input_tokens": 300, "output_tokens": 30}
    assert not (_stages(cache_directory) / "check-failed.json").exists()

    spec = _read(out_directory / "arxiv.json")
    export.check_spec(spec)
    territories = {territory["id"]: territory for territory in spec["territories"]}
    assert territories["g1"] == {"id": "g1", "name": "Group g1", "centroid": territories["g1"]["centroid"]}
    assert territories["g1-l2"]["parent"] == "g1"
    assert territories["g1-l2"]["name"] == "Leaf g1-l2"
    meta = _read(out_directory / "arxiv.meta.json")
    assert meta["clusters"] == {
        "leaves": 3,
        "groups": 2,
        "silhouettes": _read(_stages(cache_directory) / "clusters.json")["silhouettes"],
        "contiguity": 1.0,
    }
    assert meta["naming"]["check"] == {key: value for key, value in report.items() if key != "names"}


def test_a_failing_blind_test_writes_its_report_and_export_refuses_without_a_pass(
    wrong_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name"):
        assert _run(stage, cache_directory, out_directory) == 0
    (_stages(cache_directory) / "check.json").write_text("{}", encoding="utf-8")

    assert _run("check", cache_directory, out_directory) == 2

    failed_path = _stages(cache_directory) / "check-failed.json"
    assert f"blind test failed after {blind.MAXIMUM_RENAMES} re-namings — report at {failed_path}" in (
        capsys.readouterr().err
    )
    report = _read(failed_path)
    assert report["passed"] is False
    assert len(report["leaves"]["attempts"]) == blind.MAXIMUM_RENAMES + 1
    assert report["groups"] is None
    assert not (_stages(cache_directory) / "check.json").exists()

    assert _run("export", cache_directory, out_directory) == 2
    assert "run 'arxiv-corpus check'" in capsys.readouterr().err
    assert not (out_directory / "arxiv.json").exists()


def test_a_failing_group_check_also_stops_the_stage(tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    deps = make_fake_dependencies(cache_directory, CLOUD_SETTINGS)
    right = deps.ask()
    wrong = make_fake_dependencies(cache_directory, CLOUD_SETTINGS, wrong=True).ask()

    def leaves_right_groups_wrong(prompt: str, schema: dict[str, Any]) -> naming.Answer:
        offered = json.loads(prompt.split(naming.INPUT_MARKER, 1)[1]).get("names", [""])
        return (wrong if offered[0].startswith("Group ") else right)(prompt, schema)

    deps = dataclasses.replace(deps, ask=lambda: leaves_right_groups_wrong)
    cli.run_cluster(deps, cache_directory)
    cli.run_name(deps, cache_directory)
    with pytest.raises(ValueError, match="blind test failed"):
        cli.run_check(deps, cache_directory)
    report = _read(_stages(cache_directory) / "check-failed.json")
    assert report["leaves"]["passed"] is True
    assert report["groups"]["passed"] is False


def test_a_passing_check_removes_an_old_failure_report(cloud_dependencies: None, tmp_path: Path) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name"):
        assert _run(stage, cache_directory, tmp_path / "out") == 0
    (_stages(cache_directory) / "check-failed.json").write_text("{}", encoding="utf-8")

    assert _run("check", cache_directory, tmp_path / "out") == 0
    assert not (_stages(cache_directory) / "check-failed.json").exists()


def test_a_refetch_makes_name_check_and_export_ask_for_a_new_cluster(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name", "check"):
        assert _run(stage, cache_directory, out_directory) == 0
    papers_path = _stages(cache_directory) / "papers.json"
    payload = _read(papers_path)
    payload["fetched_at"] = "2026-10-26"
    _seed_cache(
        cache_directory,
        np.load(_stages(cache_directory) / "embeddings.npy"),
        [paper["category"] for paper in payload["papers"]][::-1],
        np.load(_stages(cache_directory) / "coordinates.npy"),
    )
    capsys.readouterr()

    for stage in ("name", "check", "export"):
        assert _run(stage, cache_directory, out_directory) == 2
        assert "run 'arxiv-corpus cluster'" in capsys.readouterr().err, stage
    assert not (out_directory / "arxiv.json").exists()


def test_a_new_cluster_makes_check_and_export_ask_for_new_names(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name", "check"):
        assert _run(stage, cache_directory, out_directory) == 0
    _seed_clouds(cache_directory, shift=0.5)
    assert _run("cluster", cache_directory, out_directory) == 0
    capsys.readouterr()

    for stage in ("check", "export"):
        assert _run(stage, cache_directory, out_directory) == 2
        assert "run 'arxiv-corpus name'" in capsys.readouterr().err, stage


def test_new_names_make_export_ask_for_a_new_check(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    out_directory = tmp_path / "out"
    _seed_clouds(cache_directory)
    for stage in ("cluster", "name", "check"):
        assert _run(stage, cache_directory, out_directory) == 0
    names_path = _stages(cache_directory) / "names.json"
    names_path.write_text(names_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    capsys.readouterr()

    assert _run("export", cache_directory, out_directory) == 2
    assert "run 'arxiv-corpus check'" in capsys.readouterr().err


def test_new_coordinates_make_name_ask_for_a_new_cluster(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    assert _run("cluster", cache_directory, tmp_path / "out") == 0
    _seed_clouds(cache_directory, shift=0.5)
    capsys.readouterr()

    assert _run("name", cache_directory, tmp_path / "out") == 2
    assert "run 'arxiv-corpus cluster'" in capsys.readouterr().err


@pytest.mark.parametrize(
    ("stage", "predecessor"),
    [("name", "cluster"), ("check", "cluster"), ("check", "name"), ("export", "check")],
)
def test_each_new_stage_without_its_predecessor_names_it(
    cloud_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str], stage: str, predecessor: str
) -> None:
    cache_directory = tmp_path / "cache"
    _seed_clouds(cache_directory)
    ran = {"cluster": [], "name": ["cluster"], "check": ["cluster", "name"]}[predecessor]
    for earlier in ran:
        assert _run(earlier, cache_directory, tmp_path / "out") == 0
    capsys.readouterr()

    assert _run(stage, cache_directory, tmp_path / "out") == 2
    assert f"run 'arxiv-corpus {predecessor}' first" in capsys.readouterr().err


def test_cluster_without_coordinates_names_project(tmp_path: Path) -> None:
    deps = make_fake_dependencies(tmp_path)
    with pytest.raises(ValueError, match="run 'arxiv-corpus fetch' first"):
        cli.run_cluster(deps, tmp_path)
    _seed_clouds(tmp_path)
    (_stages(tmp_path) / "coordinates.npy").unlink()
    with pytest.raises(ValueError, match="run 'arxiv-corpus project' first"):
        cli.run_cluster(deps, tmp_path)


def test_cluster_refuses_coordinates_from_a_different_fetch(tmp_path: Path) -> None:
    _seed_clouds(tmp_path)
    (_stages(tmp_path) / "coordinates.fingerprint").write_text("stale", encoding="utf-8")
    with pytest.raises(ValueError, match="run 'arxiv-corpus embed'"):
        cli.run_cluster(make_fake_dependencies(tmp_path, CLOUD_SETTINGS), tmp_path)


def test_cluster_refuses_a_count_as_large_as_the_corpus(tmp_path: Path) -> None:
    _seed_cache(tmp_path, SEED_EMBEDDINGS, SEED_CATEGORIES)
    settings = cli.ClusterSettings(range(2, 5), range(2, 3), 1, 20)
    with pytest.raises(ValueError, match="4 clusters need more than 4 papers"):
        cli.run_cluster(make_fake_dependencies(tmp_path, settings), tmp_path)


def test_the_real_cluster_settings_are_the_spec_values() -> None:
    from arxiv_corpus import cluster, describe

    assert (
        cli.ClusterSettings(cluster.LEAF_COUNTS, cluster.GROUP_COUNTS, describe.CENTRAL_TITLES, blind.HELD_OUT_PER_LEAF)
        == cli.REAL_CLUSTER_SETTINGS
    )


def test_make_dependencies_names_with_opus_and_the_real_settings(tmp_path: Path) -> None:
    deps = cli.make_dependencies(tmp_path)
    assert deps.naming_model == "claude-opus-5-5"
    assert deps.cluster_settings == cli.REAL_CLUSTER_SETTINGS


def test_the_stages_run_in_pipeline_order() -> None:
    assert cli.STAGES == ("fetch", "embed", "project", "edges", "cluster", "name", "check", "export", "all")


def test_the_naming_backend_defaults_to_the_subscription() -> None:
    from arxiv_corpus import claude_code

    assert cli.naming_backend({}) is claude_code.subscription_ask
    assert cli.naming_backend({"ARXIV_NAMING_BACKEND": "subscription"}) is claude_code.subscription_ask


def test_the_api_naming_backend_is_the_sdk_call() -> None:
    from arxiv_corpus import claude

    assert cli.naming_backend({"ARXIV_NAMING_BACKEND": "api"}) is claude.claude_ask


def test_an_unknown_naming_backend_is_refused_by_name() -> None:
    with pytest.raises(ValueError, match=r"'cli'.*api, subscription"):
        cli.naming_backend({"ARXIV_NAMING_BACKEND": "cli"})
