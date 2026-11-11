---
"corpus-map": minor
---

Styles a consumer can define (spec 2026-11-11). `CorpusMap`'s `theme` now accepts a partial `ThemeInput` laid over `DEFAULT_THEME` (`resolveTheme` is exported); six optional line widths (`territoryOutlineWidth`, `groupOutlineWidth`, `unvisitedRingWidth`, `selectionRingWidth`, `matchRingWidth`, `neighbourRingWidth`) restyle the strokes, a bad width being a `RangeError`. New separate entry `corpus-map/theme-check` with `checkTheme(theme, { page })` (about 5 kB gzipped), the accessibility measurements the default look is held to, and a one-time development `console.warn` from `CorpusMap` when a theme fails them; production never loads it. The core grows by about 600 bytes gzipped. A hand-written whole `Theme` without `territoryNameStyle` now draws upper-case names (the house default) instead of mixed case; pass `{ uppercase: false }` to keep them mixed.
