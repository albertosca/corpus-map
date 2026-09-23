from __future__ import annotations

import logging
from pathlib import Path

import pytest

from arxiv_corpus.fetch import (
    Client,
    Paper,
    build_query_url,
    cache_path,
    parse_page,
)

FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def entry(
    id_: str,
    primary: str,
    categories: list[str] | None = None,
    published: str = "2026-01-01T00:00:00Z",
) -> str:
    category_tags = "".join(
        f'<category term="{term}" scheme="http://arxiv.org/schemas/atom"/>' for term in (categories or [primary])
    )
    return f"""
  <entry>
    <id>http://arxiv.org/abs/{id_}</id>
    <title>Invented title for {id_}</title>
    <updated>{published}</updated>
    <summary>Invented abstract text for {id_}.</summary>
    {category_tags}
    <published>{published}</published>
    <arxiv:primary_category term="{primary}"/>
    <author><name>A. Example</name></author>
  </entry>"""


def make_atom(total: int, entries: list[str]) -> str:
    joined = "".join(entries)
    return f"""<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <id>https://arxiv.org/api/synthetic</id>
  <title>synthetic</title>
  <updated>2026-01-01T00:00:00Z</updated>
  <opensearch:totalResults>{total}</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>{joined}
</feed>"""


def filler(count: int, prefix: str, primary: str = "cs.OTHER") -> list[str]:
    return [entry(f"{prefix}-{i}v1", primary) for i in range(count)]


class FakeClock:
    """A controllable clock: `now()` reads it, `sleep()` advances it and records the call."""

    def __init__(self, start: float = 0.0) -> None:
        self.time = start
        self.sleep_calls: list[float] = []

    def now(self) -> float:
        return self.time

    def sleep(self, seconds: float) -> None:
        self.sleep_calls.append(seconds)
        self.time += seconds


class GetSpy:
    """A fake `Get` that serves canned bodies in order and records each call's URL and time."""

    def __init__(self, bodies: list[str], clock: FakeClock) -> None:
        self._bodies = iter(bodies)
        self._clock = clock
        self.calls: list[tuple[str, float]] = []

    def __call__(self, url: str) -> str:
        self.calls.append((url, self._clock.now()))
        return next(self._bodies)


class RepeatingGetSpy:
    """A fake `Get` that always serves the same body, recording every call's URL."""

    def __init__(self, body: str) -> None:
        self._body = body
        self.calls: list[str] = []

    def __call__(self, url: str) -> str:
        self.calls.append(url)
        return self._body


def failing_get(url: str) -> str:
    raise AssertionError(f"get() must not be called for a cached URL, got {url}")


def failing_sleep(seconds: float) -> None:
    raise AssertionError(f"sleep() must not be called for a cached URL, got {seconds}")


def test_parse_page_parses_total_ids_years_and_primary_categories() -> None:
    total, results = parse_page(read_fixture("page.atom"))

    assert total == 3
    assert [paper.id for paper, _primary in results] == [
        "2601.00001",
        "2601.00002",
        "2601.00003",
    ]
    assert [paper.year for paper, _primary in results] == [2026, 2026, 2026]
    assert [primary for _paper, primary in results] == ["cs.CL", "cs.LG", "cs.CL"]
    assert [paper.category for paper, _primary in results] == ["cs.CL", "cs.LG", "cs.CL"]


def test_parse_page_preserves_multiline_title_raw() -> None:
    _total, results = parse_page(read_fixture("page.atom"))

    title = results[0][0].title
    assert "Sparse Attention Routing for Long-Context" in title
    assert "Retrieval Augmented Generation" in title
    assert "\n" in title


def test_parse_page_count_atom_has_total_and_no_entries() -> None:
    total, results = parse_page(read_fixture("count.atom"))

    assert total == 119789
    assert results == []


def test_client_total_requests_max_results_zero() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("count.atom")], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.total("cs.CL")

    assert result == 119789
    assert len(get.calls) == 1
    assert "max_results=0" in get.calls[0][0]
    assert "cat%3Acs.CL" in get.calls[0][0] or "cat:cs.CL" in get.calls[0][0]


