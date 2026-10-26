---
"corpus-map": minor
---

`renderCard` now receives a second argument, `CardContext` (exported): `badgeCount` is the number the card's group badge shows in its top-right corner ("+3" is 3), or 0 when the card has no badge, so a renderer can keep its first line clear of that corner. Existing one-argument renderers keep working unchanged.
