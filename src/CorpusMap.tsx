import {
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibleTree } from "./a11y/AccessibleTree";
import { CardOverlay, DEFAULT_CARD_SIZE } from "./cards/CardOverlay";
import { useMeasure } from "./labels/useMeasure";
import { legendCorner, legendEntries } from "./legend/entries";
import { Legend } from "./legend/Legend";
import { type LodThresholds, type Regime, resolveThresholds } from "./lod/lod";
import { fade, regimeAt } from "./lod/regime";
import { visibleNodes } from "./lod/visible";
import { Minimap, type MinimapCorner } from "./minimap/Minimap";
import { nearestWithin } from "./points/hover";
import { paint } from "./shared/paint";
import { type Presentation, type PresentationSetting, resolvePresentation } from "./shared/presentation";
import { buildScene } from "./shared/scene";
import { type MapNode, type MapSpec, validateSpec } from "./shared/spec";
import { canvasSurface } from "./shared/surface";
import { DEFAULT_THEME, type Theme } from "./shared/theme";
import { resolveTuning, type Tuning } from "./shared/tuning";
import { fitClamped, ringBounds, sceneBounds } from "./viewport/fit";
import { fitScene } from "./viewport/fitScene";
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

interface Press {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

/** Accumulated, not-yet-applied drag delta, flushed once per animation frame. */
interface Pending {
  dx: number;
  dy: number;
}

/** The nearest node to the pointer, resolved and rendered as a small label above its point. */
interface HoverState {
  id: string;
  label: string;
  x: number;
  y: number;
}

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
  // Not memoized: `layoutCards` is cheap and already recomputed every render
  // inside `CardOverlay`, so keying a memo on this object's identity would
  // only add a stale-dependency risk (Task 7's lesson) for no benefit.
  const cardSize = properties.cardSize ?? DEFAULT_CARD_SIZE;
  const theme = properties.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((node) => [node.id, node])), [spec]);

  const rootReference = useRef<HTMLDivElement>(null);
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

  const [viewport, setViewport] = useState<Viewport>(() => fitScene(spec, scene, width, height, FIT_PADDING));
  // A theme or font change rebuilds the scene and so moves `fitted` (and
  // `fitScale`, `ratio`) without refitting the view: only a new `spec` refits.
  const fitted = useMemo(() => fitScene(spec, scene, width, height, FIT_PADDING), [spec, scene, width, height]);
  const fitScale = fitted.scale;
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
  const [fitBasis, setFitBasis] = useState<{ spec: MapSpec; width: number; height: number } | null>(
    ready ? { spec, width, height } : null,
  );
  // Counts refits (a spec swap here, `fit()` on the handle) so
  // `onViewChange` fires after each one even when the refitted view reads
  // the same as the one before (spec 4 §1 counts a refit as a committed
  // view change; the demo clears its indicator on a corpus switch and
  // waits for that call).
  const [refits, setRefits] = useState(0);
  if (ready) {
    if (fitBasis === null || fitBasis.spec !== spec) {
      setFitBasis({ spec, width, height });
      if (fitBasis !== null) setRefits((count) => count + 1);
      setViewport(fitted);
      setRegime(regimeAt(1, thresholds, "far", tuning.hysteresis));
    } else if (fitBasis.width !== width || fitBasis.height !== height) {
      setFitBasis({ spec, width, height });
      setViewport(recenterOnBoxChange(viewport, fitBasis.width, fitBasis.height, width, height));
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
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Press | null>(null);
  const pending = useRef<Pending | null>(null);
  // A world point from a minimap press/drag (showcase Task 4), flushed in
  // the same rAF-coalesced frame as `pending`'s drag delta, through the same
  // `setViewport` — never its own, separately-scheduled commit.
  const pendingCentre = useRef<{ wx: number; wy: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  // The pointer's latest surface-relative position while not pressed,
  // awaiting resolution in the same animation-frame flush as a drag's
  // accumulated pan (metric 13: resolving it synchronously in the move
  // handler instead would cost one commit per move).
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);
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
  const hoverReference = useRef<HoverState | null>(null);
  useEffect(() => {
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
  if (next !== "mid" && next !== "near" && hover !== null) setHover(null);

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
  // Group names hold the far map below `groupNamesUntil` and cross-fade to
  // territory names over `fadeBand` above it; outside far, never.
  const groupAlpha = next === "far" ? 1 - fade(ratio, tuning.groupNamesUntil, tuning.fadeBand) : 0;
  const cardOpacity = fade(ratio, thresholds.nearAt, tuning.fadeBand);

  // `onViewChange`'s node count: on-screen, uncapped — like the hover
  // hit-test's own `visibleNodes(..., Infinity)` call above, not the
  // cards/tree's `cardCap`-limited one, so a consumer's indicator reads the
  // same count a maxed-out card cap would otherwise hide (showcase Task 3).
  const visibleCount = ready ? visibleNodes(spec, viewport, width, height, Number.POSITIVE_INFINITY).length : 0;

  // `false`/absent (no prop, or `minimap={false}`) are identical: no corner,
  // no `Minimap`. `true` picks the default corner; `{ corner }` picks that
  // one (spec 4 §1).
  const minimapCorner: MinimapCorner | null =
    properties.minimap === true ? "bottom-left" : properties.minimap ? properties.minimap.corner : null;
  const legendRequest: MinimapCorner | null =
    properties.legend === true ? "top-left" : properties.legend ? properties.legend.corner : null;
  const legendPlacement = legendRequest === null ? null : legendCorner(legendRequest, minimapCorner);
  const legend = useMemo(
    () => legendEntries(spec.territories, scene.colours, theme.pointNeutral),
    [spec, scene, theme.pointNeutral],
  );
  // Same zoom band as a manual zoom; a territory with no drawable ring has nothing to zoom to.
  const onLegendEntry = (id: string) => {
    const bounds = ringBounds(scene.shapes.get(id) ?? []);
    if (bounds === null) return;
    setViewport(
      fitClamped(bounds, width, height, FIT_PADDING, fitScale / MAXIMUM_ZOOM_OUT, fitScale * MAXIMUM_ZOOM_IN),
    );
  };
  const world = useMemo(() => sceneBounds(spec, scene.shapes), [spec, scene]);
  // The main view's own world-space bounding rectangle, in world units —
  // what the minimap draws its view rectangle from, and a dependency of its
  // paint effect (`Minimap.tsx`). The two `toWorld` calls are cheap, but the
  // *object* they build is not something to key an effect on by identity
  // (fix round 1, finding 2 — the project's own rule: never key an
  // expensive memo or effect on an object's identity, key on the values
  // used): `viewport` is minted fresh by every `setViewport`, including ones an
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
  // own accumulated pan is already flushed into a single `setViewport` per frame
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

  // React 19 ref-as-prop (spec 4 §1): no deps array, so the handle is
  // rebuilt every commit and its closures — `viewport`/`fitScale`/`fitted`/
  // `tuning`/`width`/`height`/`thresholds` — are always the ones from the
  // render that just committed, never a stale render from before a spec or
  // box change. `zoomIn`/`zoomOut` use `setViewport`'s functional-update form
  // (not the closed-over `viewport` directly) so a burst of calls made between
  // renders — the showcase's zoom button held down, or this file's own
  // 200-calls test — each sees the previous call's result, not the same
  // pre-burst `viewport` 200 times over.
  useImperativeHandle(handleReference, () => ({
    zoomIn: () => {
      const factor = wheelZoomFactor({ deltaY: -120, deltaMode: 0, ctrlKey: false }, tuning);
      setViewport((previous) => {
        const target = zoomStepScale(previous.scale, factor, fitScale, MAXIMUM_ZOOM_OUT, MAXIMUM_ZOOM_IN);
        return zoomTo(previous, width / 2, height / 2, target);
      });
    },
    zoomOut: () => {
      const factor = wheelZoomFactor({ deltaY: 120, deltaMode: 0, ctrlKey: false }, tuning);
      setViewport((previous) => {
        const target = zoomStepScale(previous.scale, factor, fitScale, MAXIMUM_ZOOM_OUT, MAXIMUM_ZOOM_IN);
        return zoomTo(previous, width / 2, height / 2, target);
      });
    },
    // Resets the regime hysteresis the same way a `spec` change does (the
    // `fitBasis` branch above): `fit()` is an explicit "back to the
    // overview" action, landing the ratio back at exactly 1, and a regime
    // that merely carried its hysteresis band over from wherever the user
    // had zoomed to could stay "near"/"mid" even though the view is back
    // at the fitted one — the same staleness the `fitBasis` comment
    // documents for a corpus swap, reproduced here by an explicit fit
    // instead of a new spec (see this file's `.handle.test.tsx`).
    fit: () => {
      setViewport(fitted);
      setRefits((count) => count + 1);
      setRegime(regimeAt(1, thresholds, "far", tuning.hysteresis));
    },
  }));

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
      setViewport((previous) => {
        const fit = fitScaleReference.current;
        const target = zoomStepScale(previous.scale, factor, fit, MAXIMUM_ZOOM_OUT, MAXIMUM_ZOOM_IN);
        return zoomTo(previous, event.clientX - rect.left, event.clientY - rect.top, target);
      });
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
  }, []);

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

  // Schedules the one rAF flush a burst of pointer moves, or a minimap
  // press/drag, coalesces into (metric 13) — both routes share this single
  // `rafId`, so a move and a minimap press arriving in the same frame still
  // cost one commit, through the same `setViewport`. A no-op if a flush is
  // already pending.
  const scheduleFrame = () => {
    if (rafId.current !== null) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      const accumulated = pending.current;
      pending.current = null;
      if (accumulated) setViewport((previous) => panBy(previous, accumulated.dx, accumulated.dy));
      // A minimap press/drag (showcase Task 4): centres the main view on
      // the pressed world point through the very same `setViewport` a drag pans
      // with, just landing on an absolute `tx`/`ty` instead of an
      // accumulated delta — so `onViewChange` reacts to it exactly as it
      // would to any other committed view change, with no separate wiring.
      const centre = pendingCentre.current;
      pendingCentre.current = null;
      if (centre) {
        setViewport((previous) => ({
          scale: previous.scale,
          tx: width / 2 - centre.wx * previous.scale,
          ty: height / 2 - centre.wy * previous.scale,
        }));
      }
      const hoverPosition = hoverPoint.current;
      // Not the applicable-regime/not-dragging/has-a-point condition's
      // `else`: a press, a `pointerleave`, or leaving the mid/near
      // regimes already clears `hover` synchronously at its own call
      // site (`onPointerDown`, `onPointerLeave`, the render-phase check
      // above) — including that update's effect, since each of those
      // runs to completion, effects included, strictly before any
      // already-scheduled flush like this one can run. So by the time
      // this condition is false, `hoverReference.current` is already null;
      // there is nothing left here to clear.
      if (drag.current === null && hoverPosition && (next === "mid" || next === "near") && pointAlpha >= 0.1) {
        // Uncapped, unlike the cards/tree's own `visibleNodes(..., cardCap)`
        // calls: the canvas paints every on-screen point regardless of the
        // card cap, so hover must be resolvable against all of them, not
        // just the first `cardCap` in spec order (C1) — otherwise most
        // on-screen points past the cap are silently unhoverable.
        const points = visibleNodes(spec, viewport, width, height, Number.POSITIVE_INFINITY).map((node) => {
          const [left, top] = toScreen(viewport, node.x, node.y);
          return { id: node.id, x: left, y: top };
        });
        const nearest = nearestWithin(points, hoverPosition.x, hoverPosition.y, tuning.hoverRadius);
        const previousHover = hoverReference.current;
        if (nearest) {
          // Same node, same screen position as the currently shown hover:
          // skip the call rather than dispatch a freshly-allocated (but
          // deeply equal) object every frame the pointer holds still —
          // `Object.is` would never consider two such objects equal, so
          // React would never bail out and a steady hover would cost a
          // commit on every frame (see the `hoverReference` comment above).
          const same =
            previousHover &&
            previousHover.id === nearest.id &&
            previousHover.x === nearest.x &&
            previousHover.y === nearest.y;
          if (!same) {
            // `nearest.id` is always a key of `nodesById`: `points` was
            // built from `visibleNodes(spec, ...)`, which only ever
            // returns `spec`'s own nodes.
            const label = (nodesById.get(nearest.id) as MapNode).label;
            setHover({ id: nearest.id, label, x: nearest.x, y: nearest.y });
          }
        } else if (previousHover !== null) {
          setHover(null);
        }
      }
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
      hoverPoint.current = rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
    }
    scheduleFrame();
  };

  // The minimap's press/drag callback (showcase Task 4): queues a world
  // point to centre on and reuses `scheduleFrame`, so it is frame-coalesced
  // and lands through the same `setViewport` the drag above uses — never a
  // separate, uncoalesced `setViewport` call of its own.
  const onMinimapPoint = (worldHorizontal: number, worldVertical: number) => {
    pendingCentre.current = { wx: worldHorizontal, wy: worldVertical };
    scheduleFrame();
  };

  const onPointerCancel = () => {
    drag.current = null;
  };

  const onPointerLeave = () => {
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
    if (!press || !onSelect || Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > CLICK_SLOP)
      return;
    // Below opacity 0.1 a card is invisible but still mounted (the
    // hysteresis fade band keeps it in the DOM at opacity 0 rather than
    // unmounting it) — hit-testing it there would let a click on what the
    // user sees as empty map select an item they never saw (C2).
    if (cardOpacity < 0.1) return;
    const id = cardIdAt(rootReference.current, event.clientX, event.clientY);
    const node = id === null ? undefined : nodesById.get(id);
    if (node) onSelect(node);
  };

  return (
    <div
      ref={rootReference}
      data-map-surface=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
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
      }}
    >
      {ready ? (
        <>
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative — the accessible tree carries the real content and interaction; the canvas must stay hidden from AT regardless of default focusability. */}
          <canvas ref={canvasReference} aria-hidden="true" style={{ width, height, display: "block" }} />
          <CardOverlay
            spec={spec}
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
          {hover ? (
            <div
              data-hover={hover.id}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: hover.x,
                top: hover.y - 8,
                transform: "translate(-50%, -100%)",
                background: theme.hoverBackground,
                color: theme.hoverText,
                padding: "2px 6px",
                borderRadius: 4,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                font: "12px system-ui, sans-serif",
              }}
            >
              {hover.label}
            </div>
          ) : null}
          <AccessibleTree
            spec={spec}
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
              setViewport({ scale, tx: width / 2 - centreHorizontal * scale, ty: height / 2 - centreVertical * scale });
            }}
            onSelect={onSelect}
            onTerritoryFocusChange={setFocusedTerritory}
            onNodeFocusChange={setFocusedNode}
          />
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
              entries={legend.entries}
              more={legend.more}
              presentation={presentation}
              corner={legendPlacement}
              theme={theme}
              onEntry={onLegendEntry}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
