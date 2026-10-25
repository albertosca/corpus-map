// CorpusMap.d.ts
import { type ReactElement, type ReactNode, type Ref } from "react";
import { type HeadingLevel } from "./a11y/headingLevel";
import { type LodThresholds, type Regime } from "./lod/lod";
import { type MinimapCorner } from "./minimap/Minimap";
import { type Presentation, type PresentationSetting } from "./shared/presentation";
import { type MapNode, type MapSpec } from "./shared/spec";
import { type Theme } from "./shared/theme";
import { type Tuning } from "./shared/tuning";
import { type MapViewport, type ViewportChangeReason } from "./viewport/publicViewport";
/** Imperative handle exposed through React 19's `ref`-as-prop (spec 4 §1). */
export interface CorpusMapHandle {
    /** One wheel notch's zoom-in factor about the box centre, clamped to the wheel band. */
    zoomIn(): void;
    /** One wheel notch's zoom-out factor about the box centre, clamped to the wheel band. */
    zoomOut(): void;
    /** Resets the viewport to the fitted view, the same reset a `spec` change applies. */
    fit(): void;
    /** Focuses the map surface, so a consumer has an element to return focus to after a dialog (spec slice B §4). */
    focus(): void;
    /** Centres the view on an item at the current zoom, without selecting it (reason `"interaction"`); an unknown id does nothing (spec slice E §6). */
    reveal(id: string): void;
}
/** The payload `onViewChange` fires: the committed regime, the scale ratio to the fitted scale, how many nodes are on screen (uncapped), and the presentation in effect. */
export interface CorpusMapView {
    regime: Regime;
    ratio: number;
    visibleCount: number;
    presentation: Presentation;
}
export interface CorpusMapProps {
    /**
     * The corpus to draw. Keep it referentially stable (state, a memo, or a
     * module constant): a new object refits the view, so an inline
     * `spec={{ ... }}` literal resets the user's zoom and pan on every parent
     * render.
     */
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
    /** Present, even `null`, means controlled (spec slice C §3). An id whose node is dimmed or absent reads as no selection. */
    selectedId?: string | null | undefined;
    defaultSelectedId?: string | null | undefined;
    /** Fired only when the selected id changes, `null` included: a press on a point, a press on no point, Escape, a tree item. */
    onSelectedChange?: ((id: string | null) => void) | undefined;
    /** The territory, not dimmed, whose shape holds the box centre while the regime is near; `null` otherwise. Fired only on a change, starting from `null` (spec slice C §3). */
    onOpenTerritoryChange?: ((id: string | null) => void) | undefined;
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
     * Present means controlled: the map draws this view and only proposes
     * changes through `onViewportChange` (spec slice C §3). Invalid values
     * draw the fit; a zoom outside 1/8–64 of the fit is clamped.
     */
    viewport?: MapViewport | undefined;
    /** The initial view, for the first spec only; later specs refit. */
    defaultViewport?: MapViewport | undefined;
    /**
     * Fired in both modes for every real change: `"interaction"`, `"fit"`
     * (`fit()`, the fit key, Back to overview), `"spec"` (the fit a new spec
     * proposes) or, uncontrolled only, `"resize"` (a box change keeps the pixel
     * scale, so the zoom over the new fit moves; controlled, the public view
     * survives a box change and nothing fires). Never called during render.
     */
    onViewportChange?: ((viewport: MapViewport, details: {
        reason: ViewportChangeReason;
    }) => void) | undefined;
    /** The map surface's accessible name. Defaults to "Map of N items", also when blank. */
    label?: string | undefined;
    /** The level (2–6, default 3) of every heading the map renders, in the accessible tree and the legend; pick the one that fits the host page's outline. */
    headingLevel?: HeadingLevel | undefined;
    /**
     * `"auto"` (default) is guided at far and dense at mid and near; a fixed
     * value locks it. Never changes the LOD regimes, only emphasis (spec
     * slice D §4).
     */
    presentation?: PresentationSetting;
    /**
     * A 160 x 110 canvas in a corner of the box (default off), drawing the
     * territory shapes and the current view; pressing or dragging it centres
     * the main view on the pressed world point (spec 4 §1). `true` picks the
     * default corner, `"bottom-left"`.
     */
    minimap?: boolean | {
        corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    } | undefined;
    /**
     * Off by default; `true` puts it top-left. A DOM overlay listing the
     * largest territories, the point key and the gesture hint; it moves
     * clockwise when the minimap holds its corner.
     */
    legend?: boolean | {
        corner: MinimapCorner;
    };
    /**
     * Territory ids drawn faded (spec categories §5): their points take no
     * hover, card or selection and leave the accessible tree. Present means
     * controlled. Unknown ids are ignored, so a list saved against another
     * corpus never breaks the map.
     */
    hiddenTerritories?: readonly string[] | undefined;
    /** The initial faded ids when `hiddenTerritories` is absent. */
    defaultHiddenTerritories?: readonly string[] | undefined;
    /** Fired by every legend checkbox and "Show all", with the new sorted list. */
    onHiddenTerritoriesChange?: ((ids: string[]) => void) | undefined;
}
/**
 * Renders `spec` as a canvas map with a card overlay and an accessible
 * parallel tree. The box comes from `width`/`height` when both are given,
 * else from measuring the parent (see the `width`/`height` doc). A box
 * change after the first keeps the current view — scale and centre — no
 * matter which source it came from; a new `spec` refits. To refit after a
 * box change, pass a `ref` (typed `CorpusMapHandle`) and call its `fit()`.
 */
export declare function CorpusMap({ ref: handleReference, ...properties }: CorpusMapProps): ReactElement;

// a11y/AccessibleTree.d.ts
import type { ReactElement } from "react";
import type { RelatedItem } from "../edges/related";
import type { Regime } from "../lod/lod";
import { type MapNode, type MapSpec, type Territory } from "../shared/spec";
import { type Theme } from "../shared/theme";
import type { TerritoryGroup } from "../territories/groups";
import type { Viewport } from "../viewport/viewport";
import type { HeadingTag } from "./headingLevel";
export interface AccessibleTreeProps {
    spec: MapSpec;
    regime: Regime;
    viewport: Viewport;
    width: number;
    height: number;
    cap: number;
    /** The scene's territory groups; headings appear only when there are some (spec slice B §5). */
    groups?: readonly TerritoryGroup[] | undefined;
    /** Dimmed territory ids: left out of the tree. */
    hidden?: ReadonlySet<string> | undefined;
    heading?: HeadingTag | undefined;
    theme?: Pick<Theme, "cardBackground" | "territoryLabel" | "focusOutline" | "focusOutlineWidth"> | undefined;
    onFocusTerritory?: ((territory: Territory) => void) | undefined;
    onSelect?: ((node: MapNode) => void) | undefined;
    /** The selected item's id; its button carries `aria-current="true"` (spec slice C §5). */
    selectedId?: string | null | undefined;
    onOverview?: (() => void) | undefined;
    onUnassigned?: (() => void) | undefined;
    /** Called when a focused control unmounted and the new tree has none to take its place. */
    onFocusFallback?: (() => void) | undefined;
    /** Reports the id of the territory whose button gains keyboard focus, and `null` when it loses it. */
    onTerritoryFocusChange?: ((id: string | null) => void) | undefined;
    /** Reports the id of the item whose button gains keyboard focus (near regime), and `null` when it loses it. */
    onNodeFocusChange?: ((id: string | null) => void) | undefined;
    /** The selected item's live related items, listed at mid and near (spec slice E §6). */
    related?: readonly RelatedItem[] | undefined;
    /** Called when a related item's button is pressed. */
    onRelated?: ((node: MapNode) => void) | undefined;
}
/** "1 item", "N items": the corpus-agnostic count the tree and the territory balloon share. */
export declare function itemCount(count: number): string;
/**
 * The canvas is decorative; this is the content (spec slice B §5). It
 * mirrors the regime: at far and mid, territory buttons under their group
 * headings, then "Unassigned"; at near, "Back to overview" and the on-screen
 * items under their territory's heading, capped at `cap` overall — the
 * bound `CardOverlay` uses, so ten thousand items never make ten thousand
 * elements. Everything is visually hidden except the two controls with no
 * shape on the canvas, which show in the corner while focused.
 */
