import {
  type PointerEvent,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibleTree, itemCount } from "./a11y/AccessibleTree";
import { type HeadingLevel, resolveHeadingLevel } from "./a11y/headingLevel";
import { CardOverlay, DEFAULT_CARD_SIZE } from "./cards/CardOverlay";
import { useMeasure } from "./labels/useMeasure";
import { legendCorner, legendEntries } from "./legend/entries";
import { Legend } from "./legend/Legend";
import { type LodThresholds, type Regime, resolveThresholds } from "./lod/lod";
import { fade, groupNameAlpha, regimeAt } from "./lod/regime";
import { visibleNodes } from "./lod/visible";
import { Minimap, type MinimapCorner } from "./minimap/Minimap";
import { nearestWithin } from "./points/hover";
import { NO_DIMMED } from "./shared/dimmed";
import { paint } from "./shared/paint";
import { type Presentation, type PresentationSetting, resolvePresentation } from "./shared/presentation";
import { buildScene } from "./shared/scene";
import { type MapNode, type MapSpec, validateSpec } from "./shared/spec";
import { canvasSurface } from "./shared/surface";
import { DEFAULT_THEME, type Theme } from "./shared/theme";
import { resolveTuning, type Tuning } from "./shared/tuning";
import { onScreenTerritories, territoriesAt } from "./territories/hitTest";
import { GROUP_LINE_OPACITY, TOOLTIP_OFFSET, TOOLTIP_ROW_LIMIT, tooltipPosition } from "./territories/tooltipPosition";
import { boundsOf, fitBounds, fitClamped, ringBounds, sceneBounds } from "./viewport/fit";
import { fitScene } from "./viewport/fitScene";
import { keyboardCommand, regimeOutRatio } from "./viewport/keyboard";
import {
  fromPublic,
  type MapViewport,
  sameView,
  sanitise,
  toPublic,
  type ViewportChangeReason,
} from "./viewport/publicViewport";
import { useElementSize } from "./viewport/useElementSize";
import {
  panBy,
  recenterOnBoxChange,
  toScreen,
  toWorld,
  type Viewport,
  zoomStepScale,
  zoomTo,
} from "./viewport/viewport";
import { wheelZoomFactor } from "./viewport/wheel";

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
  cardSize?: { width: number; height: number } | undefined;
  theme?: Theme | undefined;
  onSelect?: ((node: MapNode) => void) | undefined;
  /** Present, even `null`, means controlled (spec slice C §3). An id whose node is dimmed or absent reads as no selection. */
  selectedId?: string | null | undefined;
  defaultSelectedId?: string | null | undefined;
  /** Fired only when the selected id changes, `null` included: a press on a point, a press on no point, Escape, a tree item. */
  onSelectedChange?: ((id: string | null) => void) | undefined;
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
   * Fired in both modes for every real change, never for a box change:
   * `"interaction"`, `"fit"` (`fit()`, Back to overview) or `"spec"` (the
   * fit a new spec proposes). Never called during render.
   */
  onViewportChange?: ((viewport: MapViewport, details: { reason: ViewportChangeReason }) => void) | undefined;
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
  minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" } | undefined;
  /**
   * Off by default; `true` puts it top-left. A DOM overlay listing the
   * largest territories, the point key and the gesture hint; it moves
   * clockwise when the minimap holds its corner.
   */
  legend?: boolean | { corner: MinimapCorner };
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

const FIT_PADDING = 24;

/**
 * Wheel zoom, and the imperative handle's `zoomIn`/`zoomOut` (showcase
 * Task 3), are clamped to [fit / MAXIMUM_ZOOM_OUT, fit * MAXIMUM_ZOOM_IN] of the
 * fitted scale, through the shared `zoomStepScale`, which also keeps a
 * step from moving opposite to its direction when a keep-view resize has
 * left the scale outside that band.
 */
const MAXIMUM_ZOOM_OUT = 8;
const MAXIMUM_ZOOM_IN = 64;

/** The wheel's own zoom band, relative to the fit: what a public `zoom` is clamped to (spec slice C §3). */
const ZOOM_BAND = { minimum: 1 / MAXIMUM_ZOOM_OUT, maximum: MAXIMUM_ZOOM_IN };

/** The view to open on: a valid `defaultViewport`, else the fit. */
function startingView(
  defaultViewport: MapViewport | undefined,
  fit: Viewport,
  width: number,
  height: number,
): Viewport {
  const view = sanitise(defaultViewport, ZOOM_BAND);
  return view === null ? fit : fromPublic(view, fit.scale, width, height);
}

type ViewportUpdate = Viewport | ((previous: Viewport) => Viewport);
/** A regime reset a view change carries (a fit, a keyboard regime step), applied when that view is drawn. */
interface RegimeReset {
  regime: Regime;
  refit: boolean;
}

/** How long keyboard movement must rest before the on-screen count is announced (spec slice B §4). */
const COUNT_ANNOUNCEMENT_DELAY = 500;

/** A press released within this many pixels of where it started is a click, not a drag. */
const CLICK_SLOP = 4;

function cardIdAt(root: HTMLElement | null, horizontal: number, vertical: number): string | null {
  if (!root) return null;
  // Reverse the DOM order rather than index from the end: `noUncheckedIndexedAccess`
  // makes an out-of-bounds index type `HTMLElement | undefined`, and this list can
  // never actually be out of bounds, so an `if (!card) continue` guard would be
  // dead code that a coverage gate can never satisfy. Topmost (last in DOM order)
  // still wins.
  const cards = [...root.querySelectorAll<HTMLElement>("[data-card]")].reverse();
  for (const card of cards) {
    const bounds = card.getBoundingClientRect();
    if (
      horizontal >= bounds.left &&
      horizontal <= bounds.right &&
      vertical >= bounds.top &&
      vertical <= bounds.bottom
    ) {
      return card.getAttribute("data-card");
    }
  }
  return null;
}

/**
 * Moves the territory balloon beside the cursor without a React commit (see
 * `tooltipPosition`). Both callers run only while a territory hover is
 * committed, so the balloon is always mounted.
 */
function placeTooltip(
  element: HTMLElement,
  cursorHorizontal: number,
  cursorVertical: number,
  mapWidth: number,
  mapHeight: number,
): void {
  const { left, top } = tooltipPosition(
    cursorHorizontal,
    cursorVertical,
    element.offsetWidth,
    element.offsetHeight,
    mapWidth,
    mapHeight,
  );
  // A transform, never left/top: moving a box through layout is a layout shift on every frame.
  element.style.transform = `translate(${left}px, ${top}px)`;
}

