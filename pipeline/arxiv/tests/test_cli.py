from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from arxiv_corpus import cli, export
from arxiv_corpus.embed import HashEmbedder
from arxiv_corpus.fetch import Client
from arxiv_corpus.project import FirstTwoProjector

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


def make_fake_dependencies(cache_dir: Path) -> cli.Dependencies:
    client = Client(get=_fixture_get, sleep=lambda _seconds: None, now=lambda: 0.0, gap=0.0, cache_dir=cache_dir)
    return cli.Dependencies(
        client=client,
        embedder=HashEmbedder,
        projector=FirstTwoProjector,
        today=lambda: date(2026, 9, 23),
        model_name="hash-embedder-test",
        umap_params={"fake": True},
    )


@pytest.fixture
def fake_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "make_dependencies", make_fake_dependencies)


# --- end to end ---


def test_all_produces_a_spec_that_passes_check_spec(
    fake_dependencies: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"

    exit_code = cli.main(["all", "--out", str(out_dir), "--cache-dir", str(cache_dir), "--n", "3", "--floor", "1"])

    assert exit_code == 0
    spec = json.loads((out_dir / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


def test_all_output_spans_at_least_two_territories_from_the_fixture(fake_dependencies: None, tmp_path: Path) -> None:
    out_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"

    cli.main(["all", "--out", str(out_dir), "--cache-dir", str(cache_dir), "--n", "3", "--floor", "1"])

    spec = json.loads((out_dir / "arxiv.json").read_text(encoding="utf-8"))
    assert {t["id"] for t in spec["territories"]} == {"cs.CL", "cs.LG"}
    assert len(spec["nodes"]) == 3


def test_all_writes_meta_with_the_injected_and_computed_fields(fake_dependencies: None, tmp_path: Path) -> None:
    out_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"

    cli.main(["all", "--out", str(out_dir), "--cache-dir", str(cache_dir), "--n", "3", "--floor", "1"])

    meta = json.loads((out_dir / "arxiv.meta.json").read_text(encoding="utf-8"))
    assert meta["fetched_at"] == "2026-09-23"
    assert meta["query"] == cli.QUERY_SHAPE
    assert meta["n"] == 3
    assert meta["floor"] == 1
    assert meta["model"] == "hash-embedder-test"
    assert meta["umap"] == {"fake": True}
    assert meta["per_category"] == {"cs.CL": 2, "cs.LG": 1}
    assert meta["attribution"] == export.ATTRIBUTION
    assert meta["license_note"] == export.LICENSE_NOTE


# --- stage isolation ---


def _fixture_get_with_an_empty_category(url: str) -> str:
    """Like `_fixture_get`, but `cs.LG` (normally non-empty) reports zero papers this time."""
    if "max_results=1" in url and "cat:cs.LG" in url:
        return ZERO_TOTAL_ATOM
    return _fixture_get(url)


def test_run_fetch_skips_fetching_a_category_whose_quota_is_zero(tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    client = Client(
        get=_fixture_get_with_an_empty_category,
        sleep=lambda _seconds: None,
        now=lambda: 0.0,
        gap=0.0,
        cache_dir=cache_dir,
    )
    deps = cli.Dependencies(
        client=client,
        embedder=HashEmbedder,
        projector=FirstTwoProjector,
        today=lambda: date(2026, 9, 23),
        model_name="hash-embedder-test",
        umap_params={"fake": True},
    )

    cli.run_fetch(deps, cache_dir, n=2, floor=1)

    payload = json.loads((cache_dir / "stages" / "papers.json").read_text(encoding="utf-8"))
    categories = {paper["category"] for paper in payload["papers"]}
    assert "cs.LG" not in categories
    assert "cs.CL" in categories


def test_run_fetch_warns_on_stderr_for_every_zero_total_category(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_dir = tmp_path / "cache"
    deps = make_fake_dependencies(cache_dir)

    cli.run_fetch(deps, cache_dir, n=3, floor=1)

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
    cache_dir = tmp_path / "cache"
    deps = make_fake_dependencies(cache_dir)

    cli.run_fetch(deps, cache_dir, n=3, floor=1)

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
    cache_dir = tmp_path / "cache"
    out_dir = tmp_path / "out"

    def fake_make_dependencies(cache_dir: Path) -> cli.Dependencies:
        client = Client(
            get=_fixture_get_with_cs_cl_undercounted,
            sleep=lambda _seconds: None,
            now=lambda: 0.0,
            gap=0.0,
            cache_dir=cache_dir,
        )
        return cli.Dependencies(
            client=client,
            embedder=HashEmbedder,
            projector=FirstTwoProjector,
            today=lambda: date(2026, 9, 23),
            model_name="hash-embedder-test",
            umap_params={"fake": True},
        )

    monkeypatch.setattr(cli, "make_dependencies", fake_make_dependencies)

    exit_code = cli.main(["fetch", "--cache-dir", str(cache_dir), "--out", str(out_dir), "--n", "5", "--floor", "1"])

    assert exit_code == 2
    captured = capsys.readouterr()
    assert "cs.CL" in captured.err
    assert "2/5" in captured.err
    assert not (cache_dir / "stages" / "papers.json").exists()


def test_each_stage_can_be_rerun_alone_from_cached_intermediates(fake_dependencies: None, tmp_path: Path) -> None:
    out_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"
    common = ["--cache-dir", str(cache_dir), "--out", str(out_dir), "--n", "3", "--floor", "1"]

    assert cli.main(["fetch", *common]) == 0
    stage_dir = cache_dir / "stages"
    assert (stage_dir / "papers.json").exists()
    assert not (stage_dir / "embeddings.npy").exists()

    assert cli.main(["embed", *common]) == 0
    assert (stage_dir / "embeddings.npy").exists()
    assert not (stage_dir / "coordinates.npy").exists()

    assert cli.main(["project", *common]) == 0
    assert (stage_dir / "coordinates.npy").exists()
    assert not (out_dir / "arxiv.json").exists()

    # export alone, reading only the cached project output from the run above
    assert cli.main(["export", *common]) == 0
    spec = json.loads((out_dir / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


def test_export_alone_reads_cached_papers_and_coordinates_without_touching_the_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"
    common = ["--cache-dir", str(cache_dir), "--out", str(out_dir), "--n", "3", "--floor", "1"]

    monkeypatch.setattr(cli, "make_dependencies", make_fake_dependencies)
    cli.main(["fetch", *common])
    cli.main(["embed", *common])
    cli.main(["project", *common])

    def failing_get(_url: str) -> str:
        raise AssertionError("export must not call the network")

    def failing_dependencies(cache_dir: Path) -> cli.Dependencies:
        client = Client(get=failing_get, sleep=lambda _s: None, now=lambda: 0.0, cache_dir=cache_dir)
        return cli.Dependencies(
            client=client,
            embedder=HashEmbedder,
            projector=FirstTwoProjector,
            today=lambda: date(2026, 9, 23),
            model_name="hash-embedder-test",
            umap_params={"fake": True},
        )

    monkeypatch.setattr(cli, "make_dependencies", failing_dependencies)

    assert cli.main(["export", *common]) == 0
    spec = json.loads((out_dir / "arxiv.json").read_text(encoding="utf-8"))
    export.check_spec(spec)


# --- missing predecessor stage ---


def test_run_embed_without_cached_papers_names_fetch_as_the_predecessor(tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    deps = make_fake_dependencies(cache_dir)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus fetch' first"):
        cli.run_embed(deps, cache_dir)


def test_run_project_without_cached_embeddings_names_embed_as_the_predecessor(tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    deps = make_fake_dependencies(cache_dir)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus embed' first"):
        cli.run_project(deps, cache_dir)


def test_run_export_without_cached_papers_names_fetch_as_the_predecessor(tmp_path: Path) -> None:
    cache_dir = tmp_path / "cache"
    out_dir = tmp_path / "out"
    deps = make_fake_dependencies(cache_dir)

    with pytest.raises(ValueError, match=r"run 'arxiv-corpus fetch' first"):
        cli.run_export(deps, cache_dir, out_dir)


def test_run_export_without_cached_projection_names_project_as_the_predecessor(
    fake_dependencies: None, tmp_path: Path
) -> None:
    cache_dir = tmp_path / "cache"
    out_dir = tmp_path / "out"
    common = ["--cache-dir", str(cache_dir), "--out", str(out_dir), "--n", "3", "--floor", "1"]
    cli.main(["fetch", *common])  # papers cached; embeddings/coordinates deliberately not

    deps = make_fake_dependencies(cache_dir)
    with pytest.raises(ValueError, match=r"run 'arxiv-corpus project' first"):
        cli.run_export(deps, cache_dir, out_dir)


def test_main_prints_the_missing_predecessor_message_to_stderr_and_returns_nonzero(
    fake_dependencies: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cache_dir = tmp_path / "cache"
    out_dir = tmp_path / "out"

    exit_code = cli.main(["embed", "--cache-dir", str(cache_dir), "--out", str(out_dir)])

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


def test_resolve_cache_dir_defaults_to_dot_cache_when_none() -> None:
    assert cli._resolve_cache_dir(None) == Path(".cache")


def test_resolve_cache_dir_keeps_an_explicit_value(tmp_path: Path) -> None:
    assert cli._resolve_cache_dir(tmp_path) == tmp_path