export declare function AccessibleTree(properties: AccessibleTreeProps): ReactElement;

// a11y/headingLevel.d.ts
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;
export type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";
export declare const DEFAULT_HEADING_LEVEL: HeadingLevel;
/**
 * The element every heading the library renders uses (spec slice B §5): the
 * host page owns the outline, so it picks the level. Validated like
 * `resolveThresholds`, because a JavaScript consumer is not held to the type.
 */
export declare function resolveHeadingLevel(input: number | undefined): HeadingTag;

// a11y/paintFocus.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/**
 * The visible half of keyboard focus: the accessible tree's buttons are
 * visually hidden (the canvas is decorative, the tree is the content), so the
 * territory or item whose button has focus is marked on the canvas instead.
 */
export declare function paintFocusedTerritory(surface: Surface, scene: Scene, viewport: Viewport, theme: Pick<Theme, "focusOutline" | "focusOutlineWidth">, id: string): void;
/** A ring around the focused item's point, one outline width clear of the point itself. */
export declare function paintFocusedNode(surface: Surface, scene: Scene, viewport: Viewport, theme: Pick<Theme, "focusOutline" | "focusOutlineWidth" | "pointRadius">, id: string): void;

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
/** The card frame's left edge in the node's territory colour, tying a card to its region (spec slice D §4). */
export declare const CARD_STRIPE_WIDTH = 4;
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
    theme?: Pick<Theme, "cardBackground" | "cardBorder" | "pointNeutral"> | undefined;
    /** Each territory's painted colour (`Scene.colours`); a card whose node has none gets `theme.pointNeutral`. */
    colours?: ReadonlyMap<string, string> | undefined;
    renderCard: (node: MapNode) => ReactNode;
}
export declare function CardOverlay({ spec, viewport, regime, cap, width, height, cardSize, opacity, theme, colours, renderCard, }: CardOverlayProps): ReactElement | null;

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
export declare function candidates(horizontal: number, vertical: number, width: number, height: number, gap: number): Array<[number, number]>;
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

// edges/EdgeMarkers.d.ts
import { type ReactElement } from "react";
import type { Theme } from "../shared/theme";
import { type EdgeMarker } from "./markers";
/**
 * The off-screen neighbour markers, above the cards. Hidden from assistive
 * technology (the related list carries the same items) and transparent to
 * the pointer: the surface resolves presses with `markerAt`.
 */
export declare const EdgeMarkers: import("react").MemoExoticComponent<({ markers, theme, }: {
    markers: readonly EdgeMarker[];
    theme: Pick<Theme, "hoverBackground" | "hoverText">;
}) => ReactElement | null>;

// edges/markers.d.ts
import type { Scene } from "../shared/scene";
import { type Viewport } from "../viewport/viewport";
/** A box at the edge of the map naming a drawn neighbour that lies off screen (spec slice E §6). */
export interface EdgeMarker {
    id: string;
    label: string;
    left: number;
    top: number;
    width: number;
    height: number;
}
export declare const MARKER_HEIGHT = 22;
export declare const MARKER_MAXIMUM_WIDTH = 160;
export declare const MARKER_FONT = "12px system-ui, sans-serif";
export declare const MARKER_GAP = 4;
/**
 * One marker per drawn edge of `id` whose neighbour is off screen, placed
 * inside the box against the edge the line leaves through, centred on where
 * it leaves; markers on one edge are pushed apart along it, and stack back
 * from the end when they run past it.
 */
export declare function edgeMarkers(scene: Pick<Scene, "related" | "byId">, viewport: Viewport, options: {
    id: string;
    width: number;
    height: number;
    cap: number;
    dimmed: ReadonlySet<string>;
}): EdgeMarker[];
/** The id of the topmost marker containing the box position, or null. */
export declare function markerAt(markers: readonly EdgeMarker[], horizontal: number, vertical: number): string | null;

// edges/paintEdges.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
import type { RelatedEdge } from "./related";
/** The part of the segment inside [0, width] × [0, height], or null when it misses the box (Liang–Barsky). */
export declare function clipToBox(segmentStart: [number, number], segmentEnd: [number, number], width: number, height: number): [[number, number], [number, number]] | null;
/** Line width of the ring drawn around each related item. */
export declare const NEIGHBOUR_RING_WIDTH = 1.5;
/** The edges drawn for `id`: the first `cap` whose neighbour is not in a dimmed territory. Shared with the markers. */
export declare function drawnEdges(scene: Pick<Scene, "related" | "byId">, id: string, cap: number, dimmed: ReadonlySet<string>): RelatedEdge[];
/**
 * The related layer of item `id` (spec slice E §6): one line per drawn edge,
 * `1 + 2 × weight / heaviest` px wide (2 px without weights), clipped to the
 * canvas, then a ring around each neighbour. Drawn at `alpha`, then the
 * point layer's `restoreAlpha` is put back.
 */
export declare function paintEdges(surface: Surface, scene: Pick<Scene, "related" | "byId" | "maximumEdgeWeight">, viewport: Viewport, theme: Pick<Theme, "edge" | "pointRadius" | "focusOutlineWidth">, options: {
    id: string;
    width: number;
    height: number;
    cap: number;
    dimmed: ReadonlySet<string>;
    alpha: number;
    restoreAlpha: number;
}): void;

// edges/related.d.ts
import type { MapNode, MapSpec } from "../shared/spec";
/** One end of an undirected edge, seen from the other end (spec slice E §6). */
export interface RelatedEdge {
    neighbour: string;
    weight: number | undefined;
    reason: string | undefined;
}
/** Every item's related items, both directions of each undirected edge, heaviest first, absent weights last, ties by id. */
export declare function buildRelated(spec: Pick<MapSpec, "edges">): Map<string, RelatedEdge[]>;
/** A related item with the edge's weight and reason, as the related list and `relatedItems` give it. */
export interface RelatedItem {
    node: MapNode;
    weight: number | undefined;
    reason: string | undefined;
}
/** `id`'s related items, heaviest first, absent weights last, then by id (spec slice E §6). */
export declare function relatedItems(spec: MapSpec, id: string): RelatedItem[];