def test_client_enforces_minimum_gap_between_requests() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("count.atom")] * 3, clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0)

    for _ in range(3):
        client.total("cs.CL")

    timestamps = [call_time for _url, call_time in get.calls]
    assert timestamps == [0.0, 3.0, 6.0]
    assert clock.sleep_calls == [3.0, 3.0]


def test_client_skips_sleep_when_gap_already_elapsed() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("count.atom")] * 2, clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0)

    client.total("cs.CL")
    clock.time += 10.0
    client.total("cs.CL")

    assert clock.sleep_calls == []
    assert [call_time for _url, call_time in get.calls] == [0.0, 10.0]


def test_papers_filters_out_cross_listed_entries() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("page.atom")], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=2)

    assert [paper.id for paper in result] == ["2601.00001", "2601.00003"]
    assert len(get.calls) == 1


def test_papers_stops_paging_on_short_page() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("page.atom")], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=100)

    assert [paper.id for paper in result] == ["2601.00001", "2601.00003"]
    assert len(get.calls) == 1


def test_papers_stops_once_want_is_reached_without_extra_page() -> None:
    full_page = make_atom(
        total=50,
        entries=[entry("first-matchv1", "cs.CL"), *filler(49, "filler")],
    )
    clock = FakeClock()
    get = GetSpy([full_page], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=1)

    assert [paper.id for paper in result] == ["first-match"]
    assert len(get.calls) == 1


def test_papers_dedupes_entries_seen_on_an_earlier_page() -> None:
    page_one = make_atom(
        total=50,
        entries=[entry("dedupe-av1", "cs.CL"), *filler(49, "filler")],
    )
    page_two = make_atom(
        total=2,
        entries=[entry("dedupe-av1", "cs.CL"), entry("dedupe-bv1", "cs.CL")],
    )
    clock = FakeClock()
    get = GetSpy([page_one, page_two], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=2)

    assert [paper.id for paper in result] == ["dedupe-a", "dedupe-b"]
    assert len(get.calls) == 2


def test_papers_returns_empty_for_category_with_only_cross_listed_papers() -> None:
    only_cross_listed = make_atom(
        total=3,
        entries=[entry(f"cross-{i}-v1", "cs.LG") for i in range(3)],
    )
    clock = FakeClock()
    get = GetSpy([only_cross_listed], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=5)

    assert result == []
    assert len(get.calls) == 1


def test_papers_stops_and_logs_after_twenty_pages(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="arxiv_corpus.fetch")

    filler_page = make_atom(total=999999, entries=filler(50, "cap"))
    clock = FakeClock()
    get = RepeatingGetSpy(filler_page)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=10)

    assert result == []
    assert len(get.calls) == 20
    assert any("20" in record.message and "cs.CL" in record.message for record in caplog.records)


def test_cache_round_trip_avoids_second_request(tmp_path: Path) -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("count.atom")], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now, cache_dir=tmp_path)

    first = client.total("cs.CL")
    second = client.total("cs.CL")

    assert first == second == 119789
    assert len(get.calls) == 1
    assert clock.sleep_calls == []

    url = build_query_url("cs.CL", start=0, max_results=0)
    assert cache_path(tmp_path, url).exists()


def test_cache_hit_returns_stored_body_without_get_or_sleep(tmp_path: Path) -> None:
    url = build_query_url("cs.CL", start=0, max_results=0)
    stored = cache_path(tmp_path, url)
    stored.parent.mkdir(parents=True, exist_ok=True)
    stored.write_text(read_fixture("count.atom"), encoding="utf-8")

    client = Client(get=failing_get, sleep=failing_sleep, now=lambda: 0.0, cache_dir=tmp_path)

    result = client.total("cs.CL")

    assert result == 119789


def test_paper_is_a_frozen_dataclass() -> None:
    paper = Paper(id="1", title="t", abstract="a", category="cs.CL", year=2026)
    assert paper.id == "1"
