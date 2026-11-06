🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml) ![gzip size](docs/badges/size.svg)

Coverage thresholds of 90% lines / 85% branches are enforced inside the `test` job and the lcov report is published as a CI artifact on every run; a hosted coverage badge is deliberately absent until a coverage service (Codecov or similar) is connected.

## What it is

`corpus-map` is a React library that renders pre-computed coordinates and named territories as a zoomable landscape, where the zoom level is the level of abstraction — far out you see named regions, and as you zoom in a region opens into its items, the most relevant labelled. It is not a graph library: it runs no force simulation and computes no layout — it receives coordinates and territory names that someone else already produced, and the optional edges it draws are links between items the producer already placed, shown for the hovered and the selected item, never a layout input.

Libraries exist that draw named territories with boundaries, libraries exist that render rich DOM cards for individual items, and libraries exist that scale to millions of points, but prior-art research examining thirteen of them found none that treats the zoom level itself as the level of abstraction, swapping a territory for a card as the user zooms in. That composition — not any single piece — is what this library provides.

Each of those neighbours does its own piece better than this library does. Apple's Embedding Atlas and deepscatter scale to millions of points, where this library is designed for about 10,000 items and stops there by choice; Embedding Atlas also labels a point field hierarchically by zoom, and deepscatter swaps a point's representation by zoom level. AntV G6 draws concave hulls whose labels follow the contour and layers HTML nodes over its scene, React Flow renders rich DOM cards, and DataMapPlot computes alpha-shape territory boundaries from member points. If one of those pieces alone is what you need, one of them is likely the better tool; [CREDITS.md](CREDITS.md) says what the four that shaped a design decision taught this project.

## The three layers

| Layer | Technology | Responsibility |
|---|---|---|
| Point field | Canvas 2D, drawn imperatively outside the React tree | Territory boundaries, point marks, the pan/zoom transform |
| Card overlay | React DOM, positioned absolutely over the canvas | The selected item's card |
| Accessible tree | React DOM, visually hidden, always present | A keyboard- and screen-reader-navigable mirror of the current zoom level |

React never renders thousands of nodes directly: it renders the shell, the selected item's card, and the accessible tree for the current level, while the canvas is repainted imperatively whenever the transform changes.

## The map spec

The library is agnostic about domain exactly to the extent that this contract is well defined:

```jsonc
{
  "version": "1",
  "territories": [
    {
      "id": "t1",
      "name": "Alkali metals",
      "members": ["n1", "n2"],
      "centroid": [12.4, -3.1],
      "boundary": [[10.0, -5.0], [14.2, -4.8]], // optional
      "parent": "metals"                         // optional: another territory's id; that parent lists "members": []
    }
  ],
  "nodes": [
    {
      "id": "n1",
      "label": "Lithium",
      "x": 12.1,
      "y": -3.4,
      "territory": "t1",
      "state": "visited",                        // "visited" | "unvisited"
      "badges": ["stable"],                       // opaque strings, styled by the consumer
      "meta": { "symbol": "Li", "atomicNumber": 3 } // opaque; the renderer NEVER interprets this
    }
  ],
  "edges": [                                     // optional
    { "source": "n1", "target": "n2", "weight": 0.9, "reason": "same group" }
  ]
}
```