// index.d.ts
export type { HeadingLevel } from "./a11y/headingLevel";
export type { CorpusMapHandle, CorpusMapProps, CorpusMapView } from "./CorpusMap";
export { CorpusMap } from "./CorpusMap";
export type { RelatedItem } from "./edges/related";
export { relatedItems } from "./edges/related";
export type { LodThresholds, Regime } from "./lod/lod";
export { DEFAULT_THRESHOLDS, resolveThresholds } from "./lod/lod";
export type { MinimapCorner } from "./minimap/Minimap";
export type { Presentation, PresentationSetting } from "./shared/presentation";
export type { MapEdge, MapNode, MapSpec, NodeState, Territory } from "./shared/spec";
export { SpecError, validateSpec } from "./shared/spec";
export type { Theme } from "./shared/theme";
export { DARK_THEME, DEFAULT_THEME } from "./shared/theme";
export type { Tuning } from "./shared/tuning";
export { DEFAULT_TUNING, resolveTuning } from "./shared/tuning";
export type { TerritoryGroup } from "./territories/groups";
export { deriveTerritoryGroups } from "./territories/groups";
export type { MapViewport, ViewportChangeReason } from "./viewport/publicViewport";

// labels/contrast.d.ts
export type Rgba = [number, number, number, number];
/**
 * True for exactly the notations `parseColor` reads, written strictly: no
 * surrounding whitespace, channels 0-255, alpha 0-1. `validateSpec` uses it
 * for `Territory.colour`, so a colour from the data never reaches the
 * canvas in a form the contrast checks cannot read.
 */
export declare function isSupportedColour(colour: string): boolean;
/** Parses `rgba(r,g,b,a)`, `rgb(r,g,b)` and `#rrggbb` — the notations the theme uses. */
export declare function parseColor(color: string): Rgba;
/** `top` composited over an opaque `bottom`. */
export declare function over(top: Rgba, bottom: Rgba): Rgba;
/** WCAG 2.2 contrast ratio between two opaque colours. */
export declare function contrastRatio(first: Rgba, second: Rgba): number;

