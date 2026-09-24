// CorpusMap.d.ts
import { type ReactElement, type ReactNode, type Ref } from "react";
import { type LodThresholds, type Regime } from "./lod/lod";
import { type MapNode, type MapSpec } from "./shared/spec";
import { type Theme } from "./shared/theme";
import { type Tuning } from "./shared/tuning";
/** Imperative handle exposed through React 19's `ref`-as-prop (spec 4 §1). */
export interface CorpusMapHandle {
    /** One wheel notch's zoom-in factor about the box centre, clamped to the wheel band. */
    zoomIn(): void;
    /** One wheel notch's zoom-out factor about the box centre, clamped to the wheel band. */
    zoomOut(): void;
    /** Resets the viewport to the fitted view, the same reset a `spec` change applies. */
    fit(): void;
}
/** The payload `onViewChange` fires: the committed regime, the scale ratio to the fitted scale, and how many nodes are on screen (uncapped). */
export interface CorpusMapView {
    regime: Regime;
    ratio: number;
    visibleCount: number;
}
export interface CorpusMapProps {
    spec: MapSpec;
    renderCard: (node: MapNode) => ReactNode;
    /** React 19 ref-as-prop; see `CorpusMapHandle`. */
    ref?: Ref<CorpusMapHandle> | undefined;
    /**
     * When both `width` and `height` are given they win as the box's source —
     * no `ResizeObserver`, no waiting for a measurement, the map fits to them
     * immediately. Otherwise the root fills its parent (`100%`) and its size
     * comes from a `ResizeObserver` measurement instead, painting nothing
     * until the first one arrives. Either way, a later change to the box
     * (props changing, or a new measurement) keeps the current scale and
     * keeps the world point that was at the old box's centre at the new box's
     * centre — it does not refit. A new `spec` still refits. A consumer who
     * wants to refit after a box change calls `fit()` on the imperative
     * handle obtained through the `ref` prop above (`CorpusMapHandle`).
     * A box with zero width or height, from either source, counts as no box
     * yet: the map paints nothing and the first box with both sides positive
     * is the one it fits to.
     */
    width?: number | undefined;
    height?: number | undefined;
    thresholds?: LodThresholds | undefined;
    /** Every number the literature does not settle; see `DEFAULT_TUNING` for the source of each default. */
    tuning?: Partial<Tuning> | undefined;
    cardCap?: number | undefined;
    /** Card frame size, passed to `layoutCards`. Defaults to 160x56. */
    cardSize?: {
        width: number;
        height: number;
    } | undefined;
    theme?: Theme | undefined;
    onSelect?: ((node: MapNode) => void) | undefined;
    /** Fired once on mount with the initial regime, then on every change. */
    onRegimeChange?: ((regime: Regime) => void) | undefined;
    /**
     * Fired once on mount, then after any committed render whose regime,
     * ratio or visible-node count changed, and after every refit (a new
     * `spec`, or `fit()`) even when those values match — at most once per
     * animation frame during a drag, since drags are already coalesced into
     * one commit per frame (metric 13).
     */
    onViewChange?: ((view: CorpusMapView) => void) | undefined;
    /**
     * A 160 x 110 canvas in a corner of the box (default off), drawing the
     * territory shapes and the current view; pressing or dragging it centres
     * the main view on the pressed world point (spec 4 §1). `true` picks the
     * default corner, `"bottom-left"`.
     */
    minimap?: boolean | {
        corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    } | undefined;
}
/**
 * Renders `spec` as a canvas map with a card overlay and an accessible
 * parallel tree. The box comes from `width`/`height` when both are given,
 * else from measuring the parent (see the `width`/`height` doc). A box
 * change after the first keeps the current view — scale and centre — no
 * matter which source it came from; a new `spec` refits. To refit after a
 * box change, pass a `ref` (typed `CorpusMapHandle`) and call its `fit()`.
 */
export declare function CorpusMap({ ref, ...props }: CorpusMapProps): ReactElement;