- `meta` is opaque: the renderer passes it straight through to the consumer-supplied card component and never reads inside it.
- `territory` may be `null`: a node with no territory is normal (for example, noise points from density-based clustering), not an error, and still renders.
- `boundary` is optional: when a territory has none, the renderer computes a hull from its members' coordinates; when present, the producer's boundary wins.
- Membership is declared twice and must agree: every node with a `territory` is listed in that territory's `members`, and every member's node points back at that territory. `validateSpec` rejects a spec where the two disagree, naming the path.
- `parent` nests territories two levels deep: a parent is any territory another one names as `parent`, it lists no members of its own (its members are its children's), a parent cannot itself have a parent, nodes belong to leaves only, and `parent` and `group` cannot be mixed in one spec. With parents, far views read as families (a palette colour per family, each child a lighter or darker tint of it) and near views as the leaves.
- `edges` are undirected links between two different, existing nodes, at most one per pair; `weight` is a finite number `>= 0` (heavier draws first and thicker), `reason` a non-empty string shown in the related list. The map draws the first `tuning.edgesPerNode` edges of the hovered and the selected item, and, at mid and near, marks the selected item's off-screen neighbours at the box edge and lists its related items (those not in a dimmed territory) in the accessible tree; `relatedItems(spec, id)` gives the same list to a consumer (it indexes the edges and ids once per spec object and reuses that index, so asking for many ids is cheap; pass a new spec object after changing edges or nodes, since a spec mutated in place keeps its old index). A neighbour whose line never crosses the visible box gets no marker.
- **Territory identity must bind to the centroid or to the member set, never to a cluster index.** Clustering with the same input and a different seed returns the same partition under different integer labels, so a producer that names territories by cluster number silently renames them on every recomputation and the map the user learned stops existing.

### Naming derived groups with an LLM

Without `group` or `parent`, a corpus of 10 to 400 territories gets groups derived from its geometry, named provisionally after the largest member plus a count ("Machine Learning +10"). `tools/group-names/` is a maintainer tool, outside the package, that asks Claude to name those groups from their members and a sample of their items' labels, and writes the names to a small file you commit and review like any other data:

```sh
export ANTHROPIC_API_KEY=...   # or: set -a; source ~/.config/anthropic/api.env; set +a
bun tools/group-names/main.ts corpus.json corpus.groups.json [--model claude-opus-5-5]
```

Each name is checked before anything is written (at most 24 characters, distinct, never "Other"); a run that fails writes nothing. Apply the file when the corpus loads with `withGroupNames(body, file)`, which writes `group` onto every territory and leaves the body untouched when the file is stale (the corpus no longer derives exactly those groups, or a name breaks a rule); `staleGroups(spec, file)` lists what changed after the corpus is re-exported, so a test can fail on stale names. Both live in this repository's `tools/group-names/` (`groupNamesFile.ts` and `stale.ts`), not in the npm package: copy them, or write `group` into your corpus directly. The tool runs offline once, never in the browser: a key in a browser is a leaked key, and the same corpus would render different names on two visits.

## Usage

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

`<CorpusMap>` validates `spec` during render and throws a `SpecError` for a malformed one, which unmounts the nearest error boundary. Either wrap the map in an error boundary or, as above, call `validateSpec` yourself first and handle the error where the data comes from.

`width` and `height` are optional. Pass both and the map fits to them immediately, with no `ResizeObserver`; leave either out and the root fills its parent (`100%` via CSS) instead, measured by a `ResizeObserver` (the `useElementSize` hook internally), painting nothing until the first measurement arrives. A box with zero width or height, from either source, counts as no box yet: the map paints nothing and fits to the first box whose sides are both positive. Either way, a later box change — a new measurement, or a later `width`/`height` prop change — keeps the current scale and keeps the world point that was at the old box's centre at the new box's centre, instead of refitting and discarding the user's zoom. Changing `spec` still refits the viewport to the new extent, as before; no `key=` remount is needed either way. To refit after a box change (a consumer's own layout changing the space available, for example), pass a `ref` typed `CorpusMapHandle` and call its `fit()` — the same handle also exposes `zoomIn()`/`zoomOut()`, one wheel notch each, clamped to the same zoom band the wheel handler itself uses, `reveal(id)`, which centres the view on an item at the current zoom without selecting it, `setView(view)`, which jumps to a `MapViewport` (clamped to the zoom band; an invalid one does nothing), and `getView()`, which reads the view now drawn (`undefined` until the map has a box and its scene).

`onRegimeChange` fires once on mount (once under `<StrictMode>` too) with the initial regime (`"far"`, `"mid"` or `"near"`, the `Regime` type is exported) and again on every crossing, so a consumer can, for example, show a legend only at the far regime. `onViewChange?: (view: CorpusMapView) => void` fires once on mount, again after any committed render whose regime, scale ratio to the fitted scale, or on-screen node count changed, and after every refit (a new `spec`, or `fit()`) even when those values match — at most once per animation frame during a drag, since drags are already coalesced to one commit per frame; `CorpusMapView` is exported.