// labels/paintLabels.d.ts
import { type Presentation } from "../shared/presentation";
import { type Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** The canvas's CSS size; a name larger than it is never drawn. */
export interface LabelBox {
    width: number;
    height: number;
    /** Absent means guided. */
    presentation?: Presentation | undefined;
    /** Group names' alpha (spec categories §4); territory names take the rest. Absent means 0. */
    groupAlpha?: number | undefined;
    /** Territory ids whose names are drawn at `DIMMED_ALPHA` (spec categories §5); absent means none. */
    dimmed?: ReadonlySet<string> | undefined;
}
/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached, except a name whose measured box is wider or taller
 * than the canvas: it could never be read whole anywhere on screen. Where a
 * name sits never enters the decision, so pan and zoom cannot make a name
 * pop out (map-feel metric 7).
 *
 * With groups, group names are drawn at `groupAlpha` and territory names at
 * the rest, so the two levels cross-fade; without groups `groupAlpha` is
 * ignored. In dense, medium and small territory names are drawn at
 * `DENSE_NAME_ALPHA`. Names are drawn brightest first (a stable sort keeps
 * the placement order within an alpha), `globalAlpha` is set only when it
 * changes and is left at 1, and a name at alpha 0 is not drawn at all. A
 * dimmed territory's name, and a group's name when every member is dimmed,
 * are drawn at `DIMMED_ALPHA` of their alpha, so after the others.
 */
export declare function paintLabels(surface: Surface, scene: Scene, viewport: Viewport, theme: Theme, box: LabelBox): void;

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
     * divided by `fitScale`): the label is drawn when `viewport.scale >=
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
/** Scale at which two label boxes, anchored `horizontalDelta`,`verticalDelta` apart in world units, stop overlapping. */
export declare function separationScale(horizontalDelta: number, verticalDelta: number, width: number, height: number): number;
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
/** Distance from `point` to the ring's outline, positive inside and negative outside. */
export declare function signedDistance(point: Point, ring: Ring): number;
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

// legend/Legend.d.ts
import { type ReactElement } from "react";
import type { HeadingTag } from "../a11y/headingLevel";
import { type Corner } from "../shared/corner";
import type { Presentation } from "../shared/presentation";
import type { Theme } from "../shared/theme";
import type { TerritoryGroup } from "../territories/groups";
import type { LegendEntry } from "./entries";
/** Opacity of a row whose territory is off screen; Legend.test.tsx pins 4.5:1 contrast in both themes. */
export declare const OFF_SCREEN_OPACITY = 0.75;
export interface LegendProps {
    entries: readonly LegendEntry[];
    groups: readonly TerritoryGroup[];
    onScreen: ReadonlySet<string>;
    hidden: ReadonlySet<string>;
    presentation: Presentation;
    corner: Corner;
    theme: Pick<Theme, "cardBackground" | "cardBorder" | "territoryLabel" | "pointNeutral">;
    /** The map's box is narrower than 480 px: start collapsed in every presentation (spec categories §6). */
    narrow: boolean;
    /** The element group disclosures sit in, so a screen reader can jump between groups (spec slice B §6). */
    heading?: HeadingTag | undefined;
    onEntry: (id: string) => void;
    onHiddenChange: (ids: string[]) => void;
}
/**
 * The map's legend (spec slice D §4, spec categories §6): real HTML, so a
 * screen reader reads it; expanded in guided, collapsed behind a "Legend"
 * toggle in dense or in a narrow box. The list is complete and filterable:
 * every territory, under its group when the scene has groups, on-screen rows
 * first. A row's checkbox hides or shows its territory, a group's checkbox
 * all of its members; a group with nothing on screen starts collapsed. A
 * toggle the reader pressed holds only until the presentation changes; an
 * entry press keeps the list open through the change its zoom causes. Every
 * pointer event stops here so a press on the legend never pans the map or
 * resolves a card click underneath.
 */
export declare function LegendView(properties: LegendProps): ReactElement;
export declare const Legend: import("react").MemoExoticComponent<typeof LegendView>;

// legend/entries.d.ts
import type { Corner } from "../shared/corner";
import type { Territory } from "../shared/spec";
export interface LegendEntry {
    id: string;
    name: string;
    colour: string;
    members: number;
}
/** Every territory, most members first (ties by id), each with its painted colour (spec categories §6). */
export declare function legendEntries(territories: readonly Territory[], colours: ReadonlyMap<string, string>, fallback: string): LegendEntry[];
/** The requested corner, or the next one clockwise when the minimap already sits there. */
export declare function legendCorner(requested: Corner, minimap: Corner | null): Corner;

// legend/model.d.ts
import type { TerritoryGroup } from "../territories/groups";
import type { LegendEntry } from "./entries";
/** The id of the single headerless group a corpus without groups is shown as. */
export declare const FLAT_GROUP_ID = "all";
export interface LegendRow extends LegendEntry {
    onScreen: boolean;
    hidden: boolean;
}
export interface LegendGroupView {
    id: string;
    name: string;
    /** The rows the filter lets through: on screen first, each part most members first. */
    rows: LegendRow[];
    /** Every member, filter or not: what the group checkbox acts on. */
    memberIds: string[];
    onScreenCount: number;
    /** Shown state of every member: drives the three-state group checkbox. */
    shown: "all" | "none" | "mixed";
}
/**
 * The legend's content (spec categories §6): groups in the given order, a
 * group kept only when a row survives the filter. The filter is a literal,
 * case-insensitive substring of a territory's name, its id or its group's
 * name; a match on the group's name keeps every member. Without groups the
 * whole list is one headerless group.
 */
export declare function legendModel(entries: readonly LegendEntry[], groups: readonly TerritoryGroup[], onScreen: ReadonlySet<string>, hidden: ReadonlySet<string>, filter: string): {
    flat: boolean;
    groups: LegendGroupView[];
};
/** Whether a group is expanded: every match while filtering, else the reader's choice, else whether anything is on screen. */
export declare function groupOpen(group: LegendGroupView, filter: string, manual: boolean | undefined): boolean;

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
 * `[0, MAXIMUM_RATIO]`, `midAt <= nearAt`. Unvalidated thresholds silently break
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
export declare function regimeAt(rawRatio: number, thresholds: LodThresholds, previous: Regime, hysteresis: number): Regime;
/**
 * Opacity of a layer that enters at `threshold`: 0 at the threshold, 1 at
 * threshold * (1 + band), linear between. A threshold of 0 or less means the
 * layer is always fully present.
 */
export declare function fade(ratio: number, threshold: number, band: number): number;
/**
 * Opacity of the far map's group names: 1 below `groupNamesUntil`, then a
 * cross-fade to 0 over `fadeBand`, outside far always 0. Far can end as low
 * as `midAt * (1 - hysteresis)` (the zoom-out re-entry point), so when the
 * band would run past that the fade is squeezed to end there: otherwise the
 * names would vanish mid-fade at the regime change. With no room at all, the
 * names hold through all of far.
 */
export declare function groupNameAlpha(ratio: number, regime: Regime, options: {
    midAt: number;
    groupNamesUntil: number;
    fadeBand: number;
    hysteresis: number;
}): number;

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
import { type Corner } from "../shared/corner";
import type { Scene } from "../shared/scene";
import type { Theme } from "../shared/theme";
import type { Bounds } from "../viewport/fit";
/** The minimap is always this size (spec 4 §1): a 160 x 110 canvas. */
export declare const MINIMAP_SIZE: {
    width: number;
    height: number;
};
/** Where the minimap sits inside the map's box; `minimap={true}` picks the default, `"bottom-left"`. */
export type MinimapCorner = Corner;
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
    onPoint: (worldHorizontal: number, worldVertical: number) => void;
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
 * then the territories, fitted to `size` from `world` and painted by the
 * same `paintTerritories` as the main map (one fill layer, then one outline
 * per ring), left unclipped (a ring padded slightly past the node extent
 * still reads fine a few pixels past the fitted box); then the current
 * view's world rectangle as a polygon stroked in the name colour — the one
 * colour guaranteed to contrast with every fill (metric 16) — clamped to `size`'s edges *as a rectangle*
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
/** The point nearest to (horizontal, vertical) within `radius` pixels, or null. Ties go to the earlier point. */
export declare function nearestWithin(points: readonly ScreenPoint[], horizontal: number, vertical: number, radius: number): ScreenPoint | null;

// points/paintPoints.d.ts
import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** Stroke width of an unvisited point's ring, in CSS pixels (spec slice D §4). */
export declare const UNVISITED_RING_WIDTH = 1.5;
/**
 * Each point in its territory's colour (`pointNeutral` without one), with
 * its state shown by shape, not by colour alone (WCAG 2.2 SC 1.4.1): a
 * visited point is a filled disc, any other a ring whose outer edge sits at
 * the same `pointRadius`, so both marks have the same footprint. A dimmed
 * territory's points are drawn first, underneath, at `alpha` times
 * `DIMMED_ALPHA`; the surface is left at `alpha`. A point with no territory
 * is never dimmed.
 */
export declare function paintPoints(surface: Surface, scene: Scene, spec: MapSpec, viewport: Viewport, theme: Pick<Theme, "pointNeutral" | "pointRadius">, dimmed?: ReadonlySet<string>, alpha?: number): void;

// points/paintSelection.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** Clear space between the keyboard focus ring's outer edge and the selection ring. */
export declare const SELECTION_RING_GAP = 3;
export declare const SELECTION_RING_WIDTH = 2;
/**
 * The selected item: the point, a gap, then a ring outside where the
 * keyboard focus ring sits, so the two differ by shape and position, not
 * only by colour (WCAG 2.2 SC 1.4.1; spec slice C §5). Drawn inside the
 * point layer, so it fades with the points and is absent at far.
 */
export declare function paintSelection(surface: Surface, scene: Scene, viewport: Viewport, theme: Pick<Theme, "pointRadius" | "focusOutlineWidth" | "selectionRing" | "territoryLabel">, id: string): void;

// shared/compareIds.d.ts
/** Orders ids by code unit, the tie-break every sorted list in the map uses so the order never depends on the input's. */
export declare function compareIds(first: string, second: string): number;

// shared/corner.d.ts
/** A corner of the map's box, where an overlay (minimap, legend) sits. */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** Gap between a corner overlay and the box's edges, in CSS pixels. */
export declare const CORNER_MARGIN = 12;
/** Absolute-position offsets for each corner; plain numbers so this module stays free of React. */
export declare const CORNER_POSITION: Record<Corner, {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}>;

// shared/dimmed.d.ts
/** A dimmed territory's fill, outline, points and name are drawn at this fraction of their alpha (spec categories §5). */
export declare const DIMMED_ALPHA = 0.15;
/** The empty dimmed set, shared so a default argument never allocates. */
export declare const NO_DIMMED: ReadonlySet<string>;

// shared/paint.d.ts
import type { Regime } from "../lod/lod";
import type { Viewport } from "../viewport/viewport";
import { type Presentation } from "./presentation";
import type { Scene } from "./scene";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";
/**
 * Per-frame values a precomputed `Scene` does not carry: the regime, the
 * point layer's fade, and the canvas's CSS size (a name larger than the
 * canvas is skipped, see `paintLabels`). No ratio here — a placed
 * name carries its own absolute `activeFromScale` (see
 * `labels/placement.ts`), so `paintLabels` reads `viewport.scale` directly
 * instead of a fit-relative ratio threaded through the frame.
 *
 * `focusedTerritory`/`focusedNode` are the ids (primitives, so they can sit
 * in an effect's dependency list) of the territory or item whose button in
 * the accessible tree has keyboard focus; absent or `null` means none.
 */
export interface Frame {
    regime: Regime;
    pointAlpha: number;
    width: number;
    height: number;
    focusedTerritory?: string | null | undefined;
    focusedNode?: string | null | undefined;
    /** Guided or dense emphasis (spec slice D §4); absent means guided. */
    presentation?: Presentation | undefined;
    /** Group names' alpha this frame (spec categories §4); absent means 0. */
    groupAlpha?: number | undefined;
    /** Territory ids drawn at `DIMMED_ALPHA` (spec categories §5); absent means none. */
    dimmed?: ReadonlySet<string> | undefined;
    /** The selected item's id, ringed inside the point layer (spec slice C §5); absent or `null` means none. */
    selected?: string | null | undefined;
    /** The hovered item's id, whose edges are previewed at half the point alpha (spec slice E §6); absent or `null` means none. */
    hovered?: string | null | undefined;
    /** How many edges an item draws (`Tuning.edgesPerNode`); absent means none. */
    edgesPerNode?: number | undefined;
}
/**
 * The single place that decides paint order: the territory fill layer
 * (largest first; with groups, the leaves' and the families' layers
 * cross-faded by `groupAlpha`), territory outlines, the families' outlines, points (then the hovered and the selected item's edges, then the selection ring), the keyboard-focus outline,
 * then names, so a name is never covered by a mark, by a territory's fill or
 * by the focus outline, and the focus outline is never covered by a
 * boundary or a point.
 */
export declare function paint(surface: Surface, scene: Scene, spec: MapSpec, viewport: Viewport, frame: Frame, theme: Theme): void;

// shared/presentation.d.ts
import type { Regime } from "../lod/lod";
/**
 * The two ways the map presents itself (spec slice D §4): `guided` for the
 * first look, `dense` for the analyst. Presentation never changes the LOD
 * regimes; it only changes emphasis.
 */
export type Presentation = "guided" | "dense";
/** In dense, territory fills are composited at this fraction of `theme.territoryFillAlpha`. */
export declare const DENSE_FILL_FACTOR = 0.5;
/**
 * In dense, medium and small territory names are drawn at this alpha. The
 * spec said 60%; at 0.6 the light theme reaches only 3.83:1, under metric
 * 16's 4.5:1, so 0.7 (5.09:1 light, 6.89:1 dark).
 */
export declare const DENSE_NAME_ALPHA = 0.7;
/** What the `presentation` prop accepts: a fixed presentation, or `"auto"` (the default). */
export type PresentationSetting = "auto" | Presentation;
/** `"auto"` is guided at the far regime and dense at mid and near; a fixed value ignores the regime. */
export declare function resolvePresentation(requested: PresentationSetting, regime: Regime): Presentation;

// shared/scene.d.ts
import { type RelatedEdge } from "../edges/related";
import { type Measure, type PlacedLabel } from "../labels/placement";
import { type TerritoryGroup } from "../territories/groups";
import { type Ring } from "../territories/shape";
import { type Bounds } from "../viewport/fit";
import { type MapNode, type MapSpec } from "./spec";
import type { Theme } from "./theme";
import type { Tuning } from "./tuning";
/** Everything about a corpus that does not change with the viewport: computed once per spec. */
export interface Scene {
    byId: ReadonlyMap<string, MapNode>;
    shapes: ReadonlyMap<string, Ring[]>;
    labels: readonly PlacedLabel[];
    /** Colour per territory id; a territory may be absent (empty palette), painters then use `theme.pointNeutral`. */
    colours: ReadonlyMap<string, string>;
    /** Territory ids, largest total ring area first: the fill layer's paint order. */
    paintOrder: readonly string[];
    /** The spec's groups (`deriveTerritoryGroups`); empty when it has none. */
    groups: readonly TerritoryGroup[];
    /** One placed name per group, measured in the large font plus its letter spacing; `id` is the group's id. */
    groupLabels: readonly PlacedLabel[];
    /** Each territory's world-space bounding box; a territory without rings is absent. */
    bounds: ReadonlyMap<string, Bounds>;
    /**
     * Each group's region, keyed by group id (spec slice E §3): a declared
     * parent's `boundary` when it has one, a group of one its leaf's shape,
     * otherwise the disks outline of every member point. Empty without groups.
     */
    groupShapes: ReadonlyMap<string, Ring[]>;
    /** Each group's world-space bounding box; a group without rings is absent. */
    groupBounds: ReadonlyMap<string, Bounds>;
    /** Each family's colour, keyed by group id (spec slice E §5); empty without groups. */
    groupColours: ReadonlyMap<string, string>;
    /** Each item's related items, heaviest first (spec slice E §6); empty without edges. */
    related: ReadonlyMap<string, readonly RelatedEdge[]>;
    /** The heaviest edge weight in the spec, so widths scale against it; 0 when no edge carries one. */
    maximumEdgeWeight: number;
}
/** Extra space between a group name's letters, in CSS pixels; the painter draws with the same value. */
export declare const GROUP_LETTER_SPACING = 1;
/**
 * Only the fields this function actually reads, not the full `Tuning`/`Theme`
 * — so a caller can memoize its own call on just those primitive values
 * (e.g. `CorpusMap`, where `tuning`/`theme` objects are minted fresh on
 * every render for an inline literal prop) without depending on unstable
 * whole-object identity for fields it never uses.
 */
export declare function buildScene(spec: MapSpec, tuning: Pick<Tuning, "hullPadding" | "labelClasses">, theme: Pick<Theme, "territoryFonts" | "palette" | "territoryLabel">, measure: Measure): Scene;

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
    /** Overrides the palette for this territory; `#rrggbb`, `rgb()` or `rgba()`. */
    colour?: string;
    /**
     * The group this territory belongs to, by display name; territories with
     * the same `group` share one. If any territory carries it, groups are not
     * derived and the others fall under "Other" (spec categories §3).
     */
    group?: string;
    /**
     * The id of this territory's parent (spec slice E §3). A parent is any
     * territory another one names here; it lists no members of its own, its
     * members are its children's. Two levels only; a node belongs to a leaf.
     */
    parent?: string;
}
/** An undirected link between two items (spec slice E §6). */
export interface MapEdge {
    source: string;
    target: string;
    /** Finite and >= 0; heavier edges are drawn first and thicker. */
    weight?: number;
    /** Why the two are related, shown in the related list. */
    reason?: string;
}
export interface MapSpec {
    version: "1";
    territories: Territory[];
    nodes: MapNode[];
    edges?: MapEdge[];
}
/** Ids of the territories some other territory names as `parent`. */
export declare function parentIds(spec: Pick<MapSpec, "territories">): Set<string>;
/** The territories that hold items: every territory no other one names as `parent`, in spec order. */
export declare function leafTerritories(spec: Pick<MapSpec, "territories">): Territory[];
export declare class SpecError extends Error {
}
/**
 * The validator is the contract: everything the renderer relies on is
 * checked here, and nothing else in the library defends against a malformed
 * spec. Membership is checked in both directions — a node that claims a
 * territory must be listed in it, and a listed member must claim it — so the
 * painter (which walks `members`) and the tree (which walks `territory`)
 * agree on which nodes a territory holds. Parents (two levels, nodes only
 * in leaves) and edges are checked here too. `meta` is never read.
 */
