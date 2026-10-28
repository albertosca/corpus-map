🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

# arXiv corpus pipeline

`fetch → embed → project → edges → cluster → name → check → export` — flags: `--n` (papers, default 8000), `--floor` (minimum per category, default 20), `--out` (default `demo/corpora`), `--cache-dir` (default `.cache`). Run any stage alone, or `all` for the whole thing: `uv run arxiv-corpus <fetch|embed|project|edges|cluster|name|check|export|all> [flags]`.

## What it builds

This package fetches a sample of `cs.*` (computer science) papers from the live arXiv API, embeds each abstract into a 384-dimensional vector with a small local model, projects those vectors to 2D with UMAP, and writes `demo/corpora/arxiv.json` — a corpus-map `MapSpec`, checked twice: once by this package's own `export.py`, and once by the library's `validateSpec` in `demo/corpora/arxiv.test.ts`, which is the test that proves the demo can actually load it. `demo/corpora/arxiv.meta.json` records how that file was produced: the date, the query shape, the model, the UMAP parameters, and the per-category paper counts. Every paper becomes a node, positioned by how semantically similar its abstract is to every other abstract in the sample, so papers about similar topics sit together. The territories are the map's own clusters, not arXiv's categories: a Ward tree over the 2D coordinates is cut twice, into 18-26 leaves under 5-9 families, Claude names both levels from what each cluster holds, and a blind test checks the names before anything is written (see [Territories: clusters, names and the blind test](#territories-clusters-names-and-the-blind-test)). Each paper keeps its arXiv category as an attribute: the demo shows it on the card and in the drawer.

## Edges: related papers across categories

The `edges` stage (spec slice E §8) links each paper to its nearest neighbours in *other* categories: cosine similarity over the cached embeddings, computed in blocks of 512 rows so the 8000 × 8000 matrix never sits in memory at once. A pair is kept only at similarity 0.80 or above, and each paper ends with at most three edges — every paper proposes its three best, then the heaviest pairs are kept first while both ends still have room, so a paper many others resemble (a hub) cannot collect dozens. Pairs inside one category are left out on purpose: the map already shows those by position. A paper whose embedding is all zeros links to nothing.

`export` writes the edges into `arxiv.json` as compact `[sourceIndex, targetIndex, weightPercent]` triples (indexes into `nodes`, the lower first) and records `floor`, `per_paper` and `count` under `edges` in `arxiv.meta.json`; the demo expands them into `MapEdge`s when it loads the file, writing each edge's reason from the words the two titles share (`demo/corpora/edges.ts`), so the file does not carry that text twice. `edges.json` carries the embeddings' fingerprint, and `export` refuses an `edges.json` from different embeddings — re-run `edges` after `embed`. Without an `edges.json`, `export` writes a spec with no edges. The same goes for two other fields every node could carry: territories ship without `members` (each node already names its territory) and nodes without `meta` (the year and the abstract-page url both follow from the arXiv id), and the demo rebuilds both on load (`demo/corpora/compact.ts`), which keeps the file about 30% smaller. `export` refuses a paper whose publication year is not the year its id gives, so the rebuilt year is never wrong.

## Territories: clusters, names and the blind test

arXiv's categories overlap on the map (a paper's primary category says little about where its abstract lands), so 38 category territories painted 38 interleaved shapes. The territories are cut from the map instead:

- **`cluster`** builds a Ward tree over the 2D coordinates (scikit-learn) and cuts it at the leaf count in 18-26 and the family count in 5-9 with the best silhouette, so each family is a union of whole leaves. It prints the counts and the contiguity: the share of each paper's 10 nearest map neighbours that share its leaf. It writes `clusters.json`, with each cluster's 10 most central titles, its distinctive words (from title and abstract) and its category mix.
- **`name`** asks Claude (`claude-opus-5-5`) for every leaf name (at most 32 characters) and every family name (at most 20, so the name fits whole on a 320 px phone at the fitted view), with the length held by the answer schema itself.
- **`check`** is the blind test: 20 held-out titles per leaf (never a central title the namer saw, of the leaf or of its family), each shown to Claude with only the list of names, and it must pick the cluster the title came from. It passes when every leaf is picked right at least 25% of the time, all leaves together at least 60%, and every family at least 70%. A failing level is renamed with the titles it lost, then re-tested on a fresh draw that skips every title drawn before, up to four times; a renaming never reuses a name of the other level; after the last it stops with a report in `check-failed.json` and nothing is exported. A run with the 38 arXiv category names stands in as a baseline and is reported, never gated on: its lift (share × number of names) caps at the number of names, so 18-26 leaves cannot beat 38 categories.
- **`export`** writes the leaves (each with its `parent`) and the families into `arxiv.json`, the paper's category as an index into a `categories` table, and `clusters` and `naming` (model, prompt version, the whole check report) into `arxiv.meta.json`. `demo/corpora/arxiv.test.ts` checks the counts, the contiguity (≥ 0.90, recomputed from the committed nodes), the passing report and that the shipped names are the tested ones.

`name` and `check` reach Claude through `ARXIV_NAMING_BACKEND`: `subscription` (the default) runs `claude -p` headless on the logged-in Claude Code subscription, with no tools, no session saved, and the variables that route the CLI elsewhere (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`) removed from its environment, so it runs on the subscription unless the CLI's own settings say otherwise; `api` uses the Anthropic SDK with the `naming` extra and `ANTHROPIC_API_KEY`. The stage caches carry fingerprints (clusters from papers and coordinates, names from the clusters and the naming prompt version, the check from the names), so a new projection or cut is refused instead of paired with old names.

The run of 2026-10-28 cut 18 leaves in 5 families (silhouette 0.363 and 0.395, both highest at the smallest allowed count) with contiguity 0.973. Both levels passed the blind test on the first naming: the families at 0.792 overall (lowest 0.738), the leaves at 0.600 overall (lowest leaf 0.25), right on both floors. It predates two later changes to the test: titles central to a family are now held out of it too (1 of the run's 360 held-out titles was one), and a re-test draws fresh titles (the run needed no re-test). Naming and checking took 5 `claude -p` calls, about 15 s for `name` and a few minutes for `check`. Three earlier runs did not ship: one failed on the baseline clause above, one on leaves stuck at 0.25-0.35 under a 40% leaf floor (the owner set the current floors after reading both reports), and one passed with family names up to 24 characters that a 320 px phone cut, which is why the family limit is now 20.

## Source, license, and attribution

arXiv's metadata (title, abstract, category, and other bibliographic fields) is available under CC0 1.0 through its API, per the [terms of use](https://info.arxiv.org/help/api/tou.html). This pipeline uses only that metadata — never the full text of a paper, which arXiv does not release under CC0. As the terms require, every corpus built by this pipeline carries the sentence: "Thank you to arXiv for use of its open access interoperability." That sentence lives in `arxiv.meta.json`'s `attribution` field, verbatim, and belongs wherever the demo credits its data sources.

## No author names

CC0 covers author names too, but this pipeline drops them anyway: a public, zoomable map of real people's names — searchable, screenshot-able, permanently attached to a specific paper title — adds risk to those authors for no benefit to the showcase, which only needs to demonstrate that the library can render a real corpus. `fetch.py` never reads the `<author>` element off the arXiv feed in the first place, and `arxiv.test.ts` walks the entire exported JSON recursively, asserting that no key named `author` or `authors` exists at any depth — not a spot check, a proof.

## How to re-run it

```bash
cd pipeline/arxiv
uv sync --extra model --extra naming   # PyTorch, sentence-transformers, umap-learn (~1 GB on disk); the Anthropic SDK
uv run arxiv-corpus all --n 8000 --floor 20   # name and check call Claude through `claude -p` by default
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