interface Press {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

/** A pointer position, surface-relative (`x`, `y`) and in client coordinates for the card hit-test. */
interface HoverPosition {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

/** Accumulated, not-yet-applied drag delta, flushed once per animation frame. */
interface Pending {
  dx: number;
  dy: number;
}

/**
 * What the pointer names: the nearest node, rendered as a small label above
 * its point, or the territories under it, rendered as a balloon beside the
 * cursor (spec categories §7).
 */
type HoverState =
  | { kind: "point"; id: string; label: string; x: number; y: number }
  | { kind: "territories"; ids: string[]; x: number; y: number };

/**
 * Renders `spec` as a canvas map with a card overlay and an accessible
 * parallel tree. The box comes from `width`/`height` when both are given,
 * else from measuring the parent (see the `width`/`height` doc). A box
 * change after the first keeps the current view — scale and centre — no
 * matter which source it came from; a new `spec` refits. To refit after a
 * box change, pass a `ref` (typed `CorpusMapHandle`) and call its `fit()`.
 */
export function CorpusMap({ ref: handleReference, ...properties }: CorpusMapProps): ReactElement {
  const { spec: raw, renderCard, onSelect, onRegimeChange, onViewChange } = properties;
  const thresholds = useMemo(() => resolveThresholds(properties.thresholds), [properties.thresholds]);
  const tuning = useMemo(() => resolveTuning(properties.tuning), [properties.tuning]);
  const cardCap = properties.cardCap ?? 200;
  const headingTag = resolveHeadingLevel(properties.headingLevel);
  // Not memoized: `layoutCards` is cheap and already recomputed every render
  // inside `CardOverlay`, so keying a memo on this object's identity would
  // only add a stale-dependency risk (Task 7's lesson) for no benefit.
  const cardSize = properties.cardSize ?? DEFAULT_CARD_SIZE;
  const theme = properties.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((node) => [node.id, node])), [spec]);
  const territoriesById = useMemo(
    () => new Map(spec.territories.map((territory) => [territory.id, territory])),
    [spec],
  );

  const rootReference = useRef<HTMLDivElement>(null);
  // `:focus-visible` by hand: a press focuses the surface (it is a tab stop),
  // but a ring after a mouse press is noise; keyboard focus and any handled
  // key show it (spec slice B §4).
  const [surfaceFocusVisible, setSurfaceFocusVisible] = useState(false);
  const pointerFocus = useRef(false);
  // A blank label would leave the region unnamed, so it keeps the default too.
  const surfaceLabel = properties.label?.trim()
    ? properties.label
    : `Map of ${spec.nodes.length} ${spec.nodes.length === 1 ? "item" : "items"}`;
  // Always called (rules of hooks): a consumer that never removes/adds
  // `width`/`height` across an instance's lifetime never sees it matter, and
  // one that does gets a `measured` value that has been tracking the parent
  // the whole time, ready the moment the explicit props are dropped.
  const measured = useElementSize(rootReference);
  // "When both are given they win" (spec 4 §1): a lone `width` or `height`
  // does not count as explicit, and falls through to the measured box.
  const explicitBox =
    properties.width !== undefined && properties.height !== undefined
      ? { width: properties.width, height: properties.height }
      : null;
  const box = explicitBox ?? measured;
  // A box with zero width or height is not ready: fitting into it would
  // squeeze the corpus into about a pixel, and since a later box change
  // keeps the view, that degenerate scale would stick. A `ResizeObserver`
  // does report such boxes (a parent animating open from height 0, or one
  // sized by content that loads later), so they must not become the fit
  // basis; the map renders nothing until both sides are positive.
  const ready = box !== null && box.width > 0 && box.height > 0;
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;

  // Computed once per spec/tuning/theme/measure — not per fitScale/box size:
  // placed names store an absolute `activeFromScale` (spec 4 "showcase"), so
  // the box a corpus is fitted into no longer belongs in this memo's key,
  // and a resize (which only changes `fitScale`) costs no scene rebuild.
  // Keyed on the primitive values `buildScene` actually reads — not on the
  // `tuning`/`theme` objects themselves, which `resolveTuning` and
  // `properties.theme ?? DEFAULT_THEME` both mint fresh on every render for an
  // inline literal prop (spec 4's tuning panel does exactly that), which
  // would rebuild the scene (70-135ms on 10k items) on every render. The
  // literals below and the dependency list must both name every field
  // `buildScene` reads — nothing more, nothing less — which is also why
  // `buildScene` only asks for `Pick<Tuning, ...>` and `Pick<Theme, ...>`:
  // passing the whole objects here would put the whole (unstable) objects
  // back in the dependency list.
  const measure = useMeasure();
  // The palette as one primitive, so an inline `theme` literal with the same colours does not rebuild the scene.
  const paletteKey = theme.palette.join("|");
  const scene = useMemo(
    () =>
      buildScene(
        spec,
        {
          hullPadding: tuning.hullPadding,
          labelClasses: { large: tuning.labelClasses.large, medium: tuning.labelClasses.medium },
        },
        {
          territoryFonts: {
            large: theme.territoryFonts.large,
            medium: theme.territoryFonts.medium,
            small: theme.territoryFonts.small,
          },
          palette: paletteKey === "" ? [] : paletteKey.split("|"),
        },
        measure,
      ),
    [
      spec,
      measure,
      tuning.hullPadding,
      tuning.labelClasses.large,
      tuning.labelClasses.medium,
      theme.territoryFonts.large,
      theme.territoryFonts.medium,
      theme.territoryFonts.small,
      paletteKey,
    ],
  );