export declare function validateSpec(input: unknown): MapSpec;

// shared/surface.d.ts
export interface Surface {
    clear(): void;
    polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
    circle(id: string, horizontal: number, vertical: number, radius: number, fill: string): void;
    /** Draws `text` centred on (horizontal, vertical); `letterSpacing` (a CSS length) applies to this call only. */
    text(text: string, horizontal: number, vertical: number, color: string, font: string, letterSpacing?: string): void;
    /** Sets the alpha applied to every draw call until the next `globalAlpha` call. */
    globalAlpha(alpha: number): void;
    /** Strokes a closed ring (no fill) at `width`, leaving the line width of later calls untouched. */
    outline(points: Array<[number, number]>, color: string, width: number): void;
    /** Strokes a circle of radius `radius` centred on (horizontal, vertical) (no fill) at `width`, leaving later calls untouched. */
    ring(horizontal: number, vertical: number, radius: number, color: string, width: number): void;
    /** Strokes a circle (no fill) for point `id`, at `width`, leaving later calls untouched. */
    hollowCircle(id: string, horizontal: number, vertical: number, radius: number, colour: string, width: number): void;
    /** Strokes a straight line from `start` to `end` at `width`, leaving later calls untouched. */
    line(start: [number, number], end: [number, number], colour: string, width: number): void;
    /**
     * Draws `draw`'s calls into one offscreen layer and composites it once at
     * `alpha`, so shapes drawn inside never darken where they overlap (spec
     * slice D §3). Without an offscreen canvas it draws straight onto the
     * target at `alpha`: overlaps then darken, but the map still renders.
     */
    layer(alpha: number, draw: (surface: Surface) => void): void;
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
        letterSpacing?: string;
    }>;
    alphas: number[];
    outlines: Array<{
        points: Array<[number, number]>;
        color: string;
        width: number;
    }>;
    rings: Array<{
        x: number;
        y: number;
        r: number;
        color: string;
        width: number;
    }>;
    layers: number[];
    hollowCircles: Array<{
        id: string;
        x: number;
        y: number;
        r: number;
        colour: string;
        width: number;
    }>;
    lines: Array<{
        from: [number, number];
        to: [number, number];
        colour: string;
        width: number;
    }>;
    calls: Array<"clear" | "polygon" | "circle" | "hollowCircle" | "text" | "alpha" | "outline" | "ring" | "line" | "layer" | "layerEnd">;
    clear(): void;
    polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
    circle(id: string, horizontal: number, vertical: number, radius: number, fill: string): void;
    hollowCircle(id: string, horizontal: number, vertical: number, radius: number, colour: string, width: number): void;
    text(text: string, horizontal: number, vertical: number, color: string, font: string, letterSpacing?: string): void;
    globalAlpha(alpha: number): void;
    outline(points: Array<[number, number]>, color: string, width: number): void;
    ring(horizontal: number, vertical: number, radius: number, color: string, width: number): void;
    line(start: [number, number], end: [number, number], colour: string, width: number): void;
    layer(alpha: number, draw: (surface: Surface) => void): void;
}
export declare function canvasSurface(context: CanvasRenderingContext2D): Surface;

