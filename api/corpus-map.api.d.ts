// CorpusMap.d.ts
import { type ReactElement, type ReactNode } from "react";
import { type LodThresholds, type Regime } from "./lod/lod";
import { type MapNode, type MapSpec } from "./shared/spec";
import { type Theme } from "./shared/theme";
export interface CorpusMapProps {
    spec: MapSpec;
    renderCard: (node: MapNode) => ReactNode;
    width: number;
    height: number;
    thresholds?: LodThresholds | undefined;
    cardCap?: number | undefined;
    theme?: Theme | undefined;
    onSelect?: ((node: MapNode) => void) | undefined;
    /** Fired once on mount with the initial regime, then on every change. */
    onRegimeChange?: ((regime: Regime) => void) | undefined;
}
export declare function CorpusMap(props: CorpusMapProps): ReactElement;

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
import { type Viewport } from "../viewport/viewport";
export interface CardOverlayProps {
    spec: MapSpec;
    viewport: Viewport;
    regime: Regime;
    cap: number;
    width: number;
    height: number;
    renderCard: (node: MapNode) => ReactNode;
}
export declare function CardOverlay({ spec, viewport, regime, cap, width, height, renderCard, }: CardOverlayProps): ReactElement | null;

// index.d.ts
export type { CorpusMapProps } from "./CorpusMap";
export { CorpusMap } from "./CorpusMap";
export type { LodThresholds, Regime } from "./lod/lod";
export type { MapNode, MapSpec, NodeState, Territory } from "./shared/spec";
export { SpecError, validateSpec } from "./shared/spec";
export type { Theme } from "./shared/theme";
export { DEFAULT_THEME } from "./shared/theme";

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
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintLabels(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void;

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
    /** The label is drawn when scale / fitScale >= activeFrom. */
    activeFrom: number;
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
 * (more members first, then id); each starts at the smallest ratio at which it
 * no longer overlaps any higher-priority label already visible there. A label,
 * once shown, stays shown on zoom in, never changes on pan, and the set shown
 * depends only on the current ratio.
 */
export declare function placeLabels(inputs: readonly LabelInput[], fonts: Record<LabelClass, string>, cut: {
    large: number;
    medium: number;
}, measure: Measure, fitScale: number): PlacedLabel[];
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

// lod/lod.d.ts
export type Regime = "far" | "mid" | "near";
export interface LodThresholds {
    midAt: number;
    nearAt: number;
}
export declare const DEFAULT_THRESHOLDS: LodThresholds;
export declare function regimeFor(scale: number, t: LodThresholds): Regime;

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

// points/paintPoints.d.ts
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintPoints(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void;

// shared/paint.d.ts
import type { Regime } from "../lod/lod";
import type { Viewport } from "../viewport/viewport";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";
/**
 * The single place that decides paint order: boundaries, then points, then
 * names, so a name is never covered by a mark or by a later territory's fill.
 */
export declare function paint(surface: Surface, spec: MapSpec, vp: Viewport, regime: Regime, theme: Theme): void;

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
    text(text: string, x: number, y: number, color: string, font: string): void;
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
    calls: Array<"clear" | "polygon" | "circle" | "text">;
    clear(): void;
    polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
    circle(id: string, x: number, y: number, r: number, fill: string): void;
    text(text: string, x: number, y: number, color: string, font: string): void;
}
export declare function canvasSurface(ctx: CanvasRenderingContext2D): Surface;

// shared/theme.d.ts
export interface Theme {
    territoryFill: string;
    territoryStroke: string;
    territoryLabel: string;
    territoryFont: string;
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

// territories/hull.d.ts
type Point = [number, number];
/**
 * Andrew's monotone chain. Sorting first is what makes the result independent
 * of input order, which the map depends on: the same members must always
 * produce the same boundary, or a recomputation silently redraws territories.
 */
export declare function hullOf(points: Point[]): Point[];
export {};

// territories/paintTerritories.d.ts
import type { MapNode, MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintTerritories(surface: Surface, spec: MapSpec, vp: Viewport, byId: ReadonlyMap<string, MapNode>, theme: Theme): void;

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
export declare function fitSpec(spec: MapSpec, width: number, height: number, padding: number): Viewport;

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
