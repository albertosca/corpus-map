# Usage reference

Everything `<CorpusMap>` accepts, grouped by topic. For the data it renders, see [The map spec](map-spec.md).

## A first map

```tsx
import { CorpusMap, type MapNode, validateSpec } from "corpus-map";

const spec = validateSpec({
  version: "1",
  territories: [{ id: "alkali", name: "Alkali metals", members: ["li"], centroid: [1, 2] }],
  nodes: [{ id: "li", label: "Lithium", x: 1, y: 2, territory: "alkali", meta: { symbol: "Li", atomicNumber: 3 } }],
});

function renderCard(node: MapNode) {
  const meta = node.meta as { symbol: string; atomicNumber: number };
  return (
    <div>
      <strong>{node.label}</strong> ({meta.symbol}, #{meta.atomicNumber})
    </div>
  );
}

<CorpusMap
  spec={spec}
  renderCard={renderCard}
  width={960}
  height={640}
  onSelect={(node) => console.log("selected", node.id)}
  onRegimeChange={(regime) => console.log("now showing", regime)}
/>;
```

## The spec

- `<CorpusMap>` validates `spec` during render and throws a `SpecError` for a malformed one, which unmounts the nearest error boundary.
- Either wrap the map in an error boundary or call `validateSpec` yourself first, as above, and handle the error where the data comes from.
- `spec` must be referentially stable. A new object is a new corpus and refits the view, so build it once (state, `useMemo` or a module constant), never inline.

## Size

- `width` and `height` are optional.
- Pass both and the map fits to them immediately, with no `ResizeObserver`.
- Leave either out and the root fills its parent (`100%` via CSS), measured by a `ResizeObserver` (the `useElementSize` hook internally). Nothing paints until the first measurement arrives.
- A box with zero width or height, from either source, counts as no box yet. The map paints nothing and fits to the first box whose sides are both positive.

A later box change keeps the current scale, and keeps the world point that was at the old box's centre at the new box's centre. It does not refit and discard the user's zoom. Changing `spec` still refits. No `key=` remount is needed either way.

## The handle

Pass a `ref` typed `CorpusMapHandle`:

| Method | What it does |
|---|---|
| `fit()` | Refits after a box change, for example when your own layout changes the space available |
| `zoomIn()` / `zoomOut()` | One wheel notch each, clamped to the zoom band the wheel handler uses |
| `reveal(id)` | Centres the view on an item at the current zoom, without selecting it |
| `revealAll(ids)` | Fits the view around the matches still on the map, inside `insets`, with the scale clamped to the zoom range (a single match is centred as close as that range allows) |
| `setView(view)` | Jumps to a `MapViewport`, clamped to the zoom band. An invalid one does nothing |
| `getView()` | Reads the view now drawn (`undefined` until the map has a box and its scene) |
| `focus()` | Moves focus to the map surface |

## Events

### Regime

`onRegimeChange` fires once on mount (once under `<StrictMode>` too) with the initial regime, and again on every crossing. The regime is `"far"`, `"mid"` or `"near"`, and the `Regime` type is exported. A consumer can, for example, show a legend only at the far regime.

### View

`onViewChange?: (view: CorpusMapView) => void` reports `{ regime, ratio, visibleCount }`. It fires:

- once on mount;
- after any committed render where the regime, the scale ratio to the fitted scale, or the on-screen node count changed;
- after every refit (a new `spec`, or `fit()`), even when those values match.

It fires at most once per animation frame during a drag, since drags are already coalesced to one commit per frame. `CorpusMapView` is exported.

## Viewport

`viewport?: MapViewport`, `defaultViewport?: MapViewport` and `onViewportChange?: (viewport, { reason }) => void` hold the view the way `hiddenTerritories` holds the legend:

- A present `viewport` means controlled. Absent means the map keeps its own, starting from `defaultViewport` for the first spec only.
- A `MapViewport` is `{ centre: [x, y], zoom }`: the world point at the box centre, and the scale relative to the fit of the whole box with no `insets` (the same `ratio` `onViewChange` reports). The same value opens in the same regime on any box.

`onViewportChange` fires in both modes, once per real change, with a `reason`:

| Reason | When |
|---|---|
| `"interaction"` | Drag, wheel, keys, minimap, the accessible tree, `zoomIn`/`zoomOut` |
| `"fit"` | `fit()`, the `0`/`Home` key, Back to overview |
| `"spec"` | A new `spec` |
| `"resize"` | The box changed while uncontrolled |

