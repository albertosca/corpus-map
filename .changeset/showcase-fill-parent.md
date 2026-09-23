---
"corpus-map": minor
---

`width` and `height` are now optional. Without them, `CorpusMap` measures its parent with a `ResizeObserver` (via the new `useElementSize` hook) and renders nothing until the first measurement; with both given, behaviour is unchanged. A later size change (from that measurement, not from explicit props) keeps the current scale and keeps the world point that was at the old box's centre at the new box's centre, instead of refitting and discarding the user's zoom; a new `spec` still refits, as before.
