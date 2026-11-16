# Accessibility

## Keyboard

Tab reaches the map surface, a named region (`label`, default "Map of N items").

While it has focus:

| Key | Action |
|---|---|
| Arrows | Pan by a tenth of the box (Shift: half) |
| `+` / `=` and `-` | Zoom |
| `0` or `Home` | Fit the whole corpus |
| `Esc` | Zoom out one level of detail |

When the keys settle, the number of items on screen is announced once.

While the map has focus it also captures `Ctrl`/`Cmd` + `+`/`-` as map zoom. A reader who relies on browser zoom moves focus off the map first.

### Walking between items

- `Enter` or `Space` with nothing selected selects the item nearest the centre of the map. It zooms in to the near level first when the points are not drawn.
- While an item is selected, the arrows walk to the nearest item in that direction instead of panning.
- Each step speaks the item's name and territory. At an edge it says "No item to the right".
- `Shift` + arrows pan by a tenth of the box.
- The view follows only when the item nears the edge of the uncovered area.
- `Esc` clears the selection, giving the arrows back to panning.

## Screen readers

The canvas is decorative. The content is a visually hidden accessible tree right after the surface, always present, with a live region announcing the current regime.

- **Far and mid regimes:** it lists the territories under their group headings, then "Unassigned" (the items with no territory).
- **Near regime:** inside a territory it leads with "Back to overview", then the on-screen items (capped) under their territory's heading.
- Focus never falls to the page when the tree changes under it.
- The legend's group headers are headings too.

`headingLevel` (2–6, default 3) sets the level of every heading the map renders. Pick the one that fits your page's outline.

## What is audited

- A test walks the whole path: open one territory, leave it, open another.
- The focused territory or item is outlined on the canvas.
- An axe audit, canaried with injected defects, runs over the map's states and the demo in the suite.
- Contrast is checked in a browser with Lighthouse.
- The theme measurements are in [Styling](styling.md#checking-a-theme).

**Not yet done:** the spoken experience has not been checked with a real screen reader (VoiceOver, NVDA).

## Rendering

The point field renders on Canvas 2D. Nothing in this library requires WebGPU or WebGL to run.
