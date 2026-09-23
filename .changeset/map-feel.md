---
"corpus-map": minor
---

Map feel: fit-relative level of detail with hysteresis and cross-fade, concave padded territory boundaries with collision-free names, library-owned card frames placed beside their point, hover names, and frame-coalesced dragging.

Breaking: `thresholds.midAt`/`nearAt` are now multiples of the fitted scale (the zoom at which the whole corpus fits) rather than absolute scales — `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 6 }`, so every corpus now opens in the far regime. `Theme.territoryFont` is replaced by `territoryFonts: { large, medium, small }`. Cards are now drawn by the library, framed and placed beside their point (with a group fallback when none fits), instead of anchored at the node's top-left corner.

Additions: `tuning?: Partial<Tuning>` prop and `DEFAULT_TUNING` export, holding every number the literature does not settle (wheel sensitivity, pinch gain, hysteresis, fade band, hull padding, label class cutoffs, hover radius); `cardSize?: { width; height }` prop for the card frame; a small hover tooltip showing the nearest point's name at the mid and near regimes.
