"""Polite arXiv API access: counts, newest-first pages, primary-category filter, cache.

Verified against https://export.arxiv.org/api/query and the live cs.CL feed on 2026-09-23:
ids arrive as `http://arxiv.org/abs/<id>v<n>` (the version suffix is stripped here), the
primary category is the `term` attribute of `<arxiv:primary_category/>`, and the total is
`<opensearch:totalResults>`. The API allows at most 2,000 results per request and asks for
one request every 3 seconds.

Verified live on 2026-09-23, running Task 6: `urllib.request.urlopen` gets a reproducible
HTTP 406 from `export.arxiv.org`, while `curl` and `httpx` succeed against the identical URL
and headers at the same moment (checked back-to-back, repeatedly) -- the arXiv edge blocks on
the client's TLS/HTTP fingerprint, not on anything this module sends. `httpx` is already a
transitive dependency of `sentence-transformers` (the `model` extra); this module promotes it
to a direct, base dependency so the fetch stage works without the extra installed.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

ATOM_NS = "http://www.w3.org/2005/Atom"
OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/"
ARXIV_NS = "http://arxiv.org/schemas/atom"
NAMESPACES = {"atom": ATOM_NS, "opensearch": OPENSEARCH_NS, "arxiv": ARXIV_NS}

BASE_URL = "https://export.arxiv.org/api/query"
MAX_PAGE_SIZE = 2000
MIN_PAGE_SIZE = 50
MAX_PAGES = 20
USER_AGENT = "corpus-map-arxiv-pipeline/0.1 (https://github.com/albertosca/corpus-map; offline research corpus build)"

_VERSION_SUFFIX = re.compile(r"v\d+$")

Get = Callable[[str], str]
Sleep = Callable[[float], None]


@dataclass(frozen=True)
class Paper:
    """A single arXiv paper, as parsed off its Atom entry."""

    id: str
    title: str
    abstract: str
    category: str
    year: int


def http_get(url: str) -> str:  # pragma: no cover -- real network, never called in tests
    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    return response.text


def build_query_url(category: str, start: int, max_results: int) -> str:
    """Build a newest-first arXiv API query URL for one category page."""
    params = {
        "search_query": f"cat:{category}",
        "start": str(start),
        "max_results": str(max_results),
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }
    return f"{BASE_URL}?{urlencode(params, safe=':')}"


def cache_path(cache_dir: Path, url: str) -> Path:
    """The on-disk path a URL's cached body is stored at, under `cache_dir`."""
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return cache_dir / f"{digest}.atom"


def _strip_version(raw_id: str) -> str:
    tail = raw_id.rsplit("/abs/", 1)[-1]
    return _VERSION_SUFFIX.sub("", tail)


def _required_text(parent: ET.Element, tag: str, context: str) -> str:
    """The text of `parent`'s child `tag`, or a `ValueError` naming `context` and `tag`.

    `context` identifies where in the feed this lookup happened (e.g. "arXiv feed" or
    "arXiv entry 2609.26796"), so the raised message pins down both the missing element and
    which response body it came from once the `Client` adds the request URL on top.

    Text that is empty once stripped of whitespace (e.g. `<summary>   </summary>`) is
    treated the same as a missing element -- it would otherwise produce a paper with an
    empty abstract, or a node with an empty map label.
    """
    element = parent.find(tag, NAMESPACES)
    text = element.text if element is not None else None
    if text is None or not text.strip():
        raise ValueError(f"{context}: missing <{tag}>")
    return text


def _required_attr(parent: ET.Element, tag: str, attr: str, context: str) -> str:
    """The `attr` attribute of `parent`'s child `tag`, or a `ValueError` naming `context`."""
    element = parent.find(tag, NAMESPACES)
    value = element.get(attr) if element is not None else None
    if not value:
        raise ValueError(f"{context}: missing <{tag}>")
    return value


def _parse_entry(entry: ET.Element) -> tuple[Paper, str]:
    """Parse one `<entry>`, or raise `ValueError` for a malformed entry or arXiv's error feed."""
    raw_id = _required_text(entry, "atom:id", "arXiv entry")
    entry_id = _strip_version(raw_id)
    context = f"arXiv entry {entry_id}"

    title = _required_text(entry, "atom:title", context).strip()
    if title == "Error" and "api/errors" in raw_id:
        summary = _required_text(entry, "atom:summary", context).strip()
        raise ValueError(f"arXiv API error: {summary}")

    abstract = _required_text(entry, "atom:summary", context).strip()
    published = _required_text(entry, "atom:published", context)
    primary_category = _required_attr(entry, "arxiv:primary_category", "term", context)

    paper = Paper(
        id=entry_id,
        title=title,
        abstract=abstract,
        category=primary_category,
        year=int(published[:4]),
    )
    return paper, primary_category


