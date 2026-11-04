---
"corpus-map": patch
---

`SearchBox` and `FilterBox` now call `onMatches(null)` when they unmount while holding ids, so a consumer that swaps one box for another (a layout change) is not left with the map dimmed by a box nobody can see. `FilterBox` also keeps its open panel inside the window after the window changes while it was hidden, and `facetsOf` reads a `null`, a number or a list holding `null` from `attribute` without throwing.
