# Credits

This library is a composition of ideas that already existed separately in other projects. Prior-art research (2026-09-13) examined thirteen libraries; the four below are the ones that directly shaped a design decision here, and each entry says exactly what was taken — an idea, or a license that permits reuse — and what was not.

No code was copied from any of the projects listed below. The concave/convex hull implementation in this repository (`src/territories/hull.ts`) is Andrew's monotone chain, written from the published algorithm, not adapted from any of these codebases.

## AntV G6 — MIT

Proof that concave hulls with contour-following labels are tractable in a browser-rendered map, and that HTML nodes layered over a canvas or SVG scene are a workable pattern. G6's territory rendering and its DOM-node overlay are the two primitives this project's point-field/card-overlay split is built on. License permits reading the source and reusing it with attribution; no code was reused, only the approach.

## Apple Embedding Atlas — MIT

Proof that hierarchical, zoom-dependent labeling of a large point field is a solved problem — the same "what you see changes with how far out you are" idea this library treats as its core mechanic. It is also the counter-example that shaped a non-goal here: Embedding Atlas requires WebGPU for its point rendering, and this library deliberately refuses that requirement, staying on a Canvas 2D baseline so it degrades gracefully instead of failing to run.

## DataMapPlot — MIT

Proof that alpha-shape (concave hull) territory boundaries computed from member points, rather than supplied by the producer, read as legible regions rather than noise. Confirms the map spec's rule that a `boundary` is optional and computable from `members` when the producer does not supply one.

## deepscatter — CC BY-NC-SA — no code used

deepscatter is licensed CC BY-NC-SA, which is non-commercial and viral: nothing from its codebase may be reused here under any circumstance, and none was. It is credited for one thing only — confirming that swapping the rendered representation of a point by zoom level ("label by zoom") is a solved, working idea, at the level of "this approach is viable," not at the level of any specific implementation detail. Idea-level inspiration and credit only.
