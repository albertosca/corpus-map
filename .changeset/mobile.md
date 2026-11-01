---
"corpus-map": minor
---

Works on a phone. Touch: two fingers pinch-zoom about their midpoint and pan together, a double tap zooms in one step about the tap, a two-finger tap zooms out one step, and a tap selects (a tap on empty map clears the selection after the double-tap window, so a double tap never clears it). Below a 600 px box the family names are drawn and fitted in a compact font, `Theme.territoryFonts.compact` (default `"700 14px system-ui, sans-serif"`), so a phone shows every family name at the fitted view; a width change across 600 swaps the names without rebuilding the scene or moving the view. When the `insets` grow over the selected item (a drawer or sheet opening on top of it), the view moves at the same zoom to bring it back into the uncovered area; a growth elsewhere, a shrink, or an item already covered moves nothing.
