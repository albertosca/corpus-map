---
"corpus-map": minor
---

Every fit (the first view, a new `spec`, `fit()`, the fit key, Back to overview) now scales and centres the map into the box less `insets`, read at the moment of the fit, so the whole map sits beside a drawer instead of under it. A fit beside an overlay reports a `ratio` below 1 (ratio 1 stays the fit of the whole box), a free area under 120 px on either axis is ignored, and an `insets` change alone still moves nothing.
