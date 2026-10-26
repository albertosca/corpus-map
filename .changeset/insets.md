---
"corpus-map": minor
---

New `insets` prop (`{ top?, right?, bottom?, left? }` in pixels, exported type `Insets`): the part of the map's box that a consumer overlay covers, such as a side drawer. Edge markers stay inside the uncovered area, a neighbour under the overlay counts as off screen and gets a marker, and `reveal` centres the item in the uncovered area. The fit ignores insets on purpose, so opening or closing an overlay never changes the zoom ratio or the regime. Missing, negative and non-finite sides read as 0.