// shared/theme.d.ts
import type { LabelClass } from "../labels/placement";
export interface Theme {
    territoryLabel: string;
    territoryFonts: Record<LabelClass, string>;
    cardBackground: string;
    cardBorder: string;
    hoverBackground: string;
    hoverText: string;
    pointRadius: number;
    /**
     * Colour of the outline drawn on the canvas around the territory (or the
     * item's point) whose button in the accessible tree has keyboard focus —
     * the tree itself is visually hidden, so this is the only visible focus.
     * Opaque, and at least 3:1 against the map's background (WCAG 2.2 SC
     * 1.4.11); each theme's is checked against its pages, bare and under every
     * palette fill (`theme.test.ts`).
     */
    focusOutline: string;
    /** Line width of that outline, in CSS pixels. */
    focusOutlineWidth: number;
    /** The selected item's ring; absent falls back to `territoryLabel`, which clears 4.5:1 in both themes. */
    selectionRing?: string | undefined;
    /** The related-item line and neighbour ring (spec slice E §6); opaque, at least 3:1 over every page and fill. */
    edge: string;
    /**
     * Categorical colours for territories, assigned so that territories whose
     * visible borders touch get different colours (`territories/colour.ts`).
     * Each entry is opaque; the fill is composited at `territoryFillAlpha`.
     */
    palette: string[];
    /** Colour of a point with no territory, and of a territory the palette left uncoloured. */
    pointNeutral: string;
    /** Alpha at which the single territory fill layer is composited (guided presentation). */
    territoryFillAlpha: number;
}
export declare const DEFAULT_THEME: Theme;
/** For a dark page (`#18181b` or darker); every colour is checked by metrics 15-17 and the focus test. */
export declare const DARK_THEME: Theme;

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
    /**
     * Below this zoom ratio (viewport scale over fit scale) the far map names
     * groups, not territories; the swap cross-fades over `fadeBand` above it
     * (spec categories §4), squeezed to finish before far can end
     * (`groupNameAlpha`). With no room before `midAt`, group names hold
     * through all of far.
     */
    groupNamesUntil: number;
    /** How many related items the selected or hovered item draws a line to, heaviest first (spec slice E §6); 0 draws none. */
    edgesPerNode: number;
}
export declare const DEFAULT_TUNING: Tuning;
export declare function resolveTuning(partial: Partial<Tuning> | undefined): Tuning;

// territories/colour.d.ts
import type { Territory } from "../shared/spec";
import { type Ring } from "./shape";
/** Cells along the longer side of the raster `visibleBorders` draws the shapes onto. */
export declare const COLOUR_GRID_CELLS = 256;
/** Territory ids by total ring area, largest first, ties by id: the fill layer's paint order. */
export declare function largestFirst(shapes: ReadonlyMap<string, readonly Ring[]>): string[];
export interface VisibleBorders {
    /** Raster cells where each territory is the one on top (the smallest territory covering the cell). */
    visibleCells: Map<string, number>;
    /** For each territory, the territories it shares a visible border with, and that border's length in cells. */
    neighbours: Map<string, Map<string, number>>;
}
/**
 * Rasterises the shapes in `order` (largest first) onto a grid of `cells`
 * along the longer side, so each cell ends up owned by the smallest
 * territory covering it — what the fill layer shows there. Two territories
 * are neighbours when owned cells of theirs touch side by side: a reader
 * sees that border, so the two need different colours. Overlap alone does
 * not count; on arXiv the overlap graph is too dense for any small palette.
 */
export declare function visibleBorders(shapes: ReadonlyMap<string, readonly Ring[]>, order: readonly string[], cells?: number): VisibleBorders;
/**
 * One colour per territory. A colour given in the data is kept as is; the
 * rest are coloured greedily, most visible first (ties by id), each taking
 * the palette colour that shares the least visible border with its already
 * coloured neighbours (ties by palette order). A given colour weighs on its
 * neighbours only when it is one of the palette's own colours. With an empty
 * palette only the given colours are returned; painters fall back to
 * `theme.pointNeutral` for the rest. Never throws.
 */
export declare function assignTerritoryColours(shapes: ReadonlyMap<string, readonly Ring[]>, territories: readonly Territory[], palette: readonly string[]): Map<string, string>;

// territories/familyColours.d.ts
import type { Territory } from "../shared/spec";
import type { Theme } from "../shared/theme";
import type { TerritoryGroup } from "./groups";
import type { Ring } from "./shape";
/**
 * Which way family tints move: towards the territory label's lightness, so
 * away from the page (a dark label means a light page, so tints darken).
 * Moving one way only keeps every tint at least as far from the page as its
 * palette colour, which metric 15 needs (spec slice E §5).
 */
export declare function tintDirection(theme: Pick<Theme, "territoryLabel">): 1 | -1;
/**
 * Family colours from the palette, coloured over the family regions the way
 * territories are coloured today, then each child a tint of its family's
 * colour: leaves walk most-visible first and take the tint that shares the
 * least visible border with their already coloured neighbours. A declared
 * `colour` wins, on a parent and on a child (spec slice E §5).
 */
export declare function familyColours(shapes: ReadonlyMap<string, readonly Ring[]>, groupShapes: ReadonlyMap<string, readonly Ring[]>, groups: readonly TerritoryGroup[], territories: readonly Territory[], palette: readonly string[], direction: 1 | -1): {
    colours: Map<string, string>;
    groupColours: Map<string, string>;
};

// territories/groups.d.ts
import { type MapSpec } from "../shared/spec";
/** Territories shown together in the legend and named together on the far map (spec categories §3). */
export interface TerritoryGroup {
    id: string;
    name: string;
    /** Territory ids, most members first, ties by id. */
    members: string[];
    /** The declared parent's `colour`; absent otherwise (spec slice E §3). */
    colour?: string;
}
/** Below this many territories nothing is derived: a short flat list needs no groups. */
export declare const MINIMUM_DERIVED_TERRITORIES = 10;
/**
 * Above this many nothing is derived either: the clustering below is cubic
 * in the territory count (400 already costs about ten million steps), and a
 * consumer with that many categories can supply `group` instead.
 */
