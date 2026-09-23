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
export declare function AccessibleTree({
  spec,
  regime,
  viewport,
  width,
  height,
  cap,
  onFocusTerritory,
  onSelect,
}: AccessibleTreeProps): ReactElement;

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
export declare function CardOverlay({
  spec,
  viewport,
  regime,
  cap,
  width,
  height,
  renderCard,
}: CardOverlayProps): ReactElement | null;

// index.d.ts
export type { CorpusMapProps } from "./CorpusMap";
export { CorpusMap } from "./CorpusMap";
export type { LodThresholds, Regime } from "./lod/lod";
export type { MapNode, MapSpec, NodeState, Territory } from "./shared/spec";
export { SpecError, validateSpec } from "./shared/spec";
export type { Theme } from "./shared/theme";
export { DEFAULT_THEME } from "./shared/theme";

// labels/paintLabels.d.ts
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
export declare function paintLabels(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void;

// lod/lod.d.ts
export type Regime = "far" | "mid" | "near";
export interface LodThresholds {
  midAt: number;
  nearAt: number;
}
export declare const DEFAULT_THRESHOLDS: LodThresholds;
export declare function regimeFor(scale: number, t: LodThresholds): Regime;

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
export declare function visibleNodes(
  spec: MapSpec,
  viewport: Viewport,
  width: number,
  height: number,
  cap: number,
): MapNode[];

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
export declare class SpecError extends Error {}
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
export declare function paintTerritories(
  surface: Surface,
  spec: MapSpec,
  vp: Viewport,
  byId: ReadonlyMap<string, MapNode>,
  theme: Theme,
): void;

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
