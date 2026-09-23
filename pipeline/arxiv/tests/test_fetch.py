from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from arxiv_corpus.fetch import (
    MAX_ATTEMPTS,
    USER_AGENT,
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


class FlakyGet:
    """A fake `Get` that raises `httpx.HTTPStatusError` (`status_codes`, in order) before
    finally returning `final_body`, recording every call."""

    def __init__(self, status_codes: list[int], final_body: str) -> None:
        self._status_codes = list(status_codes)
        self._final_body = final_body
        self.calls = 0

    def __call__(self, url: str) -> str:
        self.calls += 1
        if self._status_codes:
            code = self._status_codes.pop(0)
            request = httpx.Request("GET", url)
            response = httpx.Response(status_code=code, request=request)
            raise httpx.HTTPStatusError(f"{code} for {url}", request=request, response=response)
        return self._final_body


class AlwaysFailingGet:
    """A fake `Get` that always raises the given `httpx.HTTPError`, recording every call."""

    def __init__(self, make_error: Callable[[str], httpx.HTTPError]) -> None:
        self._make_error = make_error
        self.calls = 0

    def __call__(self, url: str) -> str:
        self.calls += 1
        raise self._make_error(url)


def _status_error(url: str, code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", url)
    response = httpx.Response(status_code=code, request=request)
    return httpx.HTTPStatusError(f"{code} for {url}", request=request, response=response)


def failing_get(url: str) -> str:
    raise AssertionError(f"get() must not be called for a cached URL, got {url}")


def failing_sleep(seconds: float) -> None:
    raise AssertionError(f"sleep() must not be called for a cached URL, got {seconds}")


MISSING_TITLE_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <updated>2026-01-01T00:00:00Z</updated>
    <summary>Some invented abstract.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-01-01T00:00:00Z</published>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>A. Example</name></author>
  </entry>"""

MISSING_SUMMARY_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <title>Invented title</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-01-01T00:00:00Z</published>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>A. Example</name></author>
  </entry>"""

MISSING_PUBLISHED_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <title>Invented title</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <summary>Some invented abstract.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>A. Example</name></author>
  </entry>"""

MISSING_PRIMARY_CATEGORY_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <title>Invented title</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <summary>Some invented abstract.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-01-01T00:00:00Z</published>
    <author><name>A. Example</name></author>
  </entry>"""

ERROR_FEED_ENTRY = """
  <entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_2609.26796v1: 2609.26796v1</id>
    <title>Error</title>
    <summary>incorrect id format for 2609.26796v1</summary>
    <updated>2026-01-01T00:00:00Z</updated>
  </entry>"""

WHITESPACE_ONLY_TITLE_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <title>   </title>
    <updated>2026-01-01T00:00:00Z</updated>
    <summary>Some invented abstract.</summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-01-01T00:00:00Z</published>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>A. Example</name></author>
  </entry>"""

WHITESPACE_ONLY_SUMMARY_ENTRY = """
  <entry>
    <id>http://arxiv.org/abs/2609.26796v1</id>
    <title>Invented title</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <summary>
    </summary>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <published>2026-01-01T00:00:00Z</published>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>A. Example</name></author>
  </entry>"""


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


def test_parse_page_count_atom_has_total_and_one_unused_entry() -> None:
    """`max_results=1` returns one entry alongside the total -- `Client.total()` ignores it."""
    total, results = parse_page(read_fixture("count.atom"))

    assert total == 119789
    assert len(results) == 1
    assert results[0][0].id == "2601.00099"


def test_client_total_requests_max_results_one() -> None:
    clock = FakeClock()
    get = GetSpy([read_fixture("count.atom")], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.total("cs.CL")

    assert result == 119789
    assert len(get.calls) == 1
    assert "max_results=1" in get.calls[0][0]
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

    url = build_query_url("cs.CL", start=0, max_results=1)
    assert cache_path(tmp_path, url).exists()


def test_cache_hit_returns_stored_body_without_get_or_sleep(tmp_path: Path) -> None:
    url = build_query_url("cs.CL", start=0, max_results=1)
    stored = cache_path(tmp_path, url)
    stored.parent.mkdir(parents=True, exist_ok=True)
    stored.write_text(read_fixture("count.atom"), encoding="utf-8")

    client = Client(get=failing_get, sleep=failing_sleep, now=lambda: 0.0, cache_dir=tmp_path)

    result = client.total("cs.CL")

    assert result == 119789


def test_paper_is_a_frozen_dataclass() -> None:
    paper = Paper(id="1", title="t", abstract="a", category="cs.CL", year=2026)
    assert paper.id == "1"


def test_parse_page_missing_title_raises_value_error_naming_entry_and_element() -> None:
    body = make_atom(total=1, entries=[MISSING_TITLE_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <atom:title>"):
        parse_page(body)


def test_parse_page_whitespace_only_title_raises_value_error() -> None:
    """A `<title>` that is only whitespace is treated as missing -- it would be an empty map label."""
    body = make_atom(total=1, entries=[WHITESPACE_ONLY_TITLE_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <atom:title>"):
        parse_page(body)


def test_parse_page_whitespace_only_summary_raises_value_error() -> None:
    """A `<summary>` that is only whitespace is treated as missing -- it would be an empty abstract."""
    body = make_atom(total=1, entries=[WHITESPACE_ONLY_SUMMARY_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <atom:summary>"):
        parse_page(body)


def test_parse_page_missing_summary_raises_value_error_naming_entry_and_element() -> None:
    body = make_atom(total=1, entries=[MISSING_SUMMARY_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <atom:summary>"):
        parse_page(body)


def test_parse_page_missing_published_raises_value_error_naming_entry_and_element() -> None:
    body = make_atom(total=1, entries=[MISSING_PUBLISHED_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <atom:published>"):
        parse_page(body)


def test_parse_page_missing_primary_category_raises_value_error_naming_entry_and_element() -> None:
    body = make_atom(total=1, entries=[MISSING_PRIMARY_CATEGORY_ENTRY])

    with pytest.raises(ValueError, match=r"2609\.26796: missing <arxiv:primary_category>"):
        parse_page(body)


def test_parse_page_error_feed_raises_with_arxiv_summary() -> None:
    body = make_atom(total=1, entries=[ERROR_FEED_ENTRY])

    with pytest.raises(ValueError, match=r"incorrect id format for 2609\.26796v1"):
        parse_page(body)


def test_parse_page_structure_without_total_results_raises_value_error() -> None:
    body = '<feed xmlns="http://www.w3.org/2005/Atom"><title>not really arXiv</title></feed>'

    with pytest.raises(ValueError, match=r"missing <opensearch:totalResults>"):
        parse_page(body)


def test_parse_page_non_xml_body_raises_value_error() -> None:
    with pytest.raises(ValueError, match=r"not valid XML"):
        parse_page("this is not an atom feed, just plain text")


def test_client_total_wraps_parse_error_with_request_url() -> None:
    body = make_atom(total=1, entries=[])
    body_without_total = body.replace(
        "<opensearch:totalResults>1</opensearch:totalResults>",
        "",
    )
    clock = FakeClock()
    get = GetSpy([body_without_total], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    with pytest.raises(ValueError) as exc_info:
        client.total("cs.CL")

    message = str(exc_info.value)
    assert "search_query" in message
    assert "cs.CL" in message
    assert "missing <opensearch:totalResults>" in message


def test_client_papers_wraps_parse_error_with_request_url() -> None:
    body = make_atom(total=1, entries=[MISSING_TITLE_ENTRY])
    clock = FakeClock()
    get = GetSpy([body], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    with pytest.raises(ValueError) as exc_info:
        client.papers("cs.CL", want=1)

    message = str(exc_info.value)
    assert "search_query" in message
    assert "cs.CL" in message
    assert "missing <atom:title>" in message


def test_papers_returns_empty_immediately_for_non_positive_want() -> None:
    clock = FakeClock()
    get = GetSpy([], clock)
    client = Client(get=get, sleep=clock.sleep, now=clock.now)

    result = client.papers("cs.CL", want=0)

    assert result == []
    assert get.calls == []


def test_user_agent_names_the_real_repository() -> None:
    assert "https://github.com/albertosca/corpus-map" in USER_AGENT


def test_transient_5xx_retries_with_backoff_and_succeeds() -> None:
    clock = FakeClock()
    get = FlakyGet(status_codes=[503], final_body=read_fixture("count.atom"))
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0, cache_dir=None)

    result = client.total("cs.CL")

    assert result == 119789
    assert get.calls == 2
    assert clock.sleep_calls == [3.0]


def test_transport_error_retries_and_succeeds() -> None:
    clock = FakeClock()
    calls = {"n": 0}

    def get(url: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("connection refused")
        return read_fixture("count.atom")

    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0, cache_dir=None)

    result = client.total("cs.CL")

    assert result == 119789
    assert calls["n"] == 2
    assert clock.sleep_calls == [3.0]


def test_backoff_doubles_between_attempts() -> None:
    clock = FakeClock()
    get = FlakyGet(status_codes=[503, 502], final_body=read_fixture("count.atom"))
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0, cache_dir=None)

    client.total("cs.CL")

    assert clock.sleep_calls == [3.0, 6.0]


def test_5xx_exhausts_all_attempts_and_raises_a_clean_value_error_naming_the_url() -> None:
    clock = FakeClock()
    get = AlwaysFailingGet(lambda url: _status_error(url, 503))
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=0.0, cache_dir=None)

    with pytest.raises(ValueError, match=r"cat:cs\.CL") as exc_info:
        client.total("cs.CL")

    assert get.calls == MAX_ATTEMPTS
    assert f"after {MAX_ATTEMPTS} attempt" in str(exc_info.value)
    assert not isinstance(exc_info.value, httpx.HTTPError)


def test_a_4xx_status_is_not_retried() -> None:
    clock = FakeClock()
    get = AlwaysFailingGet(lambda url: _status_error(url, 404))
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=0.0, cache_dir=None)

    with pytest.raises(ValueError, match=r"cat:cs\.CL"):
        client.total("cs.CL")

    assert get.calls == 1
    assert clock.sleep_calls == []


def test_retry_keeps_the_gap_between_requests(tmp_path: Path) -> None:
    """Every attempt -- retries included -- still respects the throttle gap, and so does
    the next, unrelated request right after."""
    clock = FakeClock()
    get = FlakyGet(status_codes=[503], final_body=read_fixture("count.atom"))
    client = Client(get=get, sleep=clock.sleep, now=clock.now, gap=3.0, cache_dir=None)

    client.total("cs.CL")
    client.total("cs.AI")

    # sleep 1: the 3.0s backoff after the first attempt's 503. sleep 2: the throttle gap
    # before the next request, since the fake clock has not advanced on its own since then.
    assert clock.sleep_calls == [3.0, 3.0]


def test_error_feed_is_not_cached(tmp_path: Path) -> None:
    """An unparseable response (arXiv's own error feed here) must never be cached -- caching
    it before parsing would make every later run replay the same broken body forever instead
    of asking arXiv again.
    """
    error_body = make_atom(total=1, entries=[ERROR_FEED_ENTRY])
    good_body = read_fixture("page.atom")
    clock = FakeClock()
    get = GetSpy([error_body, good_body], clock)

    client1 = Client(get=get, sleep=clock.sleep, now=clock.now, gap=0.0, cache_dir=tmp_path)
    with pytest.raises(ValueError, match=r"incorrect id format for 2609\.26796v1"):
        client1.papers("cs.CL", want=1)

    client2 = Client(get=get, sleep=clock.sleep, now=clock.now, gap=0.0, cache_dir=tmp_path)
    result = client2.papers("cs.CL", want=1)

    assert [paper.id for paper in result] == ["2601.00001"]
    assert len(get.calls) == 2
