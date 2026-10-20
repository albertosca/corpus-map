---
"corpus-map": minor
---

Organise many categories (spec 2026-10-20). Territories can carry a `group`; without one, 10 to 400 territories are grouped from their centroids (`deriveTerritoryGroups`, exported) and the far map names the groups below `tuning.groupNamesUntil` (default 1.4), cross-fading to territory names above it. The legend lists every territory (no more "+N more"), grouped, filterable, with on-screen awareness and checkboxes; `hiddenTerritories` / `defaultHiddenTerritories` / `onHiddenTerritoriesChange` dim territories instead of hiding them. A tooltip names the territories under the cursor, or under a tap on touch. Behaviour change: `onViewChange`'s `visibleCount` counts only points of territories that are not dimmed.
