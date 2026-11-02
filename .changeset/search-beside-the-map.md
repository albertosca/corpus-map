---
"corpus-map": minor
---

Search beside the map. `CorpusMap` takes a `matches` prop (a set or a list of item ids; `null` or `undefined` means no search, an empty set dims everything): the other items are dimmed and the matches ringed, composing with `hiddenTerritories`, and the item labels and the accessible tree follow. The `CorpusMapHandle` interface gains a `revealAll(ids)` member that fits the view around the matches inside `insets`; a consumer that implements that interface itself must add it. A new entry `corpus-map/search` ships `SearchBox` (debounced, a local accent-folding search over labels and `meta` unless you pass `search`, a `role="status"` count, Escape and a clear button), built separately so the main bundle does not grow for a consumer who never opts in.