// a11y/AccessibleTree.d.ts
import type { ReactElement } from "react";
import type { Regime } from "../lod/lod";
import type { MapNode, MapSpec, Territory } from "../shared/spec";
import type { Viewport } from "../viewport/viewport";
export interface AccessibleTreeProps {
    spec: MapSpec;
    regime: Regime;
    viewport: Viewport;
    width: number;
    height: number;
    cap: number;
    onFocusTerritory?: ((territory: Territory) => void) | undefined;
    onSelect?: ((node: MapNode) => void) | undefined;
}
/**
 * The canvas is decorative; this is the content. It mirrors the current
 * regime rather than the corpus, which is what keeps it bounded: ~10
 * territories at the far/mid regime, and at the near regime only the nodes
 * that are on screen, capped at `cap` — the same bound `CardOverlay` uses
 * for its cards. A corpus of ten thousand items never produces a tree of
 * ten thousand elements.
 */
export declare function AccessibleTree({ spec, regime, viewport, width, height, cap, onFocusTerritory, onSelect, }: AccessibleTreeProps): ReactElement;

// cards/CardOverlay.d.ts
import type { ReactElement, ReactNode } from "react";
import type { Regime } from "../lod/lod";
import type { MapNode, MapSpec } from "../shared/spec";
import { type Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** The library's own default card frame size, also `CorpusMap`'s default for `cardSize`. */
export declare const DEFAULT_CARD_SIZE: {
    width: number;
    height: number;
};
export interface CardOverlayProps {
    spec: MapSpec;
    viewport: Viewport;
    regime: Regime;
    cap: number;
    width: number;
    height: number;
    /** Frame size passed to `layoutCards`. Defaults to `DEFAULT_CARD_SIZE` (160x56). */
    cardSize?: {
        width: number;
        height: number;
    } | undefined;
    /** Zoom-driven fade for the whole overlay; the LOD cross-fade at the near threshold (Task 7 wires it in). */
    opacity?: number | undefined;
    theme?: Pick<Theme, "cardBackground" | "cardBorder"> | undefined;
    renderCard: (node: MapNode) => ReactNode;
}
export declare function CardOverlay({ spec, viewport, regime, cap, width, height, cardSize, opacity, theme, renderCard, }: CardOverlayProps): ReactElement | null;

// cards/layout.d.ts
export interface CardAnchor {
    id: string;
    x: number;
    y: number;
}
export interface PlacedCard {
    ids: string[];
    x: number;
    y: number;
}
/** Top-left corners of the eight candidates, in preference order: right, left, above, below, then the diagonals. */
export declare function candidates(x: number, y: number, w: number, h: number, gap: number): Array<[number, number]>;
/**
 * Place a card beside each anchor, in the first of eight candidate positions
 * that stays inside the box and overlaps no placed card (Christensen, Marks and
 * Shieber 1995). An anchor with no free candidate joins the placed card nearest
 * to it, which becomes a group card. If no card has been placed yet and the
 * anchor has no free candidate, place its card anyway, clamped to the box corner.
 * A card larger than the box is placed at the box's corner (0, 0).
 */
export declare function layoutCards(anchors: readonly CardAnchor[], size: {
    width: number;
    height: number;
}, box: {
    width: number;
    height: number;
}, gap?: number): PlacedCard[];

// index.d.ts
export type { CorpusMapHandle, CorpusMapProps, CorpusMapView } from "./CorpusMap";
export { CorpusMap } from "./CorpusMap";
export type { LodThresholds, Regime } from "./lod/lod";
export { DEFAULT_THRESHOLDS, resolveThresholds } from "./lod/lod";
export type { MinimapCorner } from "./minimap/Minimap";
export type { MapNode, MapSpec, NodeState, Territory } from "./shared/spec";
export { SpecError, validateSpec } from "./shared/spec";
export type { Theme } from "./shared/theme";
export { DEFAULT_THEME } from "./shared/theme";
export type { Tuning } from "./shared/tuning";
export { DEFAULT_TUNING, resolveTuning } from "./shared/tuning";

// labels/contrast.d.ts
type Rgba = [number, number, number, number];
/** Parses `rgba(r,g,b,a)`, `rgb(r,g,b)` and `#rrggbb` — the notations the theme uses. */
export declare function parseColor(color: string): Rgba;
/** `top` composited over an opaque `bottom`. */
export declare function over(top: Rgba, bottom: Rgba): Rgba;
/** WCAG 2.2 contrast ratio between two opaque colours. */
export declare function contrastRatio(a: Rgba, b: Rgba): number;
export {};

// labels/paintLabels.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** The canvas's CSS size, which every drawn name must fit inside. */
export interface LabelBox {
    width: number;
    height: number;
}
/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached and whose measured box lies whole inside the canvas.
 * A name that would cross the edge is skipped, not moved: skipping never
 * creates an overlap, and a name cut by the edge cannot be read anyway (a
 * long name on a phone-width fitted view appears once the user zooms in).
 */
export declare function paintLabels(surface: Surface, scene: Scene, vp: Viewport, theme: Theme, box: LabelBox): void;

// labels/placement.d.ts
import type { Point } from "../territories/shape";
export type LabelClass = "large" | "medium" | "small";
export interface LabelInput {
    id: string;
    name: string;
    anchor: Point;
    members: number;
}
export interface PlacedLabel {
    id: string;
    name: string;
    anchor: Point;
    labelClass: LabelClass;
    width: number;
    height: number;
    /**
     * Absolute scale units (`s_ij`, the same units as `Viewport.scale`, never
     * divided by `fitScale`): the label is drawn when `vp.scale >=
     * activeFromScale`. Keeping it absolute is what lets a resize — which only
     * changes `fitScale` — skip a scene rebuild.
     */
    activeFromScale: number;
}
export type Measure = (text: string, font: string) => {
    width: number;
    height: number;
};
export declare const LABEL_PADDING = 2;
/** Percentile rank in [0, 1] of each member count (ties share the lower rank). */
export declare function labelClasses(inputs: readonly LabelInput[], cut: {
    large: number;
    medium: number;
}): Map<string, LabelClass>;
/** Scale at which two label boxes, anchored `dx`,`dy` apart in world units, stop overlapping. */
export declare function separationScale(dx: number, dy: number, w: number, h: number): number;
/**
 * Active ranges after Been, Daiches and Yap (2006): labels in priority order
 * (more members first, then id); each starts at the smallest absolute scale
 * at which it no longer overlaps any higher-priority label already visible
 * there. A label, once shown, stays shown on zoom in, never changes on pan,
 * and the set shown depends only on the current scale.
 */
export declare function placeLabels(inputs: readonly LabelInput[], fonts: Record<LabelClass, string>, cut: {
    large: number;
    medium: number;
}, measure: Measure): PlacedLabel[];
/** Deterministic text measure for environments without a canvas (tests). */
export declare function estimateText(text: string, font: string): {
    width: number;
    height: number;
};

// labels/pole.d.ts
import type { Point, Ring } from "../territories/shape";
/** Distance from `p` to the ring's outline, positive inside and negative outside. */
export declare function signedDistance(p: Point, ring: Ring): number;
/**
 * The interior point farthest from the outline (pole of inaccessibility), by
 * quadtree refinement: Garcia-Castellanos and Lombardo (2007), the idea behind
 * Mapbox's polylabel. `precision` is in world units.
 */
export declare function poleOfInaccessibility(ring: Ring, precision: number): Point;

// labels/useMeasure.d.ts
import { type Measure } from "./placement";
/** Text measurement from an offscreen 2D canvas; the deterministic estimate where there is none (jsdom). */
export declare function useMeasure(): Measure;

// lod/lod.d.ts
export type Regime = "far" | "mid" | "near";
export interface LodThresholds {
    midAt: number;
    nearAt: number;
}
/** Multiples of the fitted scale (the zoom at which the whole corpus fits): every corpus opens in the far regime. */
export declare const DEFAULT_THRESHOLDS: LodThresholds;
/**
 * Validated, defaulted thresholds: both fields finite and in
 * `[0, MAX_RATIO]`, `midAt <= nearAt`. Unvalidated thresholds silently break
 * the LOD contract — `{ midAt: 6, nearAt: -1 }` opens "near" immediately,
 * `{ midAt: NaN, nearAt: NaN }` sticks at "far" forever (`regimeAt` treats a
 * non-finite ratio as far, and a NaN threshold makes every comparison
 * false), and a `nearAt` above the wheel zoom clamp is unreachable no matter
 * how far the user zooms in.
 */
export declare function resolveThresholds(input: LodThresholds | undefined): LodThresholds;

// lod/regime.d.ts
import type { LodThresholds, Regime } from "./lod";
/**
 * Regime for `ratio` = scale / fitted scale, with hysteresis: a finer regime
 * is entered at its threshold and left only once the ratio falls a fraction
 * `hysteresis` below it, so a zoom oscillating around a threshold does not
 * mount and unmount cards on every tick.
 */
export declare function regimeAt(rawRatio: number, t: LodThresholds, previous: Regime, hysteresis: number): Regime;
/**
 * Opacity of a layer that enters at `threshold`: 0 at the threshold, 1 at
 * threshold * (1 + band), linear between. A threshold of 0 or less means the
 * layer is always fully present.
 */
export declare function fade(ratio: number, threshold: number, band: number): number;

// lod/visible.d.ts
import type { MapNode, MapSpec } from "../shared/spec";
import { type Viewport } from "../viewport/viewport";
/**
 * Nodes whose screen position falls inside the viewport, in spec order,
 * capped. The cap is a hard rule, not a heuristic: it is what keeps the DOM
 * bounded regardless of corpus size or how far out the user zooms with a
 * dense territory open. Applied after the on-screen filter, so it only ever
 * trims what the user could actually see, not an arbitrary prefix of the
 * spec. Above the cap, the canvas alone carries the field.
 */
export declare function visibleNodes(spec: MapSpec, viewport: Viewport, width: number, height: number, cap: number): MapNode[];

// minimap/Minimap.d.ts
import { type ReactElement } from "react";
import type { Scene } from "../shared/scene";
import type { Theme } from "../shared/theme";
import type { Bounds } from "../viewport/fit";
/** The minimap is always this size (spec 4 §1): a 160 x 110 canvas. */
export declare const MINIMAP_SIZE: {
    width: number;
    height: number;
};
/** Where the minimap sits inside the map's box; `minimap={true}` picks the default, `"bottom-left"`. */
export type MinimapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
interface MinimapProps {
    scene: Scene;
    world: Bounds;
    view: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    corner: MinimapCorner;
    theme: Theme;
    /** Called with the world point under a press or drag on the minimap. */
    onPoint: (worldX: number, worldY: number) => void;
}
/**
 * The minimap's React half: a fixed-size canvas painted by the pure
 * `paintMinimap`, in a wrapper positioned in one of the box's corners. `aria-hidden`
 * (spec 4 §1 — the accessible tree already offers territory navigation);
 * every pointer handler calls `stopPropagation` so a press or drag here
 * never reaches the map surface underneath — it can neither start a pan nor
 * resolve a card click there, regardless of where in the box the minimap's
 * corner happens to sit.
 */
export declare function Minimap({ scene, world, view, corner, theme, onPoint }: MinimapProps): ReactElement;
export {};

// minimap/paintMinimap.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Bounds } from "../viewport/fit";
import { type Viewport } from "../viewport/viewport";
/**
 * Fits `world` into `size`, centred, through the same shared `fitBounds`
 * `fitSpec` itself is built on (fix round 1, finding 3 — this used to be a
 * private copy of that same padded-fit arithmetic). Kept as its own,
 * `size`-shaped wrapper (rather than inlining `fitBounds` at each call site)
 * so `Minimap.tsx` still has one name to invert (`toWorld`) for a
 * press/drag's world point, and so this file's own tests keep asserting
 * against the transform `paintMinimap` actually paints with, by name.
 */
export declare function minimapFit(world: Bounds, size: {
    width: number;
    height: number;
}): Viewport;
/**
 * Pure paint for the minimap (spec 4 §1): `surface.clear()` first, like
 * `shared/paint.ts`'s own compositor — this canvas is repainted in place
 * (`Minimap.tsx`'s DPR guard deliberately skips reassigning `canvas.width`
 * when the byte size hasn't changed, precisely to avoid the implicit clear
 * that would trigger, so nothing else erases the bitmap between paints);
 * then every territory ring — one polygon per ring, summed across
 * territories, not one per territory — fitted to `size` from `world` and
 * left unclipped (a ring padded slightly past the node extent still reads
 * fine a few pixels past the fitted box); then the current view's world
 * rectangle as a stroked polygon, clamped to `size`'s edges *as a rectangle*
 * — the screen-space box's two diagonal corners are each clamped once, and
 * all four drawn corners are built from those two clamped points, rather
 * than clamping each of the four corners independently (fix round 1,
 * finding 4) — so a view that overflows on some sides but not others still
 * comes out a proper axis-aligned box instead of four separately-placed
 * points that could, for a transform this code doesn't happen to use today
 * (any shear or rotation), stop agreeing with each other.
 */
export declare function paintMinimap(surface: Surface, scene: Scene, world: Bounds, view: {
    x: number;
    y: number;
    w: number;
    h: number;
}, size: {
    width: number;
    height: number;
}, theme: Theme): void;

// points/hover.d.ts
export interface ScreenPoint {
    id: string;
    x: number;
    y: number;
}
/** The point nearest to (x, y) within `radius` pixels, or null. Ties go to the earlier point. */
export declare function nearestWithin(points: readonly ScreenPoint[], x: number, y: number, radius: number): ScreenPoint | null;

// points/paintPoints.d.ts
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintPoints(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void;

// shared/paint.d.ts
import type { Regime } from "../lod/lod";
import type { Viewport } from "../viewport/viewport";
import type { Scene } from "./scene";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";
/**
 * Per-frame values a precomputed `Scene` does not carry: the regime, the
 * point layer's fade, and the canvas's CSS size (a name whose box would
 * cross its edge is skipped, see `paintLabels`). No ratio here — a placed
 * name carries its own absolute `activeFromScale` (see
 * `labels/placement.ts`), so `paintLabels` reads `vp.scale` directly
 * instead of a fit-relative ratio threaded through the frame.
 */
export interface Frame {
    regime: Regime;
    pointAlpha: number;
    width: number;
    height: number;
}
/**
 * The single place that decides paint order: boundaries, then points, then
 * names, so a name is never covered by a mark or by a later territory's fill.
 */
export declare function paint(surface: Surface, scene: Scene, spec: MapSpec, vp: Viewport, frame: Frame, theme: Theme): void;

// shared/scene.d.ts
import { type Measure, type PlacedLabel } from "../labels/placement";
import { type Ring } from "../territories/shape";
import type { MapNode, MapSpec } from "./spec";
import type { Theme } from "./theme";
import type { Tuning } from "./tuning";
/** Everything about a corpus that does not change with the viewport: computed once per spec. */
export interface Scene {
    byId: ReadonlyMap<string, MapNode>;
    shapes: ReadonlyMap<string, Ring[]>;
    labels: readonly PlacedLabel[];
}
/**
 * Only the fields this function actually reads, not the full `Tuning`/`Theme`
 * — so a caller can memoize its own call on just those primitive values
 * (e.g. `CorpusMap`, where `tuning`/`theme` objects are minted fresh on
 * every render for an inline literal prop) without depending on unstable
 * whole-object identity for fields it never uses.
 */
export declare function buildScene(spec: MapSpec, tuning: Pick<Tuning, "hullPadding" | "labelClasses">, theme: Pick<Theme, "territoryFonts">, measure: Measure): Scene;

// shared/spec.d.ts
export type NodeState = "visited" | "unvisited";
export interface MapNode {
    id: string;
    label: string;
    x: number;
    y: number;
    territory: string | null;
    state?: NodeState;
    badges?: string[];
    meta?: unknown;
}
export interface Territory {
    id: string;
    name: string;
    members: string[];
    centroid: [number, number];
    boundary?: Array<[number, number]>;
}
export interface MapSpec {
    version: "1";
    territories: Territory[];
    nodes: MapNode[];
}
export declare class SpecError extends Error {
}
/**
 * The validator is the contract: everything the renderer relies on is
 * checked here, and nothing else in the library defends against a malformed
 * spec. Membership is checked in both directions — a node that claims a
 * territory must be listed in it, and a listed member must claim it — so the
 * painter (which walks `members`) and the tree (which walks `territory`)
 * agree on which nodes a territory holds. `meta` is never read.
 */
export declare function validateSpec(input: unknown): MapSpec;

// shared/surface.d.ts
export interface Surface {
    clear(): void;
    polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
    circle(id: string, x: number, y: number, r: number, fill: string): void;
    /** Draws `text` centred on (x, y). */
    text(text: string, x: number, y: number, color: string, font: string): void;
    /** Sets the alpha applied to every draw call until the next `globalAlpha` call. */
    globalAlpha(alpha: number): void;
}
export declare class RecordingSurface implements Surface {
    cleared: number;
    polygons: Array<{
        points: Array<[number, number]>;
        fill: string;
        stroke: string;
    }>;
    circles: Array<{
        id: string;
        x: number;
        y: number;
        r: number;
        fill: string;
    }>;
    texts: Array<{
        text: string;
        x: number;
        y: number;
        color: string;
        font: string;
    }>;
    alphas: number[];
    calls: Array<"clear" | "polygon" | "circle" | "text" | "alpha">;
    clear(): void;
    polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
    circle(id: string, x: number, y: number, r: number, fill: string): void;
    text(text: string, x: number, y: number, color: string, font: string): void;
    globalAlpha(alpha: number): void;
}
export declare function canvasSurface(ctx: CanvasRenderingContext2D): Surface;

// shared/theme.d.ts
import type { LabelClass } from "../labels/placement";
export interface Theme {
    territoryFill: string;
    territoryStroke: string;
    territoryLabel: string;
    territoryFonts: Record<LabelClass, string>;
    cardBackground: string;
    cardBorder: string;
    hoverBackground: string;
    hoverText: string;
    visited: string;
    unvisited: string;
    pointRadius: number;
}
export declare const DEFAULT_THEME: Theme;

// shared/tuning.d.ts
/**
 * Every number the literature does not settle, in one place, so a tuning
 * panel can drive them without code changes. See the map-feel spec for the
 * source of each default.
 */
export interface Tuning {
    /** Scale factor per pixel of wheel `deltaY`: exp(-deltaY * wheelSensitivity). d3-zoom's default. */
    wheelSensitivity: number;
    /** Extra gain for trackpad pinch, which browsers deliver as a wheel event with `ctrlKey`. */
    pinchGain: number;
    /** Largest zoom factor a single wheel event may apply (MapLibre caps at 2). */
    maxZoomPerEvent: number;
    /** Fraction below a threshold the ratio must fall before a regime is left. */
    hysteresis: number;
    /** Fraction above a threshold over which the entering layer fades from 0 to 1. */
    fadeBand: number;
    /** Boundary disk radius, in units of the 90th percentile of a territory's nearest-neighbour distances. */
    hullPadding: number;
    /** Member-count percentiles at or above which a territory name is large or medium. */
    labelClasses: {
        large: number;
        medium: number;
    };
    /** Screen-pixel radius within which hovering picks the nearest point (a 24 px target, WCAG 2.5.8). */
    hoverRadius: number;
}
export declare const DEFAULT_TUNING: Tuning;
export declare function resolveTuning(partial: Partial<Tuning> | undefined): Tuning;

// territories/paintTerritories.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintTerritories(surface: Surface, scene: Scene, vp: Viewport, theme: Theme): void;

// territories/shape.d.ts
export type Point = [number, number];
export type Ring = Point[];
/**
 * The `quantile` of the distances from each point to its nearest neighbour; 0
 * for fewer than two points. The boundary radius is set from the 90th
 * percentile, not the median: it must bridge a territory's sparse stretches,
 * or the outline breaks into islands (measured on the synthetic corpus: the
 * median split 18 of 30 territories, the 90th percentile none).
 */
export declare function spacing(points: readonly Point[], quantile?: number): number;
export declare function extent(points: readonly Point[]): number;
/**
 * Outer rings of the union of disks of radius `r` around `points`, by
 * marching squares over the signed distance to the union. Holes are dropped:
 * a territory is drawn as regions, not as regions with gaps.
 */
export declare function disksOutline(points: readonly Point[], r: number): Ring[];
/**
 * Groups of points whose disks of radius `link / 2` touch, by union-find over
 * a grid of cell `link`. Outlining each group on its own grid keeps one far
 * outlier from stretching a shared grid until a dense cluster falls between
 * its vertices and disappears.
 */
export declare function components(points: readonly Point[], link: number): Point[][];
/** One pass of Chaikin corner cutting on a closed ring. */
export declare function chaikin(ring: Ring): Ring;
/** Even-odd point-in-polygon test. */
export declare function contains(ring: Ring, [x, y]: Point): boolean;
export declare function ringArea(ring: Ring): number;

// viewport/fit.d.ts
import type { MapSpec } from "../shared/spec";
import type { Viewport } from "./viewport";
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export declare function worldBounds(spec: MapSpec): Bounds;
/**
 * The padded-fit transform: `bounds` centred and scaled (one scale for both
 * axes) to fill a `width` x `height` box minus `padding` on every side.
 * Exported so a caller that already has a `Bounds` (the minimap's
 * `world`, not a `MapSpec` — `minimap/paintMinimap.ts`'s `minimapFit`) can
 * share this arithmetic instead of keeping a private copy of it (fix round
 * 1, finding 3). The `Math.max(1e-9, ...)` floor never changes `fitSpec`'s
 * own results — `worldBounds` already widens a degenerate box to at least 1
 * unit on each axis — but guards a caller that hands in a raw `Bounds` of
 * its own, not necessarily produced by `worldBounds`.
 */
export declare function fitBounds(bounds: Bounds, width: number, height: number, padding: number): Viewport;
export declare function fitSpec(spec: MapSpec, width: number, height: number, padding: number): Viewport;

// viewport/useElementSize.d.ts
import { type RefObject } from "react";
export interface ElementSize {
    width: number;
    height: number;
}
/**
 * The size of `ref`'s element, from a `ResizeObserver`; `null` until the
 * first observation. A report equal to the current size never calls
 * `setSize` at all, so no render is ever scheduled for it — checked against
 * `sizeRef`, not the `size` state variable, because a same-reference-
 * returning functional update is only an optimization, not a guarantee:
 * measured empirically while building this hook (against the CorpusMap
 * frame-coalescing test's own technique of counting Profiler commits, not
 * renders — a render-body counter would have missed it), React still
 * re-commits a second, separate dispatch of an identical value once a real
 * state change has already committed before it. `sizeRef` is written
 * synchronously in this same callback, right where `size` is decided, rather
 * than through a `[size]`-keyed effect like `CorpusMap`'s `hoverRef` (which
 * needs one, since `hover` there has more than one writer): `size` has
 * exactly one writer, this callback, so there is no other update this ref
 * could fall behind.
 */
export declare function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null;

// viewport/viewport.d.ts
export interface Viewport {
    scale: number;
    tx: number;
    ty: number;
}
export declare function toScreen(v: Viewport, wx: number, wy: number): [number, number];
export declare function toWorld(v: Viewport, sx: number, sy: number): [number, number];
export declare function panBy(v: Viewport, dx: number, dy: number): Viewport;
export declare function zoomAt(v: Viewport, sx: number, sy: number, factor: number): Viewport;
/**
 * Like `zoomAt`, but lands on `scale` exactly instead of on
 * `v.scale * (scale / v.scale)`, which can miss the target by a float ulp —
 * enough to fall on the wrong side of a regime threshold.
 */
export declare function zoomTo(v: Viewport, sx: number, sy: number, scale: number): Viewport;
/**
 * Clamps `scale` to `[fit / maxZoomOut, fit * maxZoomIn]`. Factored out of
 * the wheel handler so the imperative handle's `zoomIn`/`zoomOut` (showcase
 * Task 3) clamp to exactly the same band through the same code, rather than
 * a second copy of the arithmetic that could drift from it.
 */
export declare function clampScale(scale: number, fit: number, maxZoomOut: number, maxZoomIn: number): number;
/**
 * A box resize (showcase Task 2): keeps `scale` and keeps the world point
 * formerly at the old box's centre at the new box's centre, instead of
 * refitting — a spec change refits (via `fitSpec`); a box change alone does
 * not.
 */
export declare function recenterOnBoxChange(v: Viewport, oldWidth: number, oldHeight: number, newWidth: number, newHeight: number): Viewport;

// viewport/wheel.d.ts
import type { Tuning } from "../shared/tuning";
export interface WheelInput {
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
}
/**
 * Multiplicative zoom factor for one wheel event. Exponential in the delta,
 * so a scroll yields the same final scale whether it arrives as one event or
 * many (Guiard and Beaudouin-Lafon 2004: control the zoom index, not the
 * scale). `ctrlKey` marks a trackpad pinch. A single event is capped so a
 * large line- or page-mode notch cannot jump.
 */
export declare function wheelZoomFactor(e: WheelInput, t: Pick<Tuning, "wheelSensitivity" | "pinchGain" | "maxZoomPerEvent">): number;
