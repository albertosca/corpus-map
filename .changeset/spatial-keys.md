---
"corpus-map": minor
---

Walk the map with the keyboard: while an item is selected, the arrow keys move the selection to the nearest item in that direction (spoken as its name and territory, "No item to the right" at an edge) and fire `onSelectedChange` and `onSelect`; the view follows only when the item nears the edge of the area the `insets` leave uncovered. With nothing selected, `Enter` or `Space` select the item nearest the centre, zooming in to the near regime when the points are not drawn. Behaviour change: while an item is selected the arrows no longer pan, and `Shift` + arrow pans by the small step (a tenth of the box) instead of half the box.
