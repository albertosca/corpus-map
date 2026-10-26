---
"corpus-map": minor
---

`cardSizeFor(spec, options?)` (with its `CardSizeOptions`) sizes cards from the corpus's own labels: the label width at a percentile (default 0.9) split over up to `titleLines` lines (default 2), the frame clamped to `[minimumWidth, maximumWidth]` (120 to 240 px), the height holding the lines the title takes plus `extraLines`; pass the result as `cardSize`. Invalid options throw a `RangeError` naming the option.
