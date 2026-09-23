---
"corpus-map": minor
---

`width` and `height` are now optional. Without them, `CorpusMap` measures its parent with a `ResizeObserver` (via the new `useElementSize` hook) and renders nothing until the first measurement; with both given, the map still fits to them immediately, with no observer. Either way, a later box change — from a new measurement, or from a later `width`/`height` prop change — keeps the current scale and keeps the world point that was at the old box's centre at the new box's centre, instead of refitting and discarding the user's zoom; a new `spec` still refits, as before. If you want to refit after a box change, pass a `ref` (typed `CorpusMapHandle`) and call its `fit()` — the same `ref` also exposes `zoomIn()`/`zoomOut()`, and a new `onViewChange` prop reports the regime, the scale ratio to the fitted scale, and the on-screen node count after every committed change.
