---
"corpus-map": minor
---

Visible keyboard focus: the accessible tree's buttons are visually hidden, so the territory (far and mid regimes) or item (near regime) whose button has keyboard focus is now outlined on the canvas — the territory's boundary rings, or a ring around the item's point — and the outline goes away on blur, or when that button leaves the tree.

`Theme` gains two required fields, `focusOutline` (colour, default `#1d4ed8`, at least 3:1 against a white or `#f7f7f8` background, bare and under the default territory fill — WCAG 2.2 SC 1.4.11) and `focusOutlineWidth` (CSS pixels, default 3); a consumer-built `Theme` must add both, while one spread from `DEFAULT_THEME` gets them.