`viewport?: MapViewport`, `defaultViewport?: MapViewport` and `onViewportChange?: (viewport, { reason }) => void` hold the view the way `hiddenTerritories` holds the legend: present `viewport` means controlled, absent means the map keeps its own, starting from `defaultViewport` for the first spec only. A `MapViewport` is `{ centre: [x, y], zoom }`, the world point at the box centre and the scale relative to the fit (the same `ratio` `onViewChange` reports), so the same value opens in the same regime on any box. A box change emits nothing when controlled (the public view survives it); uncontrolled, the map keeps its pixel scale, so the zoom over the new fit moves and is emitted once with `reason: "resize"`. `onViewportChange` fires in both modes, once per real change, with `reason` `"interaction"` (drag, wheel, keys, minimap, the accessible tree, `zoomIn`/`zoomOut`), `"fit"` (`fit()`, the `0`/`Home` key, Back to overview), `"spec"` or `"resize"`; a consumer echoing back what it received causes no second emission. Controlled, the library never moves the view on its own: a new `spec` keeps the drawn view and proposes its fit with `reason: "spec"`, and the consumer stores it or ignores it (to keep a view from a link); the regime resets when the view passed back is that fit. Invalid input never breaks the map: a non-finite `centre` or `zoom`, or `zoom <= 0`, draws the fit, and a `zoom` outside 1/8 to 64 is clamped. `MapViewport` and `ViewportChangeReason` are exported.

`selectedId?: string | null`, `defaultSelectedId?: string | null` and `onSelectedChange?: (id: string | null) => void` hold the selected item, controlled when `selectedId` is present, even `null`. A press or tap on a point selects it; a press that hits no point clears it, and so does Escape, which closes the selection first and zooms out a regime on the next press. `onSelectedChange` fires only when the id changes; `onSelect(node)` keeps firing on every activation, and now fires for a press on a point too, not only on a card. The selected point gets a ring outside the keyboard focus ring (theme token `selectionRing`, falling back to `territoryLabel`), fading with the points, and its button in the accessible tree carries `aria-current="true"`; an id whose node is dimmed or absent reads as no selection until it is shown again. The arrow walk names each item as it requests it, so a controlled consumer that refuses or delays a request hears a name before (or without) the ring moving there; the next arrow continues from the latest request until the consumer draws a selection of its own. `onOpenTerritoryChange?: (id: string | null) => void` reports the open territory: the one, not dimmed, whose shape holds the box centre while the regime is near (the innermost when they nest), `null` otherwise, fired only on a change.

On a phone, two fingers pinch-zoom about their midpoint and pan together, a double tap zooms in one step about the tap, a two-finger tap zooms out one step, and a tap selects; a finger may drift up to 10 px and still tap (a tap on empty map clears the selection once the double-tap window has passed, so a double tap never clears it, and only if nothing else selected an item meanwhile). Below a 600 px box the family names are drawn and fitted in `theme.territoryFonts.compact` (default `"700 14px system-ui, sans-serif"`) and every legend control is at least 44 px tall; when `insets` grow over the selected item (a sheet opening on top of it), the view moves at the same zoom to bring it back into the uncovered area.

`spec` must be referentially stable: a new object is a new corpus and refits the view, so build it once (state, `useMemo`, or a module constant) rather than inline.

`minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" }` (default off) adds a 160x110 canvas in a corner of the box, painting the territory shapes and the current view as a rectangle; pressing or dragging it centres the main view on the pressed world point, through the same coalesced, `onViewChange`-firing update a drag on the map itself uses. `true` picks the default corner, `"bottom-left"`; `MinimapCorner` is exported for the object form.

Cards are decorative. The overlay they live in is `aria-hidden` and `inert`, so nothing inside a card is focusable, in the tab order, or clickable on its own — a press released over a card fires `onSelect` with that node, and that is the whole interaction surface of a card. Interactive content belongs in the consumer's own UI, driven by `onSelect`.

`theme` restyles the point field and territory strokes, and the keyboard focus outline (`focusOutline`, `focusOutlineWidth`: the accessible tree is visually hidden, so the territory or item whose button has focus is outlined on the canvas; the default blue reaches at least 3:1 against a white or light-grey page, WCAG 2.2 SC 1.4.11); both the `Theme` type and the library's `DEFAULT_THEME` are exported from `corpus-map`, so a consumer can type a custom theme or start from the default and override individual fields.

`thresholds.midAt` and `thresholds.nearAt` are multiples of the fitted scale — the zoom at which the whole corpus fits the box — not absolute scale values, so `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 5 }` opens every corpus in the far regime regardless of its own extent, and reaching the mid or near regime only ever takes a 2x or 5x zoom-in from there.

`tuning?: Partial<Tuning>` overrides any of the numbers the literature does not settle without touching code — wheel sensitivity, trackpad pinch gain, the per-event zoom cap, the level-of-detail hysteresis and cross-fade band, territory boundary padding, label size cutoffs, hover radius. `Tuning` and `DEFAULT_TUNING` are exported, so a consumer (or a tuning panel) can start from the defaults and override individual fields the same way as `theme`.

