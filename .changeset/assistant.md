---
"corpus-map": minor
---

Dialogue with an AI (spec 2026-11-03). New separate entry `corpus-map/assistant` with `AssistantBox` (about 2 kB gzipped): the consumer provides the AI as an async `ask` adapter, a complete answer highlights its cited items and frames them once only if the reader has not moved the view, with "Back to previous view". `CorpusMapHandle` gains `setView(view)` and `getView()`.
