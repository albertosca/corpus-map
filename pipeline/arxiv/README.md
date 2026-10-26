🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

# arXiv corpus pipeline

`fetch → embed → project → edges → export` — flags: `--n` (papers, default 8000), `--floor` (minimum per category, default 20), `--out` (default `demo/corpora`), `--cache-dir` (default `.cache`). Run any stage alone, or `all` for the whole thing: `uv run arxiv-corpus <fetch|embed|project|edges|export|all> [flags]`.

## What it builds

This package fetches a sample of `cs.*` (computer science) papers from the live arXiv API, embeds each abstract into a 384-dimensional vector with a small local model, projects those vectors to 2D with UMAP, and writes `demo/corpora/arxiv.json` — a corpus-map `MapSpec`, checked twice: once by this package's own `export.py`, and once by the library's `validateSpec` in `demo/corpora/arxiv.test.ts`, which is the test that proves the demo can actually load it. `demo/corpora/arxiv.meta.json` records how that file was produced: the date, the query shape, the model, the UMAP parameters, and the per-category paper counts. Every arXiv category becomes a territory on the map; every paper becomes a node, positioned by how semantically similar its abstract is to every other abstract in the sample — papers about similar topics cluster together, and the named territories are the `cs.*` categories arXiv itself assigns.

## Edges: related papers across categories

The `edges` stage (spec slice E §8) links each paper to its nearest neighbours in *other* categories: cosine similarity over the cached embeddings, computed in blocks of 512 rows so the 8000 × 8000 matrix never sits in memory at once. A pair is kept only at similarity 0.80 or above, and each paper ends with at most three edges — every paper proposes its three best, then the heaviest pairs are kept first while both ends still have room, so a paper many others resemble (a hub) cannot collect dozens. Pairs inside one category are left out on purpose: the map already shows those by position. A paper whose embedding is all zeros links to nothing.

`export` writes the edges into `arxiv.json` as compact `[sourceIndex, targetIndex, weightPercent]` triples (indexes into `nodes`, the lower first) and records `floor`, `per_paper` and `count` under `edges` in `arxiv.meta.json`; the demo expands them into `MapEdge`s when it loads the file, writing each edge's reason from the words the two titles share (`demo/corpora/edges.ts`), so the file does not carry that text twice. `edges.json` carries the embeddings' fingerprint, and `export` refuses an `edges.json` from different embeddings — re-run `edges` after `embed`. Without an `edges.json`, `export` writes a spec with no edges. The same goes for two other fields every node could carry: territories ship without `members` (each node already names its territory) and nodes without `meta` (the year and the abstract-page url both follow from the arXiv id), and the demo rebuilds both on load (`demo/corpora/compact.ts`), which keeps the file about 30% smaller. `export` refuses a paper whose publication year is not the year its id gives, so the rebuilt year is never wrong.

## Source, license, and attribution

arXiv's metadata (title, abstract, category, and other bibliographic fields) is available under CC0 1.0 through its API, per the [terms of use](https://info.arxiv.org/help/api/tou.html). This pipeline uses only that metadata — never the full text of a paper, which arXiv does not release under CC0. As the terms require, every corpus built by this pipeline carries the sentence: "Thank you to arXiv for use of its open access interoperability." That sentence lives in `arxiv.meta.json`'s `attribution` field, verbatim, and belongs wherever the demo credits its data sources.

## No author names

CC0 covers author names too, but this pipeline drops them anyway: a public, zoomable map of real people's names — searchable, screenshot-able, permanently attached to a specific paper title — adds risk to those authors for no benefit to the showcase, which only needs to demonstrate that the library can render a real corpus. `fetch.py` never reads the `<author>` element off the arXiv feed in the first place, and `arxiv.test.ts` walks the entire exported JSON recursively, asserting that no key named `author` or `authors` exists at any depth — not a spot check, a proof.

## How to re-run it

```bash
cd pipeline/arxiv
uv sync --extra model      # pulls PyTorch, sentence-transformers, umap-learn (~1 GB on disk)
uv run arxiv-corpus all --n 8000 --floor 20
```