At the near regime the most relevant items carry a compact label, painted on the canvas as an open tooltip beside the point: a higher `MapNode.priority` (finite, absent counts as 0) is labelled first, then the item with more edges, then the lower id. The text wraps at `tuning.itemLabelWidth` screen pixels (default 160) over at most `tuning.itemLabelLines` lines (default 3), the last ending in an ellipsis when the label runs longer, in `theme.itemLabelFont` (default `DEFAULT_ITEM_LABEL_FONT`, `"500 11px system-ui, sans-serif"`; its size in px, pt, em or rem, em and rem counting 16px). Labels are placed once per spec, after the territory names, so a label never covers a name or another label, the set shown depends only on the zoom, and a pan never makes one appear or vanish; the labels fade in across the near threshold's cross-fade band. Pressing a label selects its item, like pressing its point. With families, the mid and near regimes draw leaves only for the family that dominates the screen: each family gets a weight from its share of the largest family's on-screen items (`tuning.focusFloor`, default 0.5, and below it the family is drawn as a family; `tuning.focusFull`, default 1, and at or above it all its leaves), rising smoothly in between, so nothing pops on a pan. At the mid and near regimes, hovering the nearest point within `tuning.hoverRadius` screen pixels shows its label in a small tooltip, unless that point's label is drawn where it can be seen (on the canvas and not under the selected card).

Only the selected item gets a card, at the mid and near regimes while its point is inside the box and not under an `insets` side; the card fades in and out with the points. `cardSize?: { width: number; height: number }` (default `{ width: 160, height: 56 }`) sets the frame the library draws around it; `renderCard(node)` only fills its content. The card sits beside the selected point, on whichever of eight spots next to it, or eight further out, hides the fewest of the item's drawn edges and other points inside the box (`placeSelectedCard` is exported for a consumer laying out its own overlay); a card on the outer ring is joined to its point by a short leader line.

