# Credits

This library is a composition of ideas that already existed separately in other projects, papers and public algorithms. Prior-art research (2026-09-13) examined thirteen libraries; the four below are the ones that directly shaped a design decision in the original renderer, and the map-feel work (2026-09-23) added four more sources for level of detail, labeling and card placement. Each entry says exactly what was taken — an idea, or a license that permits reuse — and what was not.

No code was copied from any of the projects, papers or algorithms listed below. The concave hull implementation in this repository — `src/territories/shape.ts` (marching squares plus Chaikin corner cutting, see below) — is written from published algorithms, not adapted from any of these codebases.

## AntV G6 — MIT

Proof that concave hulls with contour-following labels are tractable in a browser-rendered map, and that HTML nodes layered over a canvas or SVG scene are a workable pattern. G6's territory rendering and its DOM-node overlay are the two primitives this project's point-field/card-overlay split is built on. License permits reading the source and reusing it with attribution; no code was reused, only the approach.

## Apple Embedding Atlas — MIT

Proof that hierarchical, zoom-dependent labeling of a large point field is a solved problem — the same "what you see changes with how far out you are" idea this library treats as its core mechanic. It is also the counter-example that shaped a non-goal here: Embedding Atlas requires WebGPU for its point rendering, and this library deliberately refuses that requirement, staying on a Canvas 2D baseline so it degrades gracefully instead of failing to run.

## DataMapPlot — MIT

Proof that alpha-shape (concave hull) territory boundaries computed from member points, rather than supplied by the producer, read as legible regions rather than noise. Confirms the map spec's rule that a `boundary` is optional and computable from `members` when the producer does not supply one.

## deepscatter — CC BY-NC-SA — no code used

deepscatter is licensed CC BY-NC-SA, which is non-commercial and viral: nothing from its codebase may be reused here under any circumstance, and none was. It is credited for one thing only — confirming that swapping the rendered representation of a point by zoom level ("label by zoom") is a solved, working idea, at the level of "this approach is viable," not at the level of any specific implementation detail. Idea-level inspiration and credit only.

## Been, Daiches and Yap (2006) — "Dynamic Map Labeling" — paper, no code used

Source of the active-range label placement `src/labels/placement.ts`'s `placeLabels` implements: names are sorted by priority (member count, ties by id), and each is assigned the smallest scale ratio at which it no longer overlaps any higher-priority name already visible there. This gives, as a consequence of the ordering rather than a special case, no overlap at any ratio, no name that hides again once shown on zoom in, no change on pan, and the same set of visible names for the same view whatever path the viewport took to reach it. Written from the paper's definition; no code is published with it to copy.

## Garcia-Castellanos and Lombardo (2007) — "Poles of Inaccessibility: A Calculation Algorithm for the Remotest Places on Earth" — paper, no code used

Source of the pole-of-inaccessibility construction — the interior point of a polygon farthest from its own outline — that `src/labels/pole.ts`'s `poleOfInaccessibility` uses to anchor a territory's name, by grid/quadtree refinement, so the anchor lands inside the territory even for a concave or U-shaped boundary. This is also the idea behind Mapbox's `polylabel`; `poleOfInaccessibility` was written from the paper's own definition of the problem, not from `polylabel`'s source, and no code from either was copied.

## Christensen, Marks and Shieber (1995) — "An Empirical Study of Algorithms for Point-Feature Label Placement" — paper, no code used

Source of the fixed eight-candidate-position idiom (right, left, above, below, then the four diagonals, tried in that priority order, the first that fits and overlaps nothing already placed wins) that `src/cards/layout.ts`'s `layoutCards` uses to place a card beside its point. Written from the paper's description of candidate position sets for point-feature labels; no code used.

## Marching squares and Chaikin corner cutting — public algorithms, no code used

`src/territories/shape.ts`'s `disksOutline` extracts a territory's concave, padded boundary with marching squares over the signed distance to the union of disks around its members, then smooths the result with two passes of Chaikin corner cutting. Both are long-public, textbook algorithms with no single canonical implementation to attribute; written from their standard descriptions, not adapted from any specific codebase.