A consumer echoing back what it received causes no second emission.

Box changes:

- Controlled, a box change emits nothing, because the public view survives it.
- Uncontrolled, the map keeps its pixel scale, so the zoom over the new fit moves and is emitted once with `reason: "resize"`.

New specs:

- Controlled, the library never moves the view on its own. A new `spec` keeps the drawn view and proposes its fit with `reason: "spec"`. The consumer stores it or ignores it (to keep a view from a link).
- The regime resets when the view passed back is that fit.

Invalid input never breaks the map: a non-finite `centre` or `zoom`, or `zoom <= 0`, draws the fit, and a `zoom` outside 1/8 to 64 is clamped. `MapViewport` and `ViewportChangeReason` are exported.

## Insets

`insets?: Partial<Insets>` is the part of the box, in pixels per side, that your own overlay covers: a drawer or a toolbar.

- Edge markers, `reveal`, `revealAll` and the legend treat the rest as the usable area.
- So does every fit: the first view, a new `spec`, `fit()`, the `0`/`Home` key and Back to overview scale and centre the whole map into the box less `insets`, read at the moment of the fit.
- Zoom ratio 1 stays the fit of the whole box, so a fit beside an overlay reports a `ratio` below 1. Do not read `ratio === 1` as "at the fit".
- A free area under 120 px on either axis, or one that would need a zoom below the 1/8 band, is ignored and the whole box is fitted.
- Changing `insets` alone moves nothing. The reader's view stays put until the next fit.

## Selection

`selectedId?: string | null`, `defaultSelectedId?: string | null` and `onSelectedChange?: (id: string | null) => void` hold the selected item. It is controlled when `selectedId` is present, even `null`.

- A press or tap on a point selects it. A press that hits no point clears it.
- Escape clears the selection first, and zooms out a regime on the next press.
- `onSelectedChange` fires only when the id changes. `onSelect(node)` keeps firing on every activation, for a press on a point as well as on a card.
- The selected point gets a ring outside the keyboard focus ring (theme token `selectionRing`, falling back to `territoryLabel`), fading with the points. Its button in the accessible tree carries `aria-current="true"`.
- An id whose node is dimmed or absent reads as no selection until it is shown again.
- The arrow walk names each item as it requests it. A controlled consumer that refuses or delays a request hears a name before, or without, the ring moving there. The next arrow continues from the latest request until the consumer draws a selection of its own.

`onOpenTerritoryChange?: (id: string | null) => void` reports the open territory: the one, not dimmed, whose shape holds the box centre while the regime is near (the innermost when they nest), and `null` otherwise. It fires only on a change.

## Touch

- Two fingers pinch-zoom about their midpoint and pan together.
- A double tap zooms in one step about the tap. A two-finger tap zooms out one step. A tap selects.
- A finger may drift up to 10 px and still tap.
- A tap on empty map clears the selection once the double-tap window has passed, so a double tap never clears it. It clears only if nothing else selected an item meanwhile.

Below a 600 px box:

- Family names are drawn and fitted in `theme.territoryFonts.compact` (default `"600 12px system-ui, sans-serif"`).
- Every legend control is at least 44 px tall.
- When `insets` grow over the selected item (a sheet opening on top of it), the view moves at the same zoom to bring it back into the uncovered area.

## Minimap

`minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" }` is off by default.

- It adds a 160x110 canvas in a corner of the box, painting the territory shapes and the current view as a rectangle.
- Pressing or dragging it centres the main view on the pressed world point, through the same coalesced, `onViewChange`-firing update a drag on the map itself uses.
- `true` picks the default corner, `"bottom-left"`. `MinimapCorner` is exported for the object form.

## Cards

Cards are decorative. The overlay they live in is `aria-hidden` and `inert`, so nothing inside a card is focusable, in the tab order, or clickable on its own.

- A press released over a card fires `onSelect` with that node. That is the whole interaction surface of a card.
- Interactive content belongs in your own UI, driven by `onSelect`.

Only the selected item gets a card:

- It shows at the mid and near regimes, while its point is inside the box and not under an `insets` side. It fades in and out with the points.
- `cardSize?: { width: number; height: number }` (default `{ width: 160, height: 56 }`) sets the frame the library draws around it. `renderCard(node)` only fills its content.
- The card sits beside the selected point, on whichever of eight spots next to it, or eight further out, hides the fewest of the item's drawn edges and other points inside the box. The placement is internal (`src/cards/placeSelectedCard.ts`); it is not part of the package's public API.
- A card on the outer ring is joined to its point by a short leader line.

