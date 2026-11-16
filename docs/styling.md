# Styling

## The default look

The default look is sober, "ink and paper":

- a desaturated palette;
- a light fill;
- small points;
- thin outlines;
- upper-case, spaced territory and family names.

Both the `Theme` type and the library's `DEFAULT_THEME` are exported from `corpus-map`, so a consumer can type a custom theme or start from the default and override individual fields.

## Passing a theme

`theme` takes a partial. Your fields are laid over `DEFAULT_THEME`:

```tsx
<CorpusMap theme={{ territoryLabel: "#222", territoryOutlineWidth: 2 }} … />
```

- `territoryFonts` and `territoryNameStyle` merge field by field.
- A field passed as `undefined` takes the default.
- `resolveTheme(input)` is the same merge as a function, and `ThemeInput` is its type.

## Line widths

Six optional line widths restyle the strokes. Each is in CSS pixels and a finite number above 0. A bad one is a `RangeError` naming the field.

| Field | Default | Note |
|---|---|---|
| `territoryOutlineWidth` | 1 | |
| `groupOutlineWidth` | 1.75 | |
| `unvisitedRingWidth` | 1.5 | The ring's outer edge stays at `pointRadius` |
| `selectionRingWidth` | 2 | |
| `matchRingWidth` | 1.5 | |
| `neighbourRingWidth` | 1.5 | |

## Territory names

`theme.territoryNameStyle` is `{ uppercase?: boolean; spacing?: number }`. `spacing` is a finite number of at least 0, in CSS pixels.

- The transformed text and the spacing are what is measured and placed as well as drawn.
- The accessible tree, tooltip, legend and cards keep the real name.
- A theme without the field, or with `{}`, takes the house default: upper case with 0.6 px spacing.
- Pass `{ uppercase: false }` for mixed-case names.

## The keyboard focus outline

The accessible tree is visually hidden, so the territory or item whose button has focus is outlined on the canvas. Two theme fields control it: `focusOutline` and `focusOutlineWidth`.

The default blue reaches at least 3:1 against a white or light-grey page (WCAG 2.2 SC 1.4.11).

## Checking a theme

`corpus-map/theme-check` has `checkTheme(theme, { page })`. It runs the accessibility measurements the default look is held to:

- points and names against the fills beneath them (metrics 15 and 16);
- palette pairs apart in normal vision and three colour-vision deficiencies (metric 17);
- the keyboard focus outline;
- the outlines and the unvisited ring.

It returns a list of `ThemeProblem` (`metric`, `subject`, `measured`, `required`, `message`), empty when the theme passes.

### The page colour

- The `page` option is the colour behind the map.
- Without it the page is derived from the theme: white for dark names, `#18181b` for light ones.
- An unparseable `page` throws a `RangeError`, and so does an invalid width (it is validated first).

### Colour notations

- Colours are read in `#rrggbb`, `rgb()` and `rgba()`.
- `#rgb`, `hsl()`/`hsla()` and the 148 CSS colour names are converted to those when the theme is resolved.
- Any other notation (`oklch()`, `color-mix()`, `transparent`) is reported as a problem. The measurements stop there, since they cannot be made without a canvas.

### In development

`CorpusMap` runs the same check once per distinct theme, after the first commit, and prints one `console.warn`.

- It is measured on the derived page, so pass your own page to `checkTheme` for an exact answer.
- In production the check is never loaded and nothing is printed.