Each stage caches its output under `.cache/` (git-ignored), so a failed or interrupted run costs nothing to retry — `uv run arxiv-corpus fetch` again picks up wherever the response cache left off, and `embed`/`project`/`export` each read the previous stage's cache rather than repeating it. The base install (no `--extra model`) never downloads PyTorch; that extra is optional and only needed to run `embed` for real — the test suite and CI never need it, since `embed.py` and `project.py` sit behind small interfaces the tests fill with deterministic fakes.

## What it cost, measured on 2026-09-23

| Step | Measurement |
| --- | --- |
| `uv sync --extra model` | 41 packages installed, 11 downloaded (~144 MB, mostly PyTorch); 3.8 s with a warm package cache |
| `.venv` size | 129 MB base install, 1.0 GB with the `model` extra |
| 50-abstract smoke test | model load 39.0 s (includes the one-time weight download from Hugging Face), embed 0.16 s, peak RSS ~480 MB |
| `fetch --n 8000 --floor 20` | 7 m 03 s, 116 throttled HTTP requests (one every 3+ seconds) against `export.arxiv.org` |
| `embed` (8,000 abstracts) | 8 m 18 s, peak RSS ~1.28 GB |
| `project` (UMAP) | 32.3 s, peak RSS ~391 MB |
| `export` | 0.3 s |
| **Total wall time, fetch through export** | **~15 m 54 s** |
| Output | `arxiv.json` 1.38 MB (8,000 nodes, 38 territories); `arxiv.meta.json` 1.2 KB |

38 of the 40 `cs.*` categories in `categories.py` ended up as territories — `cs.NA` and `cs.SY` genuinely returned zero papers for the whole count query on this run, cross-listed papers included, not just their own primary category (both are commonly cross-listed rather than primary elsewhere: `math.NA` and `eess.SY`), which is expected, not a bug — `sample.py` gives a `total == 0` category a quota of `0` rather than forcing the floor onto an empty category.

The committed corpus was also built with an earlier version of `sample.py`'s quota-shrink rule, which took every excess item off whichever category was currently largest rather than spreading it proportionally: all 43 papers above the `--n 8000` target came off `cs.LG` alone (1,592 → 1,549). `sample.py` now shrinks proportionally, but the corpus is not being rebuilt for this alone; a future refresh (see below) will use the corrected rule.

## Two things this run found that the design spec did not anticipate

Both were verified live (reproduced with plain `curl` and with a second HTTP client, not theorized) before being fixed, and both are documented at the point they were fixed in the source:

- **The arXiv API's count query (`max_results=0`) reliably 500s.** `Client.total()` now asks for `max_results=1` instead — the same `opensearch:totalResults` field, plus one unused entry, at no extra cost against the 3-second throttle.
- **`urllib.request` gets blocked by arXiv's edge with a reproducible HTTP 406, while `curl` and `httpx` succeed against the identical URL and headers at the same moment** — a client-fingerprint block, not anything this package sends. `fetch.py`'s network call now goes through `httpx`, promoted from a transitive dependency of the `model` extra (`sentence-transformers` pulls it in) to a small, direct, base dependency.

## Re-running for a refresh

Re-running `all` with the same `--n`/`--floor` **replays the on-disk response cache and reproduces the exact same corpus** — every count and page request this pipeline makes is cached forever under `.cache/responses/` (keyed by the full request URL), so a re-run with no cache change asks arXiv nothing and writes byte-identical output. That is what makes an interrupted or failed run free to retry (see above); it also means re-running `all` is *not* how you pick up whatever arXiv has published since the last fetch.

To actually refresh the corpus with newer papers, delete the response cache first, then re-run:

```bash
cd pipeline/arxiv
rm -rf .cache/responses
uv run arxiv-corpus all --n 8000 --floor 20
```

`fetch` asks for the *newest* papers in each category, so once the response cache is gone, the next run picks up whatever was submitted to arXiv since. `embed`, `project`, `edges` and `export` all key off a fingerprint of the papers `fetch` actually wrote, so a refresh cannot silently pair new papers with old coordinates (or vice versa) even when the refreshed corpus happens to have the exact same number of papers per category. UMAP's layout is also not guaranteed bit-reproducible across machines even with a fixed `random_state` — `arxiv.meta.json` records the parameters used, not a promise that another machine's UMAP build reproduces the same coordinates. The committed `arxiv.json` is the artifact; nothing in the demo or the test suite depends on its exact coordinates.
