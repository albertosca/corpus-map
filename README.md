🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml) ![gzip size](docs/badges/size.svg) [![Line coverage](https://raw.githubusercontent.com/albertosca/corpus-map/badges/coverage.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml)

# corpus-map

A React library that turns pre-computed coordinates into a zoomable map: zoomed out you see named territories, and zooming in opens them into their items.

## Install

```sh
npm install corpus-map
```

Requires React 18 or later.

![Zooming into the arXiv map from named territories to individual papers, then selecting one](docs/media/demo.gif)

**[Try the live demo](https://albertosca.github.io/corpus-map/)**: about 8,000 computer-science papers from arXiv.

## Quick start

```tsx
import { CorpusMap, validateSpec } from "corpus-map";

const spec = validateSpec({
  version: "1",
  territories: [{ id: "alkali", name: "Alkali metals", members: ["li"], centroid: [1, 2] }],
  nodes: [{ id: "li", label: "Lithium", x: 1, y: 2, territory: "alkali" }],
});

export function Map() {
  return <CorpusMap spec={spec} renderCard={(node) => <strong>{node.label}</strong>} width={960} height={640} />;
}
```

Build `spec` once, outside the render. Omit `width` and `height` and the map fills its parent.

## What you get

- **Zoom is the level of detail.** Far out, named territories (optionally grouped into families). Closer, their items, the most relevant labelled. A card for the selected one.
- **Any domain.** You supply coordinates, territories and a card renderer. The library never reads your `meta`.
- **Built for about 10,000 items** on Canvas 2D. No WebGPU or WebGL.
- **Keyboard and screen-reader reachable**, with an accessibility audit in the test suite.
- **Optional add-ons**, each its own entry point: search, attribute filter, a dialogue box for your own AI, and a theme checker.
- **Controllable**: view, selection and hidden territories can be driven from your own state. Touch gestures and a minimap are built in.

It is not a graph library. It computes no layout and runs no force simulation.

## Documentation

- [Concepts](docs/concepts.md): what it is, how it differs from its neighbours, the three layers.
- [The map spec](docs/map-spec.md): the data format, territories, families, edges.
- [Usage reference](docs/usage.md): every prop, the handle, viewport, selection, cards.
- [Add-ons](docs/addons.md): search, assistant, filter.
- [Styling](docs/styling.md): themes and the theme checker.
- [Accessibility](docs/accessibility.md): keys, screen readers, what is audited.
- [The demo](docs/demo.md): what it shows and how to run it.
- [Quality gates](docs/quality.md): coverage, size and API checks.
- [ARCHITECTURE.md](ARCHITECTURE.md): the code layout, for contributors.

## Status

- Accessibility is tested by machine (axe, Lighthouse) and by keyboard walk-through. A pass with a real screen reader (VoiceOver, NVDA) is still pending.
- No browser-measured frame rate is claimed. The benchmark measures painter CPU time only, see [Concepts](docs/concepts.md#performance).

## Credits and license

[CREDITS.md](CREDITS.md) lists the prior art this library builds on and the licensing constraints respected along the way.

Licensed under the [MIT License](LICENSE).
