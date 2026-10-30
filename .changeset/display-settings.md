---
"corpus-map": minor
---

`cardSizeFor(spec, options?)` (with its `CardSizeOptions`) sizes cards from the corpus's own labels: the label width at a percentile (default 0.9) split over up to `titleLines` lines (default 2), the frame clamped to `[minimumWidth, maximumWidth]` (120 to 240 px), the height holding the lines the title takes plus `extraLines`; both sides include the padding and the card frame's borders, so the renderer's own box is the padded text column. Pass the result as `cardSize`. Invalid options throw a `RangeError` naming the option, including a `padding` that leaves no text column at `maximumWidth`.

