---
"corpus-map": minor
---

A more serious default look (spec 2026-11-07, "ink and paper"): a desaturated palette (eight colours per theme, re-measured by metrics 15-17), a lighter territory fill (0.16), 2.4 px points, a 1 px territory outline and a 1.75 px family outline, lighter name fonts, and upper-case spaced territory and family names. New optional `Theme.territoryNameStyle` (`{ uppercase?, spacing? }`): the transformed text and the letter spacing are what is measured and placed as well as drawn; absent or `{}` draws as before, so a custom theme without it keeps mixed-case names. The accessible tree, tooltip, legend and cards keep the real name. The default `nearAt` threshold moves from 5 to 4.5 (metric 18), and the compact family-name font from `700 14px` to `600 12px`; pass your own `thresholds` or theme to keep the old values.