  // Each territory's group name, for the territory balloon's last line.
  const groupOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const group of scene.groups) for (const member of group.members) names.set(member, group.name);
    return names;
  }, [scene.groups]);

  // The fitted view is ratio 1; it shows group names only when that is far.
  const groupNamesAtFit = regimeAt(1, thresholds, "far", tuning.hysteresis) === "far";
  const [ownViewport, setOwnViewport] = useState<Viewport>(() =>
    startingView(
      properties.defaultViewport,
      fitScene(spec, scene, width, height, FIT_PADDING, { groupNames: groupNamesAtFit }),
      width,
      height,
    ),
  );
  // A theme or font change rebuilds the scene and so moves `fitted` (and
  // `fitScale`, `ratio`) without refitting the view: only a new `spec` refits.
  const fitted = useMemo(
    () => fitScene(spec, scene, width, height, FIT_PADDING, { groupNames: groupNamesAtFit }),
    [spec, scene, width, height, groupNamesAtFit],
  );
  const fitScale = fitted.scale;
  // The controlled view, rebuilt from primitives so a fresh object literal
  // with the same numbers costs nothing (spec slice C §5).
  const viewportControlled = properties.viewport !== undefined;
  const controlledHorizontal: unknown = properties.viewport?.centre?.[0];
  const controlledVertical: unknown = properties.viewport?.centre?.[1];
  const controlledZoom: unknown = properties.viewport?.zoom;
  const controlledViewport = useMemo(() => {
    if (!viewportControlled) return fitted;
    const view = sanitise({ centre: [controlledHorizontal, controlledVertical], zoom: controlledZoom }, ZOOM_BAND);
    return view === null ? fitted : fromPublic(view, fitted.scale, width, height);
  }, [viewportControlled, controlledHorizontal, controlledVertical, controlledZoom, fitted, width, height]);
  const viewport = viewportControlled ? controlledViewport : ownViewport;
  // Hysteresis regime; declared before the refit below (rather than nearer
  // where `ratio`/`next` are computed) so a spec/box swap can reset it in
  // the same render-phase adjustment that resets `viewport`, not just `viewport` alone.
  const [regime, setRegime] = useState<Regime>(() => regimeAt(1, thresholds, "far", tuning.hysteresis));
  // Refit during render, not an effect, so no frame is ever painted with the
  // new spec (or the first known box) at a stale viewport. `fitBasis` stays
  // `null` until `ready`, so nothing here runs before the first size.
  //
  // A spec change always refits: the new viewport is exactly the fresh fit,
  // so its ratio is always 1 — reset the regime the same way a fresh mount
  // would compute it, or a regime whose hysteresis exit band was sized for
  // the OLD corpus's ratio can carry over onto a new corpus where it should
  // have released (e.g. a wide hysteresis and a nearAt close to 1 —
  // reproduced with `{ nearAt: 1.02 }`, `hysteresis: 0.3`: swapping specs
  // while "near" left the regime stuck "near" on the new corpus's fitted
  // view). The first known size is treated the same way (`fitBasis === null`
  // is indistinguishable from a spec swap: both need a fresh fit and a fresh
  // regime).
  //
  // A box-only change (showcase Task 2; unified across both box sources in
  // fix round 1, per the controller's binding ruling) keeps `viewport.scale` and
  // keeps the world point that was at the old box's centre at the new box's
  // centre (`recenterOnBoxChange`), and does not reset the regime — the
  // view, hysteresis included, is kept — whether the box came from explicit
  // `width`/`height` props or from the measurement. "Behaviour as today"
  // for explicit props (spec 4 §1's first bullet) means only that there is
  // no observer and the props win the *source* of the box; it does not mean
  // every later change to those props refits, which is exactly the "window
  // being resized" case the same section's second bullet motivates — a
  // consumer who measures their own container and threads the numbers
  // through as props is that case, not a different one. A consumer who
  // wants a refit after a box change calls `fit()` on the handle obtained
  // through the `ref` prop (`CorpusMapHandle`, showcase Task 3).
  //
  // Controlled (spec slice C §4): the library never moves the view on its
  // own. A new spec leaves the drawn view where the prop puts it, and an
  // effect below proposes the fit with `reason: "spec"`; a box change needs
  // nothing here, since `controlledViewport` keeps the public zoom against
  // the new fit. The first spec opens on `defaultViewport` when it is valid.
  const [fitBasis, setFitBasis] = useState<{ spec: MapSpec; width: number; height: number } | null>(
    ready ? { spec, width, height } : null,
  );
  // Counts refits (a spec swap here, `fit()` on the handle) so
  // `onViewChange` fires after each one even when the refitted view reads
  // the same as the one before (spec 4 §1 counts a refit as a committed
  // view change; the demo clears its indicator on a corpus switch and
  // waits for that call).
  const [refits, setRefits] = useState(0);
  // Counts spec swaps after the first, for the `"spec"` proposal below.
  const [specChanges, setSpecChanges] = useState(0);
  if (ready) {
    if (fitBasis === null || fitBasis.spec !== spec) {
      setFitBasis({ spec, width, height });
      if (fitBasis !== null) setSpecChanges((count) => count + 1);
      if (!viewportControlled) {
        if (fitBasis !== null) setRefits((count) => count + 1);
        const initial = fitBasis === null ? startingView(properties.defaultViewport, fitted, width, height) : fitted;
        setOwnViewport(initial);
        setRegime(regimeAt(initial.scale / fitted.scale, thresholds, "far", tuning.hysteresis));
      }
    } else if (fitBasis.width !== width || fitBasis.height !== height) {
      setFitBasis({ spec, width, height });
      if (!viewportControlled)
        setOwnViewport(recenterOnBoxChange(ownViewport, fitBasis.width, fitBasis.height, width, height));
    }
  }
  const fitScaleReference = useRef(fitScale);
  useEffect(() => {
    fitScaleReference.current = fitScale;
  }, [fitScale]);
  const tuningReference = useRef(tuning);
  useEffect(() => {
    tuningReference.current = tuning;
  }, [tuning]);
  // One gate for every view change (spec slice C §5). Reads refs only, so it
  // is stable and safe inside the `[]` wheel listener and the rAF flush.
  // `requestedReference` holds the last request since the last commit, so
  // two updaters before a re-render compose instead of the second one
  // basing on the stale drawn view; every commit clears it, so a consumer
  // that ignores a request is asked again from what is actually drawn.
  const drawnReference = useRef({ viewport, fitScale, width, height, controlled: viewportControlled });
  const requestedReference = useRef<Viewport | null>(null);
  // A regime reset (a fit) proposed to a controlled consumer, applied once the
  // drawn view is that fit: the regime follows the drawn view (spec slice C §4).
  const pendingResetReference = useRef<{ view: MapViewport; reset: RegimeReset } | null>(null);
  const onViewportChangeReference = useRef(properties.onViewportChange);
  useLayoutEffect(() => {
    onViewportChangeReference.current = properties.onViewportChange;
    drawnReference.current = { viewport, fitScale, width, height, controlled: viewportControlled };
    requestedReference.current = null;
  });
  useLayoutEffect(() => {
    const pendingReset = pendingResetReference.current;
    if (pendingReset && sameView(toPublic(viewport, fitScale, width, height), pendingReset.view)) {
      pendingResetReference.current = null;
      setRegime(pendingReset.reset.regime);
      if (pendingReset.reset.refit) setRefits((count) => count + 1);
    }
  }, [viewport, fitScale, width, height]);
  const requestViewport = useCallback((update: ViewportUpdate, reason: ViewportChangeReason, reset?: RegimeReset) => {
    const drawn = drawnReference.current;
    const base = requestedReference.current ?? drawn.viewport;
    const target = typeof update === "function" ? update(base) : update;
    const view = toPublic(target, drawn.fitScale, drawn.width, drawn.height);
    const same = sameView(view, toPublic(base, drawn.fitScale, drawn.width, drawn.height));
    const applyReset = (applied: RegimeReset) => {
      setRegime(applied.regime);
      if (applied.refit) setRefits((count) => count + 1);
    };
    if (drawn.controlled) {
      if (reset === undefined) pendingResetReference.current = null;
      else if (same) applyReset(reset);
      else pendingResetReference.current = { view, reset };
    } else {
      if (!same) setOwnViewport(target);
      if (reset !== undefined) applyReset(reset);
    }
    if (same) return;
    requestedReference.current = target;
    onViewportChangeReference.current?.(view, { reason });
  }, []);
  // A new spec proposes the fresh fit (spec slice C §4), after the commit so
  // the consumer's callback never runs during render. Deduped on the counter,
  // so StrictMode's second effect run and a box change never re-emit; the
  // first spec is not a change (`specChanges` starts at 0). Controlled, the
  // regime resets once the consumer draws that fit: now, if the drawn view
  // already is that fit (the view's own layout effect has run by now), else
  // through `pendingResetReference`.
  const firedSpecChange = useRef(0);
  useEffect(() => {
    if (specChanges === 0 || firedSpecChange.current === specChanges) return;
    firedSpecChange.current = specChanges;
    const fitPublic = toPublic(fitted, fitted.scale, width, height);
    if (viewportControlled) {
      const reset = { regime: regimeAt(1, thresholds, "far", tuning.hysteresis), refit: true };
      const drawn = drawnReference.current;
      if (sameView(fitPublic, toPublic(drawn.viewport, drawn.fitScale, drawn.width, drawn.height))) {
        pendingResetReference.current = null;
        setRegime(reset.regime);
        setRefits((count) => count + 1);
      } else pendingResetReference.current = { view: fitPublic, reset };
    }
    onViewportChangeReference.current?.(fitPublic, { reason: "spec" });
  }, [specChanges, fitted, width, height, viewportControlled, thresholds, tuning.hysteresis]);
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Press | null>(null);
  const pending = useRef<Pending | null>(null);
  // A world point from a minimap press/drag (showcase Task 4), flushed in
  // the same rAF-coalesced frame as `pending`'s drag delta, through the same
  // `requestViewport` — never its own, separately-scheduled commit.
  const pendingCentre = useRef<{ wx: number; wy: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  // The pointer's latest surface-relative position while not pressed,
  // awaiting resolution in the same animation-frame flush as a drag's
  // accumulated pan (metric 13: resolving it synchronously in the move
  // handler instead would cost one commit per move).
  const hoverPoint = useRef<HoverPosition | null>(null);
  // Mirrors `hover` for the frame-flush closure below, which is created at
  // schedule time (the first move of a burst) and so cannot see a `hover`
  // update from a *later* frame in the same burst via its own closed-over
  // `hover` variable. Read, never written, inside the flush; a plain
  // `setHover(newObject)` there — even when `newObject` is deeply equal to
  // the current hover — creates a new object every call, which is never
  // `Object.is`-equal to the current state, so React never bails out and a
  // hover held steady over one node still costs a commit every frame.
  // Comparing against this ref's fields instead, and skipping the call
  // entirely when they match, is what keeps a steady hover — the pointer
  // staying within radius of the same point across several frames — at
  // zero commits.
  // Mirrored in a layout effect, inside the commit: a passive effect would
  // leave a gap after a commit that unmounts the balloon, in which a frame
  // still sees the old territories and places a balloon that is gone.
  const hoverReference = useRef<HoverState | null>(null);
  useLayoutEffect(() => {
    hoverReference.current = hover;
  }, [hover]);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) window.cancelAnimationFrame(rafId.current);
    };
  }, []);

  const ratio = viewport.scale / fitScale;
  // Hysteresis regime, adjusted during render (the same pattern as the
  // refit above): a finer regime is entered at its threshold and left only
  // once the ratio falls a fraction `hysteresis` below it, so an oscillating
  // zoom never mounts and unmounts cards on every tick. `next` — not the
  // (possibly stale, about-to-be-discarded) `regime` state — is what this
  // pass renders and paints.
  const next = regimeAt(ratio, thresholds, regime, tuning.hysteresis);
  if (next !== regime) setRegime(next);
  const presentation = resolvePresentation(properties.presentation ?? "auto", next);
  // A wheel zoom can leave the mid/near regimes without any further pointer
  // move to trigger the frame-flush clear below — adjusted here, during
  // render, so a stale hover name never has a frame where it is visibly
  // shown at the wrong regime, and never lingers to reappear untested for
  // proximity if the ratio zooms back in without a fresh move.
  // Only a point name: a territory balloon is valid in every regime.
  if (next !== "mid" && next !== "near" && hover?.kind === "point") setHover(null);

  // Keyboard focus in the accessible tree, drawn on the canvas (its buttons
  // are visually hidden). Territory buttons are listed only below the near
  // regime and item buttons only at it, so each id is painted only in the
  // regime where its button can exist — a regime change never leaves a stale
  // highlight for a frame while the tree catches up.
  const [focusedTerritory, setFocusedTerritory] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const paintedTerritoryFocus = next === "near" ? null : focusedTerritory;
  const paintedNodeFocus = next === "near" ? focusedNode : null;

  const pointAlpha = fade(ratio, thresholds.midAt, tuning.fadeBand);
  const groupAlpha = groupNameAlpha(ratio, next, {
    midAt: thresholds.midAt,
    groupNamesUntil: tuning.groupNamesUntil,
    fadeBand: tuning.fadeBand,
    hysteresis: tuning.hysteresis,
  });
  const cardOpacity = fade(ratio, thresholds.nearAt, tuning.fadeBand);

  // The dimmed set enters memoisation as one key (JSON, so no id can collide
  // with a separator), filtered to this spec's territories: a fresh array
  // literal with the same ids repaints nothing, and unknown ids vanish.
  const [uncontrolledHidden, setUncontrolledHidden] = useState<readonly string[]>(
    () => properties.defaultHiddenTerritories ?? [],
  );
  const controlled = properties.hiddenTerritories !== undefined;
  const requestedHidden = properties.hiddenTerritories ?? uncontrolledHidden;
  const territoryIds = useMemo(() => new Set(spec.territories.map((territory) => territory.id)), [spec]);
  const hiddenKey = JSON.stringify([...new Set(requestedHidden.filter((id) => territoryIds.has(id)))].sort());
  const dimmed = useMemo<ReadonlySet<string>>(
    () => (hiddenKey === "[]" ? NO_DIMMED : new Set(JSON.parse(hiddenKey) as string[])),
    [hiddenKey],
  );
  // A territory dimmed while it is named, from the legend or by a controlled
  // consumer, drops the name in this same render (spec categories §5): no
  // pointer move is coming to re-resolve it while the pointer is elsewhere.
  if (
    hover !== null &&
    dimmed.size > 0 &&
    (hover.kind === "territories"
      ? hover.ids.some((id) => dimmed.has(id))
      : dimmed.has(nodesById.get(hover.id)?.territory ?? ""))
  )
    setHover(null);
  // The spec without dimmed territories' points: what cards, the accessible
  // tree, hover and `visibleCount` read. Painting keeps the whole spec.
  const liveSpec = useMemo(
    () =>
      dimmed.size === 0
        ? spec
        : { ...spec, nodes: spec.nodes.filter((node) => node.territory === null || !dimmed.has(node.territory)) },
    [spec, dimmed],
  );
  // Selection (spec slice C §3): requested by the prop or own state; the
  // effective id is that of a live node, else null, so a dimmed or absent
  // item is neither drawn nor marked, and comes back when shown again.
  const selectionControlled = properties.selectedId !== undefined;
  const [ownSelected, setOwnSelected] = useState<string | null>(properties.defaultSelectedId ?? null);
  const requestedSelection = selectionControlled ? (properties.selectedId ?? null) : ownSelected;
  const selectedNode = requestedSelection === null ? undefined : nodesById.get(requestedSelection);
  const selected =
    selectedNode && (selectedNode.territory === null || !dimmed.has(selectedNode.territory)) ? selectedNode.id : null;
  const requestedSelectionReference = useRef(requestedSelection);
  const selectionControlledReference = useRef(selectionControlled);
  const onSelectedChangeReference = useRef(properties.onSelectedChange);
  useLayoutEffect(() => {
    requestedSelectionReference.current = requestedSelection;
    selectionControlledReference.current = selectionControlled;
    onSelectedChangeReference.current = properties.onSelectedChange;
  });
  const requestSelection = useCallback((id: string | null) => {
    if (id === requestedSelectionReference.current) return;
    requestedSelectionReference.current = id;
    if (!selectionControlledReference.current) setOwnSelected(id);
    onSelectedChangeReference.current?.(id);
  }, []);
  const onHiddenChangeReference = useRef(properties.onHiddenTerritoriesChange);
  useEffect(() => {
    onHiddenChangeReference.current = properties.onHiddenTerritoriesChange;
  });
  const onHiddenChange = useCallback(
    (ids: string[]) => {
      if (!controlled) setUncontrolledHidden(ids);
      onHiddenChangeReference.current?.(ids);
    },
    [controlled],
  );

  // `onViewChange`'s node count: on-screen, uncapped — like the hover
  // hit-test's own `visibleNodes(..., Infinity)` call above, not the
  // cards/tree's `cardCap`-limited one, so a consumer's indicator reads the
  // same count a maxed-out card cap would otherwise hide (showcase Task 3).
  const visibleCount = ready ? visibleNodes(liveSpec, viewport, width, height, Number.POSITIVE_INFINITY).length : 0;

  // `false`/absent (no prop, or `minimap={false}`) are identical: no corner,
  // no `Minimap`. `true` picks the default corner; `{ corner }` picks that
  // one (spec 4 §1).
  const minimapCorner: MinimapCorner | null =
    properties.minimap === true ? "bottom-left" : properties.minimap ? properties.minimap.corner : null;
  const legendRequest: MinimapCorner | null =
    properties.legend === true ? "top-left" : properties.legend ? properties.legend.corner : null;
  const legendPlacement = legendRequest === null ? null : legendCorner(legendRequest, minimapCorner);
  const legendList = useMemo(
    () => legendEntries(spec.territories, scene.colours, theme.pointNeutral),
    [spec, scene, theme.pointNeutral],
  );
  // The legend is memoised: every prop below keeps its identity across a pan
  // that leaves the on-screen set alone. The on-screen list is recomputed
  // each render (linear over precomputed boxes) and keyed by its content.
  const onScreenKey = JSON.stringify(onScreenTerritories(scene.bounds, viewport, width, height));
  const onScreen = useMemo<ReadonlySet<string>>(() => new Set(JSON.parse(onScreenKey) as string[]), [onScreenKey]);
  const legendTheme = useMemo(
    () => ({
      cardBackground: theme.cardBackground,
      cardBorder: theme.cardBorder,
      territoryLabel: theme.territoryLabel,
      pointNeutral: theme.pointNeutral,
    }),
    [theme.cardBackground, theme.cardBorder, theme.territoryLabel, theme.pointNeutral],
  );
  // Same zoom band as a manual zoom; a territory with no drawable ring has nothing to zoom to.
  const onLegendEntry = (id: string) => {
    const bounds = ringBounds(scene.shapes.get(id) ?? []);
    if (bounds === null) return;
    requestViewport(
      fitClamped(bounds, width, height, FIT_PADDING, fitScale / MAXIMUM_ZOOM_OUT, fitScale * MAXIMUM_ZOOM_IN),
      "interaction",
    );
  };
  // Lands in near by construction (spec slice B §5, amended): the loose
  // nodes' box at no less than the scale a territory button zooms to. A box
  // too wide for that scale would centre on its middle, which may hold no
  // loose node at all; then the view centres on the loose node nearest that
  // middle instead, so the reader always lands on one.
  const onUnassigned = () => {
    const loose = liveSpec.nodes.filter((node) => node.territory === null);
    if (loose.length === 0) return;
    const bounds = boundsOf(loose.map((node) => [node.x, node.y] as const));
    const nearScale = fitScale * thresholds.nearAt * (1 + tuning.fadeBand);
    const view = fitClamped(bounds, width, height, FIT_PADDING, nearScale, fitScale * MAXIMUM_ZOOM_IN);
    if (fitBounds(bounds, width, height, FIT_PADDING).scale >= nearScale) {
      requestViewport(view, "interaction");
      return;
    }
    const middleHorizontal = (bounds.minX + bounds.maxX) / 2;
    const middleVertical = (bounds.minY + bounds.maxY) / 2;
    const distance = (node: (typeof loose)[number]) => Math.hypot(node.x - middleHorizontal, node.y - middleVertical);
    const nearest = loose.reduce((best, node) => (distance(node) < distance(best) ? node : best));
    requestViewport(
      { scale: view.scale, tx: width / 2 - nearest.x * view.scale, ty: height / 2 - nearest.y * view.scale },
      "interaction",
    );
  };
  const onLegendEntryReference = useRef(onLegendEntry);
  useEffect(() => {
    onLegendEntryReference.current = onLegendEntry;
  });
  const stableOnLegendEntry = useCallback((id: string) => onLegendEntryReference.current(id), []);
  const world = useMemo(() => sceneBounds(spec, scene.shapes), [spec, scene]);
  // The main view's own world-space bounding rectangle, in world units —
  // what the minimap draws its view rectangle from, and a dependency of its
  // paint effect (`Minimap.tsx`). The two `toWorld` calls are cheap, but the
  // *object* they build is not something to key an effect on by identity
  // (fix round 1, finding 2 — the project's own rule: never key an
  // expensive memo or effect on an object's identity, key on the values
  // used): `viewport` is minted fresh by every view change, including ones an
  // unrelated commit (a hover update, a freshly-literal `theme`/`tuning`
  // prop) never touches, so a plain object literal here changed identity —
  // and re-triggered the minimap's whole repaint — on every commit, not
  // just ones where the view actually moved. Memoized on the four
  // primitives themselves, so the minimap only repaints when `x`/`y`/`w`/`h`
  // actually changed.
  const [viewX0, viewY0] = toWorld(viewport, 0, 0);
  const [viewX1, viewY1] = toWorld(viewport, width, height);
  const viewWorld = useMemo(
    () => ({ x: viewX0, y: viewY0, w: viewX1 - viewX0, h: viewY1 - viewY0 }),
    [viewX0, viewY0, viewX1, viewY1],
  );

  useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) return;
    // Backing store in device pixels; the CSS box stays `width` x `height`.
    // Assigning `width` resets the bitmap, so only touch it when it changes.
    const dpr = window.devicePixelRatio ?? 1;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(
      canvasSurface(context),
      scene,
      spec,
      viewport,
      {
        regime: next,
        pointAlpha,
        width,
        height,
        focusedTerritory: paintedTerritoryFocus,
        focusedNode: paintedNodeFocus,
        presentation,
        groupAlpha,
        dimmed,
        selected,
      },
      theme,
    );
  }, [
    spec,
    scene,
    viewport,
    next,
    pointAlpha,
    theme,
    width,
    height,
    paintedTerritoryFocus,
    paintedNodeFocus,
    presentation,
    groupAlpha,
    dimmed,
    selected,
  ]);

  // Latest callback in a ref so an inline arrow prop does not re-fire the
  // event on every render; the effect fires on mount (so the consumer learns
  // the initial regime) and then only when the regime actually changes.
  // Gated on `ready`: before the first measured size there is no real regime
  // yet (`next` is computed from the box's 0-fallback), and firing then
  // would hand a measured-mode consumer a bogus value before the map has
  // ever painted anything.
  const onRegimeChangeReference = useRef(onRegimeChange);
  useEffect(() => {
    onRegimeChangeReference.current = onRegimeChange;
  });
  // The last regime handed to the consumer: StrictMode runs every effect
  // twice on mount in dev, and a box that collapses to zero and comes back
  // flips `ready` off and on again, and neither is a regime crossing. A
  // remount by `key` is a fresh instance with a fresh ref, so it still fires.
  const firedRegime = useRef<Regime | null>(null);
  useEffect(() => {
    if (!ready || firedRegime.current === next) return;
    firedRegime.current = next;
    onRegimeChangeReference.current?.(next);
  }, [next, ready]);

  // Latest callback in a ref, same pattern as `onRegimeChangeReference` just
  // above: an inline arrow prop (the demo's indicator will pass one) must
  // not re-fire the effect below just because its identity changed. Fires
  // once on mount (`ready` gate, same reasoning as `onRegimeChange`), then
  // again when `next`/`ratio`/`visibleCount` differ from the previous
  // commit's, or after a refit (`refits`). Being tied to commits is what
  // keeps it to at most once per animation frame during a drag: the drag's
  // own accumulated pan is already flushed into a single `requestViewport` per frame
  // (metric 13), so there is at most one commit per frame for this effect
  // to react to.
  const onViewChangeReference = useRef(onViewChange);
  useEffect(() => {
    onViewChangeReference.current = onViewChange;
  });
  // Same dedupe as `firedRegime`, keyed on every dependency that can fire
  // it: `refits` is in the key, so a refit that lands on an identical view
  // still fires once, and a StrictMode re-run of the same commit does not.
  const firedView = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const key = `${next}|${ratio}|${visibleCount}|${refits}|${presentation}`;
    if (firedView.current === key) return;
    firedView.current = key;
    onViewChangeReference.current?.({ regime: next, ratio, visibleCount, presentation });
  }, [next, ratio, visibleCount, ready, refits, presentation]);

  const zoomStep = (direction: "in" | "out") => {
    const factor = wheelZoomFactor({ deltaY: direction === "in" ? -120 : 120, deltaMode: 0, ctrlKey: false }, tuning);
    requestViewport((previous) => {
      const target = zoomStepScale(previous.scale, factor, fitScale, MAXIMUM_ZOOM_OUT, MAXIMUM_ZOOM_IN);
      return zoomTo(previous, width / 2, height / 2, target);
    }, "interaction");
  };
  // Resets the regime hysteresis the same way a `spec` change does (the
  // `fitBasis` branch above): a fit is an explicit "back to the
  // overview" action, landing the ratio back at exactly 1, and a regime
  // that merely carried its hysteresis band over from wherever the user
  // had zoomed to could stay "near"/"mid" even though the view is back
  // at the fitted one — the same staleness the `fitBasis` comment
  // documents for a corpus swap, reproduced here by an explicit fit
  // instead of a new spec (see this file's `.handle.test.tsx`). Controlled,
  // the reset waits in the gate until the consumer draws the fit. `reason`
  // is "fit" for an explicit fit (the handle, the fit key, back to overview)
  // and "interaction" when Escape's regime-out happens to land on the fit.
  const fitView = (reason: ViewportChangeReason = "fit") => {
    requestViewport(fitted, reason, { regime: regimeAt(1, thresholds, "far", tuning.hysteresis), refit: true });
  };

  // React 19 ref-as-prop (spec 4 §1): no deps array, so the handle is
  // rebuilt every commit and its closures — `viewport`/`fitScale`/`fitted`/
  // `tuning`/`width`/`height`/`thresholds` — are always the ones from the
  // render that just committed, never a stale render from before a spec or
  // box change. `zoomStep` uses `requestViewport`'s functional-update form
  // (not the closed-over `viewport` directly) so a burst of calls made between
  // renders — the showcase's zoom button held down, or this file's own
  // 200-calls test — each sees the previous call's result, not the same
  // pre-burst `viewport` 200 times over.
  useImperativeHandle(handleReference, () => ({
    zoomIn: () => zoomStep("in"),
    zoomOut: () => zoomStep("out"),
    fit: () => fitView("fit"),
    focus: () => rootReference.current?.focus(),
  }));

  // Spoken once keyboard movement settles, so a held arrow key does not
  // speak on every step; `visibleCountReference` is read when the timer
  // fires, i.e. after the last movement's commit.
  const [countAnnouncement, setCountAnnouncement] = useState("");
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleCountReference = useRef(0);
  useEffect(() => {
    visibleCountReference.current = visibleCount;
  });
  useEffect(
    () => () => {
      if (countTimer.current !== null) clearTimeout(countTimer.current);
    },
    [],
  );
  const scheduleCountAnnouncement = () => {
    if (countTimer.current !== null) clearTimeout(countTimer.current);
    setCountAnnouncement("");
    countTimer.current = setTimeout(() => {
      countTimer.current = null;
      const count = visibleCountReference.current;
      setCountAnnouncement(`${count} ${count === 1 ? "item" : "items"} in view`);
    }, COUNT_ANNOUNCEMENT_DELAY);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only the surface's own keys: the tree, legend and minimap inside it keep theirs.
    if (event.target !== event.currentTarget) return;
    const command = keyboardCommand(event);
    if (command === null) return;
    if (command.kind === "regimeOut") {
      // Escape in layers (spec slice C §5): the innermost thing closes first.
      if (selected !== null) {
        requestSelection(null);
        event.preventDefault();
        return;
      }
      const target = regimeOutRatio(next, ratio, thresholds);
      if (target === null) return;
      if (target === 1) fitView("interaction");
      else
        requestViewport((previous) => zoomTo(previous, width / 2, height / 2, fitScale * target), "interaction", {
          regime: regimeAt(target, thresholds, "far", tuning.hysteresis),
          refit: false,
        });
    } else if (command.kind === "fit") fitView("fit");
    else if (command.kind === "zoom") zoomStep(command.direction);
    else
      requestViewport(
        (previous) => panBy(previous, -command.horizontal * width, -command.vertical * height),
        "interaction",
      );
    event.preventDefault();
    setSurfaceFocusVisible(true);
    if (hoverReference.current !== null) setHover(null);
    scheduleCountAnnouncement();
  };

  // Native, non-passive listener: React's `onWheel` is registered passive, so
  // `preventDefault` there cannot stop the page from scrolling under the map.
  useEffect(() => {
    const element = rootReference.current;
    if (!element) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      // The legend scrolls its own list when it overflows a short map.
      if (event.target instanceof Element && event.target.closest("[data-legend]")) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = wheelZoomFactor(
        { deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey },
        tuningReference.current,
      );
      requestViewport((previous) => {
        const fit = fitScaleReference.current;
        const target = zoomStepScale(previous.scale, factor, fit, MAXIMUM_ZOOM_OUT, MAXIMUM_ZOOM_IN);
        return zoomTo(previous, event.clientX - rect.left, event.clientY - rect.top, target);
      }, "interaction");
      // A wheel zoom moves every on-screen point, so a hover name resolved
      // against the pre-zoom viewport is now anchored to the wrong screen
      // position; there is no guarantee of a further pointer move to
      // trigger a fresh resolution (I2). Clearing it here, rather than
      // waiting for one, means the next move — or the render-phase regime
      // check above — is what decides whether a hover reappears, never a
      // stale one left over from before the zoom.
      if (hoverReference.current !== null) setHover(null);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [requestViewport]);

  // A press anywhere inside the root, including the minimap and the legend
  // that stop the event before it bubbles here, marks the focus it causes as
  // pointer focus. That focus lands synchronously after the press, so the
  // mark lasts one task: a later keyboard focus still shows the ring.
  const onPointerDownCapture = () => {
    pointerFocus.current = true;
    setTimeout(() => {
      pointerFocus.current = false;
    }, 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return;
    drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
    (event.target as Element).setPointerCapture?.(event.pointerId);
    // Pressing clears the hover name: a scheduled frame from just before the
    // press could still be in flight, so this also drops the queued point,
    // not just the rendered state. Guarded on the current value, not just
    // called unconditionally: React's same-value bail-out for a `useState`
    // setter only skips the *render*, not the dispatch itself, and an
    // unconditional call here — even when hover is already null — was
    // measured to surface as a spurious extra commit later in the same
    // pointer-move burst (metric 13's own test, before this guard).
    hoverPoint.current = null;
    if (hover !== null) setHover(null);
  };

  // The topmost card under a client position, or null; a card below opacity
  // 0.1 is invisible but still mounted (the hysteresis fade band keeps it in
  // the DOM at opacity 0), so it neither takes a click on what the user sees
  // as empty map (C2) nor hides the territory balloon there.
  const visibleCardAt = (clientHorizontal: number, clientVertical: number): string | null =>
    cardOpacity < 0.1 ? null : cardIdAt(rootReference.current, clientHorizontal, clientVertical);

  const tooltipReference = useRef<HTMLDivElement | null>(null);
  // A layout effect, so the first paint of a new balloon is already placed;
  // keyed on `hover` so an unrelated commit never snaps a balloon that
  // `resolveHover` moved imperatively back to where it was first shown.
  useLayoutEffect(() => {
    if (hover?.kind === "territories")
      placeTooltip(tooltipReference.current as HTMLDivElement, hover.x, hover.y, width, height);
  }, [hover, width, height]);

  // What the pointer names at `position` (spec categories §7): in mid and
  // near, the nearest visible point within the hover radius; otherwise —
  // in every regime — the undimmed territories under it, unless a card
  // covers that spot. Called by the frame flush for a mouse and directly by
  // a touch tap. Every branch compares against `hoverReference` and skips
  // `setHover` when nothing changed: a steady hover costs no commit
  // (metric 13), and a balloon over the same territories only moves.
  // The nearest visible point within the hover radius, in mid and near once
  // the points are visible enough to aim at; null elsewhere (at far there
  // are no points to hit). Shared by hover and by a press (spec slice C §3).
  const nearestPoint = (position: { x: number; y: number }) => {
    if ((next !== "mid" && next !== "near") || pointAlpha < 0.1) return null;
    // Uncapped, unlike the cards/tree's own `visibleNodes(..., cardCap)`
    // calls: the canvas paints every on-screen point regardless of the
    // card cap, so hover must be resolvable against all of them, not
    // just the first `cardCap` in spec order (C1) — otherwise most
    // on-screen points past the cap are silently unhoverable.
    const points = visibleNodes(liveSpec, viewport, width, height, Number.POSITIVE_INFINITY).map((node) => {
      const [left, top] = toScreen(viewport, node.x, node.y);
      return { id: node.id, x: left, y: top };
    });
    return nearestWithin(points, position.x, position.y, tuning.hoverRadius);
  };
  const pointNear = (position: { x: number; y: number }): string | null => nearestPoint(position)?.id ?? null;
  const resolveHover = (position: HoverPosition) => {
    const previousHover = hoverReference.current;
    const nearest = nearestPoint(position);
    if (nearest) {
      // Same node, same screen position as the currently shown hover:
      // skip the call rather than dispatch a freshly-allocated (but
      // deeply equal) object every frame the pointer holds still —
      // `Object.is` would never consider two such objects equal, so
      // React would never bail out and a steady hover would cost a
      // commit on every frame (see the `hoverReference` comment above).
      const same =
        previousHover?.kind === "point" &&
        previousHover.id === nearest.id &&
        previousHover.x === nearest.x &&
        previousHover.y === nearest.y;
      if (!same) {
        // `nearest.id` is always a key of `nodesById`: `points` was
        // built from `visibleNodes(liveSpec, ...)`, which only ever
        // returns `spec`'s own nodes.
        const label = (nodesById.get(nearest.id) as MapNode).label;
        setHover({ kind: "point", id: nearest.id, label, x: nearest.x, y: nearest.y });
      }
      return;
    }
    const ids =
      visibleCardAt(position.clientX, position.clientY) === null
        ? territoriesAt(scene, spec, toWorld(viewport, position.x, position.y), dimmed)
        : [];
    if (ids.length === 0) {
      if (previousHover !== null) setHover(null);
      return;
    }
    if (previousHover?.kind === "territories" && JSON.stringify(previousHover.ids) === JSON.stringify(ids)) {
      hoverReference.current = { ...previousHover, x: position.x, y: position.y };
      placeTooltip(tooltipReference.current as HTMLDivElement, position.x, position.y, width, height);
      return;
    }
    setHover({ kind: "territories", ids, x: position.x, y: position.y });
  };

  // Schedules the one rAF flush a burst of pointer moves, or a minimap
  // press/drag, coalesces into (metric 13) — both routes share this single
  // `rafId`, so a move and a minimap press arriving in the same frame still
  // cost one commit, through the same `requestViewport`. A no-op if a flush is
  // already pending.
  const scheduleFrame = () => {
    if (rafId.current !== null) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      const accumulated = pending.current;
      pending.current = null;
      if (accumulated) requestViewport((previous) => panBy(previous, accumulated.dx, accumulated.dy), "interaction");
      // A minimap press/drag (showcase Task 4): centres the main view on
      // the pressed world point through the very same `requestViewport` a drag pans
      // with, just landing on an absolute `tx`/`ty` instead of an
      // accumulated delta — so `onViewChange` reacts to it exactly as it
      // would to any other committed view change, with no separate wiring.
      const centre = pendingCentre.current;
      pendingCentre.current = null;
      if (centre) {
        requestViewport(
          (previous) => ({
            scale: previous.scale,
            tx: width / 2 - centre.wx * previous.scale,
            ty: height / 2 - centre.wy * previous.scale,
          }),
          "interaction",
        );
      }
      const hoverPosition = hoverPoint.current;
      // A press or a `pointerleave` already cleared `hover` synchronously at
      // its own call site, effects included, strictly before any
      // already-scheduled flush like this one can run; a drag never names.
      if (drag.current === null && hoverPosition) resolveHover(hoverPosition);
    });
  };

  // Pointer moves accumulate a drag delta, or (while not pressed) queue a
  // hover point; both are resolved at most once per animation frame, so a
  // burst of move events costs one React commit per frame, not one per
  // event (metric 13) — hover included, which is why it is resolved inside
  // the same scheduled callback below rather than with its own `setHover`
  // here in the handler.
  const onPointerMove = (event: PointerEvent) => {
    const press = drag.current;
    if (press) {
      const horizontalDelta = event.clientX - press.x;
      const verticalDelta = event.clientY - press.y;
      drag.current = { ...press, x: event.clientX, y: event.clientY };
      const queued = pending.current;
      pending.current = queued
        ? { dx: queued.dx + horizontalDelta, dy: queued.dy + verticalDelta }
        : { dx: horizontalDelta, dy: verticalDelta };
    } else {
      const rect = rootReference.current?.getBoundingClientRect();
      hoverPoint.current = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top, clientX: event.clientX, clientY: event.clientY }
        : null;
    }
    scheduleFrame();
  };

  // The minimap's press/drag callback (showcase Task 4): queues a world
  // point to centre on and reuses `scheduleFrame`, so it is frame-coalesced
  // and lands through the same `requestViewport` the drag above uses — never a
  // separate, uncoalesced view change of its own.
  const onMinimapPoint = (worldHorizontal: number, worldVertical: number) => {
    pendingCentre.current = { wx: worldHorizontal, wy: worldVertical };
    scheduleFrame();
  };

  const onPointerCancel = () => {
    drag.current = null;
  };

  // The legend and the minimap stop pointer moves, so the map never sees the
  // pointer arrive on them; entering either closes the hover here instead.
  const onPointerOver = (event: PointerEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-legend], [data-minimap]")) return;
    hoverPoint.current = null;
    if (hover !== null) setHover(null);
  };

  // A touch fires `pointerleave` right after `pointerup`, which would close
  // the balloon the tap just opened; a later press closes it instead.
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    hoverPoint.current = null;
    if (hover !== null) setHover(null);
  };

  // The card overlay is inert, so it cannot receive the click itself: a
  // press released within CLICK_SLOP of where it started is resolved here
  // against the visible cards' boxes. Topmost (last in DOM order) wins.
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const press = drag.current;
    drag.current = null;
    if (!press || Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > CLICK_SLOP) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    const cardId = visibleCardAt(event.clientX, event.clientY);
    const id = cardId ?? pointNear(position);
    requestSelection(id);
    const node = id === null ? undefined : nodesById.get(id);
    if (node && onSelect) onSelect(node);
    // A touch has no hover: a tap off a card names what is under it, the
    // way a mouse resting there would (spec categories §7).
    if (event.pointerType === "touch" && cardId === null) resolveHover(position);
  };

  // The hovered point's territory, named beside its label (spec categories §7).
  const pointNode = hover?.kind === "point" ? nodesById.get(hover.id) : undefined;
  const pointTerritory = pointNode?.territory ? territoriesById.get(pointNode.territory) : undefined;

  return (
    // biome-ignore lint/a11y/useSemanticElements: the root stays a div, its tag and ref type are public; a section would change both.
    <div
      ref={rootReference}
      data-map-surface=""
      data-focus-visible={surfaceFocusVisible ? "" : undefined}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the map region is the keyboard target for pan and zoom (spec slice B §4).
      tabIndex={0}
      role="region"
      aria-roledescription="map"
      aria-label={surfaceLabel}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        setSurfaceFocusVisible(!pointerFocus.current);
      }}
      onBlur={(event) => {
        if (event.target !== event.currentTarget) return;
        pointerFocus.current = false;
        setSurfaceFocusVisible(false);
      }}
      onKeyDown={onKeyDown}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onPointerOver={onPointerOver}
      style={{
        position: "relative",
        // Explicit props keep today's literal pixel box; without them the
        // root fills its parent (spec 4 §1) — a CSS percentage, not a value
        // frozen to the last measurement, so it keeps tracking the parent
        // and the `ResizeObserver` inside `useElementSize` keeps firing on
        // every future resize, not just the first one.
        width: explicitBox ? width : "100%",
        height: explicitBox ? height : "100%",
        touchAction: "none",
        outline: surfaceFocusVisible ? `${theme.focusOutlineWidth}px solid ${theme.focusOutline}` : "none",
        outlineOffset: -theme.focusOutlineWidth,
      }}
    >
      {ready ? (
        <>
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative — the accessible tree carries the real content and interaction; the canvas must stay hidden from AT regardless of default focusability. */}
          <canvas ref={canvasReference} aria-hidden="true" style={{ width, height, display: "block" }} />
          <CardOverlay
            spec={liveSpec}
            viewport={viewport}
            regime={next}
            cap={cardCap}
            width={width}
            height={height}
            cardSize={cardSize}
            opacity={cardOpacity}
            theme={theme}
            colours={scene.colours}
            renderCard={renderCard}
          />
          {hover?.kind === "point" ? (
            <div
              data-hover={hover.id}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${hover.x}px, ${hover.y - 8}px) translate(-50%, -100%)`,
                background: theme.hoverBackground,
                color: theme.hoverText,
                padding: "2px 6px",
                borderRadius: 4,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                font: "12px system-ui, sans-serif",
              }}
            >
              {pointTerritory ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    marginRight: 4,
                    background: scene.colours.get(pointTerritory.id) ?? theme.pointNeutral,
                  }}
                />
              ) : null}
              {pointTerritory ? `${hover.label} · ${pointTerritory.name}` : hover.label}
            </div>
          ) : null}
          {hover?.kind === "territories" ? (
            <div
              // A new set mounts a new balloon: rows re-laid out under a moving transform count as layout shifts.
              key={JSON.stringify(hover.ids)}
              ref={tooltipReference}
              data-hover-territories={hover.ids.join(" ")}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${hover.x + TOOLTIP_OFFSET}px, ${hover.y + TOOLTIP_OFFSET}px)`,
                background: theme.hoverBackground,
                color: theme.hoverText,
                padding: "4px 8px",
                borderRadius: 4,
                pointerEvents: "none",
                font: "12px system-ui, sans-serif",
                maxWidth: 260,
              }}
            >
              {hover.ids.slice(0, TOOLTIP_ROW_LIMIT).map((id) => (
                <div key={id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        flex: "none",
                        borderRadius: 2,
                        background: scene.colours.get(id) ?? theme.pointNeutral,
                      }}
                    />
                    <span>{territoriesById.get(id)?.name}</span>
                  </div>
                  {hover.ids.length === 1 ? <div>{itemCount(territoriesById.get(id)?.members.length ?? 0)}</div> : null}
                  {groupOf.has(id) ? <div style={{ opacity: GROUP_LINE_OPACITY }}>{groupOf.get(id)}</div> : null}
                </div>
              ))}
              {hover.ids.length > TOOLTIP_ROW_LIMIT ? (
                <div style={{ opacity: GROUP_LINE_OPACITY }}>{`+${hover.ids.length - TOOLTIP_ROW_LIMIT} more`}</div>
              ) : null}
            </div>
          ) : null}
          <AccessibleTree
            spec={liveSpec}
            regime={next}
            viewport={viewport}
            width={width}
            height={height}
            cap={cardCap}
            onFocusTerritory={(territory) => {
              // Built from the target scale directly rather than via a zoom
              // factor: `fitScale * (nearAt / (scale / fitScale))`-style paths
              // can land a float ulp below `fitScale * nearAt`, on the wrong
              // side of the threshold; `regimeAt`'s tolerance covers the
              // residual ulp of this multiply. Landing on `nearAt` itself would
              // put the cards at exactly fade 0 (I1: `fade` is 0 AT its
              // threshold, ramping to 1 only above it) — invisible cards right
              // after the one keyboard/AT action meant to show them. Landing a
              // full fade band above `nearAt` instead puts the fade at 1, same
              // as any other zoom past the top of the band; clamped to the same
              // wheel band a manual zoom is clamped to, so this can never land
              // outside what the user could otherwise reach.
              const [centreHorizontal, centreVertical] = territory.centroid;
              const target = fitScale * thresholds.nearAt * (1 + tuning.fadeBand);
              const scale = Math.min(fitScale * MAXIMUM_ZOOM_IN, Math.max(fitScale / MAXIMUM_ZOOM_OUT, target));
              requestViewport(
                { scale, tx: width / 2 - centreHorizontal * scale, ty: height / 2 - centreVertical * scale },
                "interaction",
              );
            }}
            onSelect={(node) => {
              requestSelection(node.id);
              onSelect?.(node);
            }}
            selectedId={selected}
            groups={scene.groups}
            hidden={dimmed}
            heading={headingTag}
            theme={theme}
            onOverview={() => fitView("fit")}
            onUnassigned={onUnassigned}
            onFocusFallback={() => rootReference.current?.focus()}
            onTerritoryFocusChange={setFocusedTerritory}
            onNodeFocusChange={setFocusedNode}
          />
          <div
            role="status"
            data-count-announcement=""
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
          >
            {countAnnouncement}
          </div>
          {minimapCorner ? (
            <Minimap
              scene={scene}
              world={world}
              view={viewWorld}
              corner={minimapCorner}
              theme={theme}
              onPoint={onMinimapPoint}
            />
          ) : null}
          {legendPlacement ? (
            <Legend
              entries={legendList}
              groups={scene.groups}
              onScreen={onScreen}
              hidden={dimmed}
              presentation={presentation}
              corner={legendPlacement}
              theme={legendTheme}
              narrow={width < 480}
              heading={headingTag}
              onEntry={stableOnLegendEntry}
              onHiddenChange={onHiddenChange}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
