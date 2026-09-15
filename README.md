🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml)

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

## Usage

```tsx
import { CorpusMap, type MapNode } from "corpus-map";

function renderCard(node: MapNode) {
  const meta = node.meta as { symbol: string; atomicNumber: number };
  return (
    <div>
      <strong>{node.label}</strong> ({meta.symbol}, #{meta.atomicNumber})
    </div>
  );
}

<CorpusMap spec={spec} renderCard={renderCard} width={960} height={640} />;
```

## The demo

Run `npm run dev` to open the demo viewer, which consumes the published library rather than its source. The gallery ships two corpora — periodic table elements and bright stars grouped by constellation — and neither is food, deliberately: a map spec validated by a single domain would be an unverified abstraction, and chemistry and astronomy are unrelated enough to show that the spec and the `renderCard` extension point are genuinely domain-agnostic.

## Guarantees

- **Canvas 2D baseline, no WebGPU required.** The point field renders on Canvas 2D; nothing in this library ever requires WebGPU or WebGL to run.
- **Keyboard and screen-reader navigable.** Every zoom level is mirrored by a visually hidden, always-present accessible tree, so the map can be fully explored without a mouse or a pointer.

## Performance

The benchmark in `bench/field.test.ts` (run via `npm run bench`) measures only the CPU cost of the `paint` function writing into an in-memory `RecordingSurface`, not real `<canvas>` rasterisation in a browser — it is a regression gate on the painter's own logic, not a claim about real-world frame rate. No browser-measured frames-per-second figure is claimed yet.

## Credits

See [CREDITS.md](CREDITS.md) for the prior art this library builds on, and the licensing constraints that were respected while doing so.

License: to be chosen before the repository goes public.
