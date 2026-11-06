---
"corpus-map": minor
---

Search results are ranked and reachable (spec 2026-11-06). `SearchBox` (in `corpus-map/search`, now about 4.1 kB gzipped) gains `rank` (`"connections"` by default: the most edges first; `"alphabetical"`; or a score function; ties always alphabetical), hands `onMatches` the ids best first, lists them under the input as an accessible combobox (the first 50, then "and N more"), and calls the new `onGo(id)` on Enter or a click on a result, never while typing. A consumer's `search` may return `{ id, score }` entries to have them sorted by score; plain ids keep the order they came in. New types `RankRule`, `RankItem`, `RankContext` and `ScoredId`. The input now has the `combobox` role instead of `textbox`.