`cardSizeFor(spec, options?)` returns a `cardSize` fitted to the corpus's own labels, so cards neither waste space on short titles nor cut long ones: it takes the label width nine titles in ten fit (`percentile`, default 0.9), splits it over `titleLines` (default 2), clamps the frame to `[minimumWidth, maximumWidth]` (default 120–240 px, padding and the card's borders included) and makes the height hold those lines plus `extraLines` (a year, a subtitle); both sides count the library's card frame (a 4 px stripe and a 1 px border across, 1 px top and bottom), so the box `renderCard` draws in is the padded text column. Pass the `font`, `lineHeight` and `padding` your card renderer actually uses (defaults `"16px sans-serif"`, 1.25, 8) and clamp the title in the renderer to `titleLines` for the one label in ten that is longer; `measure` swaps the library's 0.6 em-per-character estimate for a real measurement. Invalid options throw a `RangeError` naming the option, a `padding` that leaves no text column at `maximumWidth` among them. If a card shows a different text than `node.label` (an element's name rather than its symbol, say), size it from a spec whose labels are that text: `cardSizeFor({ ...spec, nodes: spec.nodes.map((node) => ({ ...node, label: titleOf(node) })) })`.

`matches?: ReadonlySet<string> | readonly string[] | null` marks the items a search found: `undefined` or `null` means no search is active, an empty set dims everything, and otherwise the other items are dimmed and the matches are drawn with a ring, composing with `hiddenTerritories` (a dimmed territory stays dimmed). The map never moves by itself when `matches` changes; `revealAll(ids)` on the `CorpusMapHandle` fits the view around the matches still on the map, inside `insets`, with the scale clamped to the map's zoom range (a single match is centred as close as that range allows). The item labels and the accessible tree follow the matches, and the tree's buttons carry `aria-description="match"`, so a keyboard or screen-reader user reads the same result.

`corpus-map/search` is a separate entry (its own file, about 3.9 kB gzipped, so a consumer of the map alone pays nothing) with `SearchBox`: `<SearchBox spec={spec} onMatches={setMatches} onGo={(id) => handle.current?.reveal(id)} onShow={() => handle.current?.revealAll(matches ?? [])} />`. It debounces the query, runs a local, accent- and case-folding search over each item's label and `meta` in the browser unless you pass `search: (query) => ids | Promise<ids>` (a server, a worker, a vector index), ranks the results (`rank`: `"connections"`, the default, puts the items with the most edges first; `"alphabetical"`; or a function `(item, { connections }) => score`, highest first; ties are always alphabetical) and hands `onMatches` the ids best first. A `search` that returns plain ids keeps the order it ranked them in; one that returns `{ id, score }` entries is sorted by score. The results are listed under the box (the first 50, then "and N more") as a combobox: arrows move, and Enter or a click calls `onGo(id)` for that result, which centres the map on it (the first result on Enter without an arrow); typing never moves the view. It keeps only the newest answer, announces the count in a `role="status"` ("12 results", "No results", "Search failed"), clears on Escape, the clear button or a new `spec`, and shows a "Show on map" button when `onShow` is given. Its inline styles inherit the page's colour and font; `touchTargets` gives every control a 44 px target.

### Dialogue with an AI

`corpus-map/assistant` is a third separate entry with `AssistantBox`, a lean dialogue box: `<AssistantBox spec={spec} ask={ask} selectedId={selectedId} view={view} onMatches={setMatches} onReveal={(ids) => handle.current?.revealAll(ids)} onRestore={(view) => handle.current?.setView(view)} onSelect={select} />`. The AI is yours: `ask(request, signal)` receives `{ question, selectedId, history }` and returns a promise of a whole `{ text, ids }` (no streaming, no key or server in the library). Cited ids the spec does not know are dropped. When an answer cites items they are highlighted through `onMatches`, and they are framed once through `onReveal`, but only if the `view` you pass in is still the one the reader had when asking, and then a "Back to previous view" button calls `onRestore` with that view; a reader who panned meanwhile is never moved. `view` is what `onViewportChange` reported (or `handle.getView()` for the first fit, which is never reported). A newer question aborts the older, a new `spec` clears the dialogue, and a rejected `ask` shows "Assistant failed". Pass `notice` to say on screen that the answers are not an AI, as the demo does.

### Filter by attribute

`corpus-map/filter` is a fourth separate entry (its own file, about 2 kB gzipped; the map alone pays nothing) with `FilterBox`, a checkbox filter over any `meta` attribute: define the attribute once, outside your component, `const kind: FilterAttribute = (node) => (node.meta as { kind?: string } | undefined)?.kind;` (`meta` is `unknown`, so you narrow it), then render `<FilterBox spec={spec} attribute={kind} onMatches={setFilterMatches} />`. `attribute` returns a value, a list of values, or `{ value, label }` (a bare string is both), and must be a stable reference: an arrow written inline in the render is a new function every time, and the facets are computed again. The box lists every value with its item count, several at once (any of them passes), and reports the ids that pass through `onMatches`, or `null` while nothing is selected; hand that to `CorpusMap`'s `matches` and what it excludes is dimmed, never removed. To combine it with a search or an assistant answer, pass `intersectMatches(searchIds, filterIds)` (`null` is "no constraint"). A new `spec` clears the selection. `facetsOf(spec, attribute)` and `idsMatching(spec, attribute, selected)` are the pure pieces, for a UI of your own.

### Keyboard and screen readers

- Tab reaches the map surface, a named region (`label`, default "Map of N items"). While it has focus, the arrow keys pan by a tenth of the box (Shift: half), `+`/`=` and `-` zoom, `0` or `Home` fits the whole corpus, and `Esc` zooms out one level of detail. When the keys settle, the number of items on screen is announced once.
- `Enter` or `Space` with nothing selected selects the item nearest the centre of the map, zooming in to the near level first when the points are not drawn. While an item is selected, the arrows walk to the nearest item in that direction instead of panning, and each step speaks the item's name and territory ("No item to the right" at an edge); `Shift` + arrows pan by a tenth of the box, the view follows only when the item nears the edge of the uncovered area, and `Esc` clears the selection, giving the arrows back to panning.
- While the map has focus it also captures `Ctrl`/`Cmd` + `+`/`-` as map zoom, so a reader who relies on browser zoom moves focus off the map first.
- The canvas is decorative; the content is a visually hidden accessible tree right after the surface. Far out it lists the territories under their group headings, then "Unassigned" (the items with no territory); inside a territory it leads with "Back to overview", then the on-screen items under their territory's heading. Focus never falls to the page when the tree changes under it. The legend's group headers are headings too.
- `headingLevel` (2–6, default 3) sets the level of every heading the map renders; pick the one that fits your page's outline. The ref handle's `focus()` moves focus to the map surface.

## The demo

Run `npm run dev` to open the demo — a full-window showcase, not a component preview: the map fills the browser window (`CorpusMap` with no `width`/`height`, filling its parent), a top bar picks the corpus, a bottom-left minimap and indicator (`regime · ratio× · N items`, read straight from `onViewChange`) sit above it, bottom-right zoom controls drive the map's own `CorpusMapHandle` ("Zoom in", "Zoom out", "Fit"), and a footer shows a data-source disclosure for the corpora that need one. Selecting a node opens a drawer with its label and territory — for arXiv, also its publication year, its arXiv category and a link to the paper's abstract page; every other corpus gets a generic field list from its `meta`. When the item has edges (arXiv ships papers similar across two categories), the drawer lists them under Related, each with the title words the two share, and pressing one selects and reveals it. The URL hash carries the corpus, the view and the selection (`#corpus=arxiv&view=x,y,zoom&selected=id`, written through a debounced `replaceState`), so a link reopens where it was saved; "Copy link" in the top bar copies it. "Ask AI" opens the dialogue panel, collapsed until pressed; its answers come from the local search and say so in a notice (they are not from an AI).

The gallery ships four corpora, arXiv first and selected by default: "Computer-science papers (arXiv metadata)" (real-world, ~8,000 papers, fetched lazily from `demo/corpora/arxiv.json`, which the build emits as its own asset, so its ~1.5 MB never blocks the shell's first paint and a failed load can be retried without reloading the page; the footer credits it verbatim, "Thank you to arXiv for use of its open access interoperability."; built by the separate package under [pipeline/arxiv/](pipeline/arxiv/README.md); its territories are the map's own clusters, 18 named topics in 5 families, named by Claude and held to a blind test, with each paper's arXiv category on its card and in the drawer), "Chemical elements", "Constellations" (bright stars grouped by constellation), and "Synthetic (5,000 items)" (the count in its label follows the tuning panel's size control; footer: "Synthetic corpus, generated for scale testing.") — deliberately not food: a map spec validated by a single domain would be an unverified abstraction, and these four are unrelated enough to show that the spec and the `renderCard` extension point are genuinely domain-agnostic.

Press `t` (ignored while typing in a field, or with Ctrl/Cmd/Alt held) to open a hidden tuning panel: one range input per `Tuning` field, the two LOD thresholds, the card frame size, and — for the synthetic corpus — its size and seed, every value validated through the library's own exported `resolveTuning`/`resolveThresholds` before it ever reaches the map, with the thrown `RangeError` message shown inline on an invalid combination. The same panel holds a wheel-event capture: a read-only, passive listener on the map container recording the last 50 wheel events (`deltaY`, `deltaMode`, `ctrlKey`, milliseconds since the previous one) with a "Copy" button, for reading what a trackpad or mouse actually sends, so the library's tuning defaults (taken from d3-zoom and MapLibre, see `src/shared/tuning.ts`) can be checked against real devices. The panel and the selected-item drawer share the same right-hand slot and are mutually exclusive (opening one closes the other), and the zoom controls shift left to clear whichever is open wherever there is room, or are covered by it — reversibly, one tap or Escape — on narrower viewports.

During development the demo consumes the library through a Vite alias to `src/`, not the built package; what proves the built package is usable is CI, which runs `npm run build` and checks that the emitted `dist/index.d.ts` exists where `package.json` says it does.

## Guarantees

- **Canvas 2D baseline, no WebGPU required.** The point field renders on Canvas 2D; nothing in this library ever requires WebGPU or WebGL to run.
- **Keyboard and screen-reader reachable, and audited.** Every zoom level is mirrored by a visually hidden, always-present accessible tree with a live region announcing the current regime: territories under their group headings and an "Unassigned" control at the far and mid regimes, "Back to overview" and the on-screen items, capped, at the near regime. The focused map surface pans, zooms, fits, zooms out and walks from item to spatial neighbour from the keyboard, so a reader can open one territory, leave it and open another; a test walks exactly that. The focused territory or item is outlined on the canvas. An axe audit, canaried with injected defects, runs over the map's states and the demo in the suite; contrast is checked in a browser with Lighthouse; the spoken experience has not been checked with a real screen reader yet (see [Keyboard and screen readers](#keyboard-and-screen-readers)).

## Performance

The benchmark in `bench/field.test.ts` (run via `npm run bench`) measures only the CPU cost of the `paint` function writing into an in-memory `RecordingSurface`, not real `<canvas>` rasterisation in a browser — it is a regression gate on the painter's own logic, not a claim about real-world frame rate. No browser-measured frames-per-second figure is claimed yet.

## Credits

See [CREDITS.md](CREDITS.md) for the prior art this library builds on, and the licensing constraints that were respected while doing so.

This project is licensed under the [MIT License](LICENSE).