### Fitting the card to the corpus

`cardSizeFor(spec, options?)` returns a `cardSize` fitted to the corpus's own labels, so cards neither waste space on short titles nor cut long ones.

- It takes the label width nine titles in ten fit (`percentile`, default 0.9) and splits it over `titleLines` (default 2).
- It clamps the frame to `[minimumWidth, maximumWidth]` (default 120–240 px, padding and the card's borders included).
- It makes the height hold those lines plus `extraLines` (a year, a subtitle).
- Both sides count the library's card frame (a 4 px stripe and a 1 px border across, 1 px top and bottom), so the box `renderCard` draws in is the padded text column.
- Pass the `font`, `lineHeight` and `padding` your card renderer actually uses (defaults `"16px sans-serif"`, 1.25, 8), and clamp the title in the renderer to `titleLines` for the one label in ten that is longer.
- `measure` swaps the library's 0.6 em-per-character estimate for a real measurement.
- Invalid options throw a `RangeError` naming the option. A `padding` that leaves no text column at `maximumWidth` is one of them.

If a card shows a different text than `node.label` (an element's name rather than its symbol, say), size it from a spec whose labels are that text:

```ts
cardSizeFor({ ...spec, nodes: spec.nodes.map((node) => ({ ...node, label: titleOf(node) })) })
```

## Level of detail

`thresholds.midAt` and `thresholds.nearAt` are multiples of the fitted scale (the zoom at which the whole corpus fits the box), not absolute scale values.

- `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 4.5 }`.
- Every corpus opens in the far regime regardless of its own extent. Reaching the mid or near regime only ever takes a 2x or 4.5x zoom-in from there.

## Tuning

`tuning?: Partial<Tuning>` overrides any of the numbers the literature does not settle, without touching code:

- wheel sensitivity and trackpad pinch gain;
- the per-event zoom cap;
- the level-of-detail hysteresis and cross-fade band;
- territory boundary padding;
- label size cutoffs;
- hover radius.

`Tuning` and `DEFAULT_TUNING` are exported, so a consumer (or a tuning panel) can start from the defaults and override individual fields, the same way as `theme`.

## Item labels

At the near regime the most relevant items carry a compact label, painted on the canvas as an open tooltip beside the point.

Which items get one:

- A higher `MapNode.priority` (finite, absent counts as 0) is labelled first.
- Then the item with more edges.
- Then the lower id.

How a label looks:

- The text wraps at `tuning.itemLabelWidth` screen pixels (default 160) over at most `tuning.itemLabelLines` lines (default 3). The last line ends in an ellipsis when the label runs longer.
- The font is `theme.itemLabelFont` (default `"500 11px system-ui, sans-serif"`). Its size can be in px, pt, em or rem, em and rem counting 16px.

How they are placed:

- Labels are placed once per spec, after the territory names, so a label never covers a name or another label.
- The set shown depends only on the zoom, so a pan never makes one appear or vanish.
- Labels fade in across the near threshold's cross-fade band.
- Pressing a label selects its item, like pressing its point.

## Families at mid and near

With families, the mid and near regimes draw leaves only for the family that dominates the screen. Each family gets a weight from its share of the largest family's on-screen items:

- Below `tuning.focusFloor` (default 0.5) the family is drawn as a family.
- At or above `tuning.focusFull` (default 1) all its leaves are drawn.
- In between the weight rises smoothly, so nothing pops on a pan.

## Hover

At the mid and near regimes, hovering the nearest point within `tuning.hoverRadius` screen pixels shows its label in a small tooltip. It is not shown when that point's label is already drawn where it can be seen (on the canvas and not under the selected card).

## Search results on the map

`matches?: ReadonlySet<string> | readonly string[] | null` marks the items a search found.

- `undefined` or `null` means no search is active.
- An empty set dims everything.
- Otherwise the other items are dimmed and the matches are drawn with a ring.
- It composes with `hiddenTerritories`: a dimmed territory stays dimmed.

The map never moves by itself when `matches` changes. Call `revealAll(ids)` on the handle to frame them.

The item labels and the accessible tree follow the matches, and the tree's buttons carry `aria-description="match"`, so a keyboard or screen-reader user reads the same result.

The ready-made boxes that produce `matches` are in [Add-ons](addons.md).
