🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml) ![gzip size](docs/badges/size.svg)

Coverage thresholds of 90% lines / 85% branches are enforced inside the `test` job and the lcov report is published as a CI artifact on every run; a hosted coverage badge is deliberately absent until a coverage service (Codecov or similar) is connected.

## What it is

`corpus-map` is a React library that renders pre-computed coordinates and named territories as a zoomable landscape, where the zoom level is the level of abstraction — far out you see named regions, and as you zoom in a region opens into individual item cards. It is not a graph library: it draws no edges, runs no force simulation, and computes no layout — it receives coordinates and territory names that someone else already produced.

Libraries exist that draw named territories with boundaries, libraries exist that render rich DOM cards for individual items, and libraries exist that scale to millions of points, but prior-art research examining thirteen of them found none that treats the zoom level itself as the level of abstraction, swapping a territory for a card as the user zooms in. That composition — not any single piece — is what this library provides.

## The three layers

| Layer | Technology | Responsibility |
|---|---|---|
| Point field | Canvas 2D, drawn imperatively outside the React tree | Territory boundaries, point marks, the pan/zoom transform |
| Card overlay | React DOM, positioned absolutely over the canvas | Rich cards for the currently visible items only |
| Accessible tree | React DOM, visually hidden, always present | A keyboard- and screen-reader-navigable mirror of the current zoom level |

React never renders thousands of nodes directly: it renders the shell, the cards for the currently open territory, and the accessible tree for the current level, while the canvas is repainted imperatively whenever the transform changes.

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
      "boundary": [[10.0, -5.0], [14.2, -4.8]]  // optional
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
  ]
}
```

- `meta` is opaque: the renderer passes it straight through to the consumer-supplied card component and never reads inside it.
- `territory` may be `null`: a node with no territory is normal (for example, noise points from density-based clustering), not an error, and still renders.
- `boundary` is optional: when a territory has none, the renderer computes a hull from its members' coordinates; when present, the producer's boundary wins.
- Membership is declared twice and must agree: every node with a `territory` is listed in that territory's `members`, and every member's node points back at that territory. `validateSpec` rejects a spec where the two disagree, naming the path.
- **Territory identity must bind to the centroid or to the member set, never to a cluster index.** Clustering with the same input and a different seed returns the same partition under different integer labels, so a producer that names territories by cluster number silently renames them on every recomputation and the map the user learned stops existing.

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

Changing `spec`, `width` or `height` refits the viewport to the new extent; no `key=` remount is needed. `onRegimeChange` fires once on mount with the initial regime (`"far"`, `"mid"` or `"near"`, the `Regime` type is exported) and again on every crossing, so a consumer can, for example, show a legend only at the far regime.

Cards are decorative. The overlay they live in is `aria-hidden` and `inert`, so nothing inside a card is focusable, in the tab order, or clickable on its own — a press released over a card fires `onSelect` with that node, and that is the whole interaction surface of a card. Interactive content belongs in the consumer's own UI, driven by `onSelect`.

`theme` restyles the point field and territory strokes; both the `Theme` type and the library's `DEFAULT_THEME` are exported from `corpus-map`, so a consumer can type a custom theme or start from the default and override individual fields.

`thresholds.midAt` and `thresholds.nearAt` are multiples of the fitted scale — the zoom at which the whole corpus fits the box — not absolute scale values, so `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 6 }` opens every corpus in the far regime regardless of its own extent, and reaching the mid or near regime only ever takes a 2x or 6x zoom-in from there.

`tuning?: Partial<Tuning>` overrides any of the numbers the literature does not settle without touching code — wheel sensitivity, trackpad pinch gain, the per-event zoom cap, the level-of-detail hysteresis and cross-fade band, territory boundary padding, label size cutoffs, hover radius. `Tuning` and `DEFAULT_TUNING` are exported, so a consumer (or a tuning panel) can start from the defaults and override individual fields the same way as `theme`.

`cardSize?: { width: number; height: number }` (default `{ width: 160, height: 56 }`) sets the frame the library draws around each card; `renderCard` only fills its content. The library places that frame beside the node's point — trying eight candidate positions around it before falling back to grouping the node into the nearest already-placed card, shown with a "+ N" badge — so cards never hang off a point's corner or cover each other. At the mid and near regimes, hovering the nearest point within `tuning.hoverRadius` screen pixels shows its label in a small tooltip.

## The demo

Run `npm run dev` to open the demo viewer. During development it consumes the library through a Vite alias to `src/`, not the built package; what proves the built package is usable is CI, which runs `npm run build` and checks that the emitted `dist/index.d.ts` exists where `package.json` says it does. The gallery ships two corpora — periodic table elements and bright stars grouped by constellation — and neither is food, deliberately: a map spec validated by a single domain would be an unverified abstraction, and chemistry and astronomy are unrelated enough to show that the spec and the `renderCard` extension point are genuinely domain-agnostic. A third, real-world corpus built from live arXiv `cs.*` papers (`demo/corpora/arxiv.json`, checked by `demo/corpora/arxiv.test.ts` but not yet wired into the gallery) is built by the separate package under [pipeline/arxiv/](pipeline/arxiv/README.md).

## Guarantees

- **Canvas 2D baseline, no WebGPU required.** The point field renders on Canvas 2D; nothing in this library ever requires WebGPU or WebGL to run.
- **Keyboard and screen-reader reachable, with a known gap.** Every zoom level is mirrored by a visually hidden, always-present accessible tree with a live region announcing the current regime. What is reachable today: at the far and mid regimes, one button per territory (Enter zooms the map to it); at the near regime, one button per on-screen item, capped, and Enter selects it. Keyboard zoom-out and pan are not implemented yet, so once a territory is open the keyboard cannot leave it; see [BACKLOG.md](docs/superpowers/BACKLOG.md).

## Performance

The benchmark in `bench/field.test.ts` (run via `npm run bench`) measures only the CPU cost of the `paint` function writing into an in-memory `RecordingSurface`, not real `<canvas>` rasterisation in a browser — it is a regression gate on the painter's own logic, not a claim about real-world frame rate. No browser-measured frames-per-second figure is claimed yet.

## Credits

See [CREDITS.md](CREDITS.md) for the prior art this library builds on, and the licensing constraints that were respected while doing so.

This project is licensed under the [MIT License](LICENSE).
