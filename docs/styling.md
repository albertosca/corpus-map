# Styling

## The default look

The default look is two tones and one accent:

- a light and a dark base, both slate, and one orange accent;
- four slate steps for the territories, no hues;
- the selected item is a filled accent dot with a ring in the accent's text colour;
- a light fill, small points and thin outlines;
- upper-case, spaced territory and family names.

`Theme`, `ThemeInput`, `DEFAULT_THEME`, `DARK_THEME`, `Tones`, `DEFAULT_TONES` and `DARK_TONES` are exported from `corpus-map`, so a consumer can type a custom theme or start from a house look and change a few things.

## Two tones and one accent

Eight colour roles, `Theme.tones`, restyle the whole map. A consumer who only wants another accent, or other base colours, names roles and leaves the rest of the theme alone.

| Role | What it paints |
|---|---|
| `ground` | The page. `checkTheme` measures against it when you give no `page`. |
| `surface` | Cards, and the text on the tooltip. |
| `secondBase` | The other base: the tooltip's background. |
| `ink` | Names, the card border (at 45% alpha), the keyboard focus outline, and the darkest territory step. |
| `muted` | Points and edges. |
| `accent` | The one fill that stands out: the selected item's dot. |
| `onAccent` | Text and icons you put on an `accent` fill. The map draws none. |
| `accentText` | The accent as a ring, text or link: it keeps 4.5:1 on `ground` and `surface`. The selection ring uses it. |

The territory palette is derived from the roles: four steps from `ground` toward `ink`, the last one being `ink` itself.

### Roles first, fields second

Precedence, from strongest to weakest:

1. a field you pass (`selectionRing`, `palette`, `focusOutline`, …);
2. the role that decides that field;
3. the house default.

```tsx
<CorpusMap theme={{ base: "dark", tones: { accent: "#7c3aed", accentText: "#c4a5ff" } }} … />
```

- `base: "dark"` starts from `DARK_THEME` instead of `DEFAULT_THEME`; roles you pass are laid over it.
- A role you pass as `undefined` keeps the base's.
- An unknown role or a colour the library cannot read is a `RangeError` naming it. `#rgb`, `hsl()` and CSS names are converted to `#rrggbb` first.
- A `palette` you pass replaces the slate steps, so a consumer who wants hues still gets them.

### Choosing an accent

The accent has to be another colour from the bases, not just another tone: on the opposite side of the colour wheel, and still apart under the three colour-vision deficiencies. `checkTheme` has an `accent` metric for it:

- the two bases differ in lightness by at least 0.35 (OKLab);
- the accent is at least 120° of hue from `secondBase`, and at least twice as saturated;
- text and ink pairs reach 4.5:1 and the accent fill 3:1 on `surface`;
- the accent is at least 8 apart from `ground`, `surface` and `secondBase` under protanopia, deuteranopia and tritanopia, and at least 9 (CIEDE2000) from every territory colour.

Keep the accent for one thing per screen. The map spends it on the selected item's dot; the demo spends it on the "Show on map" button until something is selected. Use `accentText`, an icon and words, not a second fill, for anything that needs attention.

## Passing a theme

`theme` takes a partial. Your fields are laid over `DEFAULT_THEME` (or `DARK_THEME` with `base: "dark"`):

```tsx
<CorpusMap theme={{ territoryLabel: "#222", territoryOutlineWidth: 2 }} … />
```

- `territoryFonts` and `territoryNameStyle` merge field by field.
- A field passed as `undefined` takes the default.
- A role in `tones` reaches every field it decides (see above), unless you pass that field too.
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

The default is the `ink` role, which reaches at least 3:1 against the page in both house themes (WCAG 2.2 SC 1.4.11).

## Checking a theme

`corpus-map/theme-check` has `checkTheme(theme, { page })`. It runs the accessibility measurements the default look is held to:

- points and names against the fills beneath them (metrics 15 and 16);
- palette pairs apart in normal vision and three colour-vision deficiencies (metric 17);
- the keyboard focus outline;
- the outlines and the unvisited ring;
- the eight roles themselves: the shape of the accent and its contrast and colour-vision pairs (metric `accent`).

It returns a list of `ThemeProblem` (`metric`, `subject`, `measured`, `required`, `message`), empty when the theme passes.

### The page colour

- The `page` option is the colour behind the map.
- Without it the page is the theme's `tones.ground`, unless that sits on the names' side (light names need a dark page, dark names a light one), in which case it is `#18181b` or white.
- An unparseable `page` throws a `RangeError`, and so does an invalid width (it is validated first).

### Colour notations

- Colours are read in `#rrggbb`, `rgb()` and `rgba()`.
- `#rgb`, `hsl()`/`hsla()` and the 148 CSS colour names are converted to those when the theme is resolved.
- Any other notation (`oklch()`, `color-mix()`, `transparent`) is reported as a problem. The measurements stop there, since they cannot be made without a canvas.

### In development

`CorpusMap` runs the same check once per distinct theme, after the first commit, and prints one `console.warn`.

- It is measured on the derived page, so pass your own page to `checkTheme` for an exact answer.
- In production the check is never loaded and nothing is printed.
