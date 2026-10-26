---
"corpus-map": minor
---

`cardSizeFor(spec, options?)` (with its `CardSizeOptions`) sizes cards from the corpus's own labels: the label width at a percentile (default 0.9) split over up to `titleLines` lines (default 2), the frame clamped to `[minimumWidth, maximumWidth]` (120 to 240 px), the height holding the lines the title takes plus `extraLines`; both sides include the padding and the card frame's borders, so the renderer's own box is the padded text column. Pass the result as `cardSize`. Invalid options throw a `RangeError` naming the option, including a `padding` that leaves no text column at `maximumWidth`.

A group card's "+N" badge now sits in the card's top-right corner instead of after the renderer's content, where a card sized to its content clipped it.

`DEFAULT_THRESHOLDS.nearAt` moves from 6 to 3.5, so cards appear at a 3.5x zoom-in instead of 6x: the earliest value at which no gallery corpus, on a desktop or a phone, shows its cards more piled up into group cards than it did at 6 (by more than 0.10 of the items on screen). Pass `thresholds={{ midAt: 2, nearAt: 6 }}` to keep the old behaviour. Behaviour change: thresholds built as `{ ...DEFAULT_THRESHOLDS, midAt }` with a `midAt` above 3.5 and up to 6, valid before, now throw a `RangeError` (`midAt` must be <= `nearAt`); set `nearAt` too.