export declare const MAXIMUM_DERIVED_TERRITORIES = 400;
/** Where a territory without `group` lands when another territory has one. */
export declare const OTHER_GROUP = "Other";
/** round(√n) clamped to [3, 8]: 6 for the 38 arXiv categories. */
export declare function derivedGroupCount(territoryCount: number): number;
/**
 * The spec's groups: by declared parent when any territory has `parent`;
 * by `group` name when any territory carries one (the rest under "Other");
 * otherwise derived from the centroids for 10 to 400
 * territories, otherwise none. A pipeline can run this, name the groups and
 * write `group` back into its corpus: that is how derived groups get named.
 */
export declare function deriveTerritoryGroups(spec: MapSpec): TerritoryGroup[];

// territories/hitTest.d.ts
import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import type { Bounds } from "../viewport/fit";
import { type Viewport } from "../viewport/viewport";
import { type Point } from "./shape";
/**
 * The non-dimmed territories whose shape holds `point` (world units), most
 * members first, ties by id (spec categories §7). The bounding box rejects
 * almost every territory before any ring is walked, which keeps a pointer
 * move cheap at hundreds of territories.
 */
export declare function territoriesAt(scene: Pick<Scene, "bounds" | "shapes">, spec: MapSpec, point: Point, dimmed: ReadonlySet<string>): string[];
/**
 * The families whose region holds `point` (world units), skipping a family
 * whose every leaf is dimmed, most leaves first, ties by id (spec slice E §4).
 */
export declare function familiesAt(scene: Pick<Scene, "groups" | "groupShapes" | "groupBounds">, point: Point, dimmed: ReadonlySet<string>): string[];
/** Ids of the territories whose bounding box meets the view, sorted; dimmed ones included (the legend shows them). */
export declare function onScreenTerritories(bounds: ReadonlyMap<string, Bounds>, viewport: Viewport, width: number, height: number): string[];

// territories/paintTerritories.d.ts
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { type Viewport } from "../viewport/viewport";
/** Territory outline width in CSS pixels (spec slice D §3). */
export declare const TERRITORY_OUTLINE_WIDTH = 1.5;
/** A family's outline width in CSS pixels: the frame its children sit in (spec slice E §4). */
export declare const GROUP_OUTLINE_WIDTH = 2.5;
/**
 * Fills every territory opaque, largest first, into one layer composited at
 * `fillAlpha`, so each pixel shows the colour of the smallest territory
 * covering it and overlaps never darken; then outlines every ring in its
 * territory's full colour. A territory missing from `scene.colours` (an
 * empty palette) is painted in `theme.pointNeutral`. A dimmed territory's
 * fill and outline are drawn at `DIMMED_ALPHA`.
 *
 * With groups (spec slice E §4), `familyAlpha` (the frame's group-name
 * alpha) picks the level: the leaves' layer at `fillAlpha * (1 -
 * familyAlpha)` and their outlines at `1 - familyAlpha`, the families' layer
 * at `fillAlpha * familyAlpha`, then every family's outline on top at
 * `GROUP_OUTLINE_WIDTH` as the frame its children sit in. A family whose
 * every leaf is dimmed is drawn at `DIMMED_ALPHA`.
 */
export declare function paintTerritories(surface: Surface, scene: Scene, viewport: Viewport, theme: Pick<Theme, "pointNeutral">, fillAlpha: number, dimmed?: ReadonlySet<string>, familyAlpha?: number): void;

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
 * Outer rings of the union of disks of radius `radius` around `points`, by
 * marching squares over the signed distance to the union. Holes are dropped:
 * a territory is drawn as regions, not as regions with gaps.
 */
export declare function disksOutline(points: readonly Point[], radius: number): Ring[];
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
export declare function contains(ring: Ring, [horizontal, vertical]: Point): boolean;
export declare function ringArea(ring: Ring): number;

// territories/tint.d.ts
/** Lightness offsets in OKLab, one per sibling slot (spec slice E §5). */
export declare const TINT_STEPS: readonly [0, 0.07, 0.14, 0.21, 0.28];
/** OKLab lightness limits for any tint: past the ceiling a tint washes out the points drawn over its fill on a dark page. */
export declare const TINT_FLOOR = 0.05;
export declare const TINT_CEILING = 0.78;
/** Kept between a tint and the palette's extreme on the page's side: hue moves luminance a little at equal lightness. */
export declare const TINT_MARGIN = 0.02;
/** OKLab lightness of `colour`. */
export declare function lightness(colour: string): number;
/**
 * The lightness band family tints may use: from the palette's own extreme on
 * the page's side (every palette colour already passes metric 15) to the
 * limit on the label's side, so no tint ends up closer to the page than the
 * palette colour nearest to it.
 */
export declare function tintBand(palette: readonly string[], direction: 1 | -1): readonly [number, number];
/**
 * `colour` moved `step` in OKLab lightness towards `direction` (1 lighter,
 * -1 darker) inside `band`; when that side has less room than the largest
 * step, the side with more room is used and every step is scaled into it, so
 * siblings stay distinct and ordered. Chroma shrinks as lightness nears
 * either end so the result stays in gamut; a colour's alpha is dropped.
 * Step 0 returns the colour as `#rrggbb`.
 */
export declare function tint(colour: string, step: number, direction: 1 | -1, band?: readonly [number, number]): string;

// territories/tooltipPosition.d.ts
/** Gap between the cursor and the tooltip, in CSS pixels (spec categories §7). */
export declare const TOOLTIP_OFFSET = 12;
/** Opacity of the group line in the territory balloon; CorpusMap.tooltip.test.tsx pins 4.5:1 contrast in both themes. */
export declare const GROUP_LINE_OPACITY = 0.8;
/** Rows the territory balloon lists before "+N more": deep zoom stacks twenty-odd territories under one cursor. */
export declare const TOOLTIP_ROW_LIMIT = 5;
/** The tooltip's top-left corner: below-right of the cursor, flipped on an axis where it would leave the map, never above or left of it. */
export declare function tooltipPosition(cursorHorizontal: number, cursorVertical: number, boxWidth: number, boxHeight: number, mapWidth: number, mapHeight: number, offset?: number): {
    left: number;
    top: number;
};

// viewport/fit.d.ts
import type { MapSpec } from "../shared/spec";
import type { Ring } from "../territories/shape";
import type { Viewport } from "./viewport";
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
/** The box around `points`; the unit box when there are none, and a degenerate axis widened by 0.5 each way. */
export declare function boundsOf(points: Iterable<readonly [number, number]>): Bounds;
export declare function worldBounds(spec: MapSpec): Bounds;
/** The nodes plus every drawable territory ring: what a fitted view must show whole (spec slice D §4). */
export declare function sceneBounds(spec: MapSpec, shapes: ReadonlyMap<string, readonly Ring[]>): Bounds;
/** One territory's box, or `null` when it has no drawable ring (nothing to zoom to). */
export declare function ringBounds(rings: readonly Ring[]): Bounds | null;
/** `fitBounds`, with the scale clamped to [minimumScale, maximumScale] and `bounds` kept centred. */
export declare function fitClamped(bounds: Bounds, width: number, height: number, padding: number, minimumScale: number, maximumScale: number): Viewport;
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

