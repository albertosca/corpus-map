---
"corpus-map": minor
---

Controlled view and selection: `viewport`/`defaultViewport`/`onViewportChange` (a box-independent `MapViewport { centre, zoom }`, zoom relative to the fit, with `reason` `"interaction" | "fit" | "spec"`; in controlled mode a new spec proposes its fit instead of moving the view), `selectedId`/`defaultSelectedId`/`onSelectedChange` (a ring around the selected point, `aria-current` in the accessible tree, Escape clears it before zooming out), and `onOpenTerritoryChange` (the territory under the box centre at the near regime). New optional theme token `selectionRing`. Behaviour change: `onSelect` now also fires for a press on a point, not only on a card.
