---
"corpus-map": minor
---

Visual legibility and colour. Territories get one categorical colour each (from `theme.palette`, or `Territory.colour`), painted in a single fill layer so overlaps never darken; points take their territory's colour and show visited state by shape (filled disc / ring); the first view fits territory shapes and names; new `legend` and `presentation` props; `onViewChange` reports `presentation`; new `DARK_THEME`.

Migration for a custom `Theme`:

| Removed | Use instead |
| --- | --- |
| `territoryFill` | `palette` (one opaque colour per territory) and `territoryFillAlpha` |
| `territoryStroke` | nothing: outlines use each territory's colour |
| `visited` | the territory colour, drawn as a filled disc |
| `unvisited` | the territory colour, drawn as a ring |
| (new) `pointNeutral` | colour of points and territories without a palette colour |
