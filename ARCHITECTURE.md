# Architecture

## 1. What lives where

Each feature owns a folder with its pure logic and its canvas painting together; a component or hook that needs React lives in the same folder. Tests sit next to the code they test (`labels/paintLabels.test.ts`), never in a separate tree.

| Folder / file | Holds |
|---|---|
| `viewport/` | `viewport.ts` (the `Viewport` transform: `toScreen`, `toWorld`, `panBy`, `zoomAt`, `zoomTo`), `fit.ts` (`worldBounds`, `fitSpec`, the padded fit-to-extent computation) and `wheel.ts` (`wheelZoomFactor`: a pure, `deltaMode`-normalised, `Tuning`-driven zoom factor per wheel event) |
| `lod/` | `lod.ts` (`Regime`, `LodThresholds`, `DEFAULT_THRESHOLDS`) and `regime.ts` (`regimeAt`, the hysteresis regime transition, and `fade`, the zoom-driven cross-fade) plus `visible.ts` (`visibleNodes`: on-screen filter plus the hard render cap) |
| `territories/` | `shape.ts` (`disksOutline`: concave, padded boundaries by marching squares over the union of member disks, plus `components`, `chaikin`, `spacing`, `extent`, `contains`, `ringArea`) and `paintTerritories.ts` (boundary fill and stroke, reading `Scene.shapes`) |
| `points/` | `paintPoints.ts` (the point-field circles) and `hover.ts` (`nearestWithin`: the pure nearest-point-in-radius hit test behind hover) |
| `labels/` | `placement.ts` (`placeLabels`: active-range priority placement after Been, Daiches and Yap 2006, plus `labelClasses`, `separationScale`, `estimateText`), `pole.ts` (`poleOfInaccessibility`: the label anchor, by quadtree refinement after Garcia-Castellanos and Lombardo 2007), `useMeasure.ts` (the canvas-`measureText` hook, with `estimateText`'s deterministic fallback under jsdom), `contrast.ts` (`parseColor`, `over`, `contrastRatio`: the WCAG contrast check behind metric 9) and `paintLabels.ts` (draws each placed name whose active range has started) |
| `cards/` | `layout.ts` (`layoutCards`: pure eight-candidate placement beside each anchor, with the nearest-card group fallback) and `CardOverlay.tsx` (the `inert`, `aria-hidden` HTML overlay that renders `renderCard` per placed card) |
| `a11y/` | `AccessibleTree.tsx` (the parallel DOM tree that makes the map keyboard- and screen-reader-navigable) |
| `shared/` | `spec.ts` (`MapNode`, `MapSpec`, `Territory`, `validateSpec`), `surface.ts` (`Surface` interface, `RecordingSurface` for tests, `canvasSurface` for the browser), `theme.ts` (`Theme`, `DEFAULT_THEME`), `tuning.ts` (`Tuning`, `DEFAULT_TUNING`, `resolveTuning`: every number the literature does not settle, validated and defaulted in one place), `scene.ts` (`Scene`, `buildScene`: see section 3) and `paint.ts` (the compositor, see section 3) |
| `CorpusMap.tsx` | The component: pointer and wheel handling, viewport and regime state, drives the canvas ref through `paint()` and renders `CardOverlay` and `AccessibleTree` alongside it |
| `index.ts` | The public door, see section 4 |

Outside `src/`: `fixtures/synthetic/generate.ts` is a seeded generator (`generateCorpus`) used by tests and the benchmark, never shipped; `scripts/` holds `api-guard.mjs` and `size.mjs`, the two gates described in sections 4 and 7.

## 2. The one rule: decisions are pure

A `.ts` file in `src/` that is not a hook (a file named `use*.ts`) may not import `react` or `react-dom`, and may not read `window` or `document` — it decides, it does not act. Components (`.tsx`) and hooks are the only places that touch React or the DOM, and they apply what the pure code already decided. The rule is enforced by ESLint's `no-restricted-imports` and `no-restricted-globals` in `eslint.config.js`, scoped to `src/**/*.ts` and excluding `use*.ts` and test files, and is proven by a canary: a plain pure file with `import React` or a bare `document` reference fails lint.

## 3. Scene and paint order

`shared/scene.ts`'s `buildScene` computes everything about a corpus that does not change with the viewport — territory boundary shapes (`territories/shape.ts`) and placed territory names (`labels/placement.ts`, anchored by `labels/pole.ts`) — once per spec, not once per frame. `CorpusMap` memoizes the resulting `Scene` on the primitive `tuning`/`theme` fields `buildScene` actually reads, not on the `tuning`/`theme` objects themselves (both are minted fresh on every render for an inline literal prop), so a scene rebuild — measured at 70-135ms on 10,000 items — only happens when a value it depends on actually changes. Per-frame values that a precomputed `Scene` cannot carry (the current regime, the fit ratio, the point layer's fade) travel separately as a small `Frame` object.