// viewport/fitScene.d.ts
import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import type { Viewport } from "./viewport";
/** Refits after widening by the names; three passes settle every corpus in the gallery (demo/corpora/fit.test.ts). */
export declare const LABEL_FIT_PASSES = 3;
/**
 * The first view: every territory outline whole, and every name that is
 * active at the fit (group names when the scene has groups and the fit is far) and fits the box
 * whole too (closes the BACKLOG item about names cut
 * at the fitted phone view). A name's box is in screen pixels, so its extent
 * in world units depends on the scale being chosen; each pass widens the
 * shape bounds by the names at the previous pass's scale and refits.
 *
 * The names counted are fixed at the shapes-only fit, the largest scale this
 * function can return: widening only lowers the scale, and a lower scale only
 * deactivates names, so no name becomes active after it was left out. Picking
 * the set again on every pass lets a name whose `activeFromScale` sits near
 * the fitted scale flip in and out, and the result never settles.
 */
export declare function fitScene(spec: MapSpec, scene: Pick<Scene, "shapes" | "labels" | "groupLabels">, width: number, height: number, padding: number, options?: {
    groupNames: boolean;
}): Viewport;

// viewport/keyboard.d.ts
import type { LodThresholds, Regime } from "../lod/lod";
export interface KeyInput {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}
export type KeyboardCommand = {
    kind: "pan";
    horizontal: number;
    vertical: number;
} | {
    kind: "zoom";
    direction: "in" | "out";
} | {
    kind: "fit";
} | {
    kind: "regimeOut";
};
/**
 * The surface's key map (spec slice B §4). Pan fractions are of the view's
 * width/height, signed in the direction the view travels: ArrowRight shows
 * what lies to the right. Ctrl/Cmd are taken only with the zoom keys — the
 * map captures the browser's page zoom while it has focus — and Ctrl+0
 * stays the browser's zoom reset. Alt is never taken.
 */
export declare function keyboardCommand(input: KeyInput): KeyboardCommand | null;
/**
 * Where `Esc` zooms to, as a ratio of the fitted scale: from near, the
 * geometric middle of the mid band (its lower edge floored at the fitted
 * ratio 1); from mid, or when the mid band is empty, the fit itself. Only a
 * target strictly below the current `ratio` counts — hysteresis can hold a
 * regime below its threshold, and `Esc` never zooms in — so the first one
 * below wins, and nothing when none is (or at far).
 */
export declare function regimeOutRatio(regime: Regime, ratio: number, thresholds: LodThresholds): number | null;

// viewport/publicViewport.d.ts
import { type Viewport } from "./viewport";
/** Box-independent view: the world point at the box centre, and the scale relative to the fitted view. */
export interface MapViewport {
    centre: [number, number];
    zoom: number;
}
/**
 * Why `onViewportChange` fired: a reader's action, an explicit fit, the fit a
 * new spec proposes, or (uncontrolled only) a box change that kept the pixel
 * scale and so moved the zoom over the new fit.
 */
export type ViewportChangeReason = "interaction" | "fit" | "spec" | "resize";
/** The zoom range a public view is clamped to, relative to the fit. */
export interface ZoomBand {
    minimum: number;
    maximum: number;
}
export declare function toPublic(viewport: Viewport, fitScale: number, width: number, height: number): MapViewport;
export declare function fromPublic(view: MapViewport, fitScale: number, width: number, height: number): Viewport;
/** A usable view, the zoom clamped to `band`; `null` for anything that cannot be drawn (the map then draws the fit). */
export declare function sanitise(view: {
    centre?: unknown;
    zoom?: unknown;
} | null | undefined, band: ZoomBand): MapViewport | null;
/**
 * The pixel view for a sanitised public view, else `fit`: a finite centre far
 * enough out (`1e308`) still overflows once scaled, and would draw nothing.
 */
export declare function drawableView(view: MapViewport | null, fit: Viewport, width: number, height: number): Viewport;
/** Equal within a relative 1e-9: a round trip through pixels is never a change. */
export declare function sameView(left: MapViewport, right: MapViewport): boolean;

// viewport/useElementSize.d.ts
import { type RefObject } from "react";
export interface ElementSize {
    width: number;
    height: number;
}
/**
 * The size of `elementReference`'s element, from a `ResizeObserver`; `null` until the
 * first observation. A report equal to the current size never calls
 * `setSize` at all, so no render is ever scheduled for it — checked against
 * `sizeReference`, not the `size` state variable, because a same-reference-
 * returning functional update is only an optimization, not a guarantee:
 * measured empirically while building this hook (against the CorpusMap
 * frame-coalescing test's own technique of counting Profiler commits, not
 * renders — a render-body counter would have missed it), React still
 * re-commits a second, separate dispatch of an identical value once a real
 * state change has already committed before it. `sizeReference` is written
 * synchronously in this same callback, right where `size` is decided, rather
 * than through a `[size]`-keyed effect like `CorpusMap`'s `hoverReference` (which
 * needs one, since `hover` there has more than one writer): `size` has
 * exactly one writer, this callback, so there is no other update this ref
 * could fall behind.
 */
export declare function useElementSize(elementReference: RefObject<HTMLElement | null>): ElementSize | null;

// viewport/viewport.d.ts
export interface Viewport {
    scale: number;
    tx: number;
    ty: number;
}
export declare function toScreen(viewport: Viewport, worldHorizontal: number, worldVertical: number): [number, number];
export declare function toWorld(viewport: Viewport, screenHorizontal: number, screenVertical: number): [number, number];
export declare function panBy(viewport: Viewport, horizontalDelta: number, verticalDelta: number): Viewport;
export declare function zoomAt(viewport: Viewport, screenHorizontal: number, screenVertical: number, factor: number): Viewport;
/**
 * Like `zoomAt`, but lands on `scale` exactly instead of on
 * `viewport.scale * (scale / viewport.scale)`, which can miss the target by a float ulp —
 * enough to fall on the wrong side of a regime threshold.
 */
export declare function zoomTo(viewport: Viewport, screenHorizontal: number, screenVertical: number, scale: number): Viewport;
/**
 * Clamps `scale` to `[fit / maximumZoomOut, fit * maximumZoomIn]`. The wheel
 * handler and the imperative handle's `zoomIn`/`zoomOut` (showcase Task 3)
 * both reach it through `zoomStepScale`, so they clamp to exactly the same
 * band through the same code.
 */
export declare function clampScale(scale: number, fit: number, maximumZoomOut: number, maximumZoomIn: number): number;
/**
 * The scale after one zoom step by `factor` (> 1 zooms in, < 1 zooms out),
 * clamped to the band like `clampScale`, but never moving opposite to the
 * step. A keep-view resize can leave the scale outside the band (zoomed to
 * the maximum, then the box shrinks); there, clamping alone would turn a
 * zoom-in into a zoom-out. Outside the band a step only moves toward it,
 * and a step away from it leaves the scale where it is.
 */
export declare function zoomStepScale(scale: number, factor: number, fit: number, maximumZoomOut: number, maximumZoomIn: number): number;
/**
 * A box resize (showcase Task 2): keeps `scale` and keeps the world point
 * formerly at the old box's centre at the new box's centre, instead of
 * refitting — a spec change refits (via `fitScene`); a box change alone does
 * not.
 */
export declare function recenterOnBoxChange(viewport: Viewport, oldWidth: number, oldHeight: number, newWidth: number, newHeight: number): Viewport;

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
export declare function wheelZoomFactor(input: WheelInput, tuning: Pick<Tuning, "wheelSensitivity" | "pinchGain" | "maxZoomPerEvent">): number;