def parse_page(body: str) -> tuple[int, list[tuple[Paper, str]]]:
    """Parse one Atom response page.

    Returns the `opensearch:totalResults` count and, for each entry, the parsed `Paper`
    alongside the primary category term seen on that entry (the two match: `Paper.category`
    is set to the same primary category, so callers filtering on the tuple's second element
    need not re-derive it from the paper).

    The arXiv API is an external boundary: a malformed or error-shaped response (a missing
    element, arXiv's own error feed, or a body that is not XML at all) raises `ValueError`
    naming what is wrong and, where available, which entry it came from, instead of an opaque
    `AttributeError` far from the cause.
    """
    try:
        root = ET.fromstring(body)
    except ET.ParseError as err:
        raise ValueError(f"arXiv response is not valid XML: {err}") from err

    total = int(_required_text(root, "opensearch:totalResults", "arXiv feed"))

    results = [_parse_entry(entry) for entry in root.findall("atom:entry", NAMESPACES)]
    return total, results


class Client:
    """Polite arXiv API client: throttled requests, an on-disk response cache."""

    def __init__(
        self,
        get: Get,
        sleep: Sleep,
        now: Callable[[], float],
        gap: float = 3.0,
        cache_dir: Path | None = None,
    ) -> None:
        self._get = get
        self._sleep = sleep
        self._now = now
        self._gap = gap
        self._cache_dir = cache_dir
        self._last_request_at: float | None = None

    def total(self, category: str) -> int:
        """The `opensearch:totalResults` for `category`, via a `max_results=1` request.

        Verified live on 2026-09-23: `max_results=0` reliably returns arXiv's own HTTP 500
        error feed (reproduced with plain `curl`, no client-side header involved), while
        `max_results=1` returns the same `opensearch:totalResults` with one (unused) entry.
        """
        url = build_query_url(category, start=0, max_results=1)
        total, _entries = self._parse(url)
        return total

    def papers(self, category: str, want: int) -> list[Paper]:
        """Up to `want` papers whose primary category is `category`, newest first."""
        if want <= 0:
            return []

        collected: list[Paper] = []
        seen: set[str] = set()
        start = 0

        for _page in range(MAX_PAGES):
            max_results = min(MAX_PAGE_SIZE, max(MIN_PAGE_SIZE, math.ceil((want - len(collected)) * 1.6)))
            url = build_query_url(category, start=start, max_results=max_results)
            _total, entries = self._parse(url)

            for paper, primary_category in entries:
                if primary_category != category or paper.id in seen:
                    continue
                seen.add(paper.id)
                collected.append(paper)
                if len(collected) >= want:
                    return collected

            start += max_results
            if len(entries) < max_results:
                return collected

        logger.warning(
            "stopped after %d pages for %s: got %d/%d papers",
            MAX_PAGES,
            category,
            len(collected),
            want,
        )
        return collected

    def _parse(self, url: str) -> tuple[int, list[tuple[Paper, str]]]:
        """Fetch and parse `url`, naming it in the error if the response is malformed."""
        body = self._fetch(url)
        try:
            return parse_page(body)
        except ValueError as err:
            raise ValueError(f"{url}: {err}") from err

    def _fetch(self, url: str) -> str:
        cached = self._read_cache(url)
        if cached is not None:
            return cached

        self._throttle()
        body = self._get(url)
        self._last_request_at = self._now()
        self._write_cache(url, body)
        return body

    def _throttle(self) -> None:
        if self._last_request_at is None:
            return
        remaining = self._gap - (self._now() - self._last_request_at)
        if remaining > 0:
            self._sleep(remaining)

    def _read_cache(self, url: str) -> str | None:
        if self._cache_dir is None:
            return None
        path = cache_path(self._cache_dir, url)
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def _write_cache(self, url: str, body: str) -> None:
        if self._cache_dir is None:
            return
        path = cache_path(self._cache_dir, url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