`shared/paint.ts` is the only place that orders drawing: territory boundaries, then points, then names, so a name is never covered by a mark or by a later territory's fill. A feature that wants to draw something adds its `paint*` function in its own folder and one call to it, in the right position, in the compositor — nothing else decides paint order, and nothing paints outside this function.

## 4. The public door

Only `src/index.ts` is the library's API; anything not re-exported from it, however public the file looks, is internal and may change without notice. `api/corpus-map.api.d.ts` is a committed snapshot of every `.d.ts` file `npm run build` produces, concatenated in sorted path order, and `npm run api:check` (run in CI) rebuilds and diffs against it — any difference, including one buried in a feature file `index.ts` only re-exports, fails the build. `npm run api:update` rebuilds and rewrites the snapshot, which then shows the change in the commit diff for review.

## 5. Testing each layer

Pure functions get plain unit tests, colocated with the function. Drawing functions are tested against `RecordingSurface`, which records every call into typed arrays (`polygons`, `circles`, `texts`) and an ordered `calls` log, so a test can assert both content and sequence. Components are tested with Testing Library in jsdom; jsdom has no canvas, so `test/setup.ts` stubs `HTMLCanvasElement.prototype.getContext` to return `null` (which `CorpusMap` already handles), and a test that needs to see what was drawn installs a fake 2D canvas context (`recordingContext` in `src/CorpusMap.test.tsx`) that records `fillText` calls in `HTMLCanvasElement.prototype.getContext`'s place. Performance is `npm run bench`, which runs the compositor against 10,000 items from the synthetic generator under its own Vitest config (`vitest.bench.config.ts`), outside the coverage-gated suite.

## 6. Adding a feature

1. Give it a folder under `src/`, named for the feature, not the file type.
2. Write the pure logic and its test first; keep it free of React and the DOM per section 2.
3. Add a `paint*` function and its line in `shared/paint.ts`, or a component that consumes the pure logic.
4. Export from `index.ts` only if it is meant to be public, then run `npm run api:update` and review the diff.
5. Add a changeset (`npx changeset`) describing the change for consumers.
6. Run the full gate locally before committing: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run api:check`, `npm run size`.

## 7. Why these tools

Biome formats everything and owns almost every lint rule, including its React/JSX ones (`useJsxKeyInIterable`, `noArrayIndexKey`, and the rest of its `react` domain); the only two Biome turns off are `correctness.useExhaustiveDependencies` and `correctness.useHookAtTopLevel`, in `biome.json`, because ESLint owns hooks. ESLint carries only `eslint-plugin-react-hooks` (rules of hooks, exhaustive deps, the render-purity rules) plus the pure/React boundary rule from section 2, nothing stylistic. ESLint parses TypeScript through Babel (`@babel/eslint-parser`, `@babel/preset-typescript`) rather than `typescript-eslint`, because TypeScript 7 no longer exposes a JavaScript compiler API and `typescript-eslint` cannot parse without one; the Babel parser's own ceiling is ESLint 9, which is why ESLint is pinned there.
