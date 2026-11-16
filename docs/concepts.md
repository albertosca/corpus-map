# Concepts

## What it is

`corpus-map` renders pre-computed coordinates and named territories as a zoomable landscape. The zoom level is the level of abstraction:

- Far out you see named regions.
- Zoomed in, a region opens into its items, the most relevant labelled.

It is not a graph library. It runs no force simulation and computes no layout: it receives coordinates and territory names that someone else already produced.

The optional edges it draws are links between items the producer already placed. They are shown for the hovered and the selected item, and are never a layout input.

## Where it sits among its neighbours

Libraries exist that draw named territories with boundaries, that render rich DOM cards for individual items, and that scale to millions of points. Prior-art research over thirteen of them found none that treats the zoom level itself as the level of abstraction, swapping a territory for a card as the user zooms in. That composition, not any single piece, is what this library provides.

Each neighbour does its own piece better:

- **Apple's Embedding Atlas and deepscatter** scale to millions of points. This library is designed for about 10,000 items and stops there by choice. Embedding Atlas also labels a point field hierarchically by zoom, and deepscatter swaps a point's representation by zoom level.
- **AntV G6** draws concave hulls whose labels follow the contour, and layers HTML nodes over its scene.
- **React Flow** renders rich DOM cards.
- **DataMapPlot** computes alpha-shape territory boundaries from member points.

If one of those pieces alone is what you need, one of them is likely the better tool. [CREDITS.md](../CREDITS.md) says what the four that shaped a design decision taught this project.

## The three layers

| Layer | Technology | Responsibility |
|---|---|---|
| Point field | Canvas 2D, drawn imperatively outside the React tree | Territory boundaries, point marks, the pan/zoom transform |
| Card overlay | React DOM, positioned absolutely over the canvas | The selected item's card |
| Accessible tree | React DOM, visually hidden, always present | A keyboard- and screen-reader-navigable mirror of the current zoom level |

React never renders thousands of nodes directly. It renders the shell, the selected item's card and the accessible tree for the current level, while the canvas is repainted imperatively whenever the transform changes.

For the code layout and the paint order, see [ARCHITECTURE.md](../ARCHITECTURE.md).

## Guarantees

- **Canvas 2D baseline, no WebGPU required.** The point field renders on Canvas 2D. Nothing in this library requires WebGPU or WebGL to run.
- **Keyboard and screen-reader reachable.** See [Accessibility](accessibility.md) for what is mirrored, which keys do what, and how it is audited.
- **Bounded cost.** See [Performance](#performance) below.

## Performance

The benchmark in `bench/field.test.ts` (`npm run bench`) measures only the CPU cost of the `paint` function writing into an in-memory `RecordingSurface`. It does not measure real `<canvas>` rasterisation in a browser.

It is a regression gate on the painter's own logic, not a claim about real-world frame rate. No browser-measured frames-per-second figure is claimed yet.
