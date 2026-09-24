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
import { type LodThresholds, type Regime, resolveThresholds } from "./lod/lod";
import { fade, regimeAt } from "./lod/regime";
import { visibleNodes } from "./lod/visible";
import { Minimap, type MinimapCorner } from "./minimap/Minimap";
import { nearestWithin } from "./points/hover";
import { paint } from "./shared/paint";
import { buildScene } from "./shared/scene";
import { type MapNode, type MapSpec, validateSpec } from "./shared/spec";
import { canvasSurface } from "./shared/surface";
import { DEFAULT_THEME, type Theme } from "./shared/theme";
import { resolveTuning, type Tuning } from "./shared/tuning";
import { fitSpec, worldBounds } from "./viewport/fit";
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
   * A 160 x 110 canvas in a corner of the box (default off), drawing the
   * territory shapes and the current view; pressing or dragging it centres
   * the main view on the pressed world point (spec 4 §1). `true` picks the
   * default corner, `"bottom-left"`.
   */
  minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" } | undefined;
}

const FIT_PADDING = 24;

/**
 * Wheel zoom, and the imperative handle's `zoomIn`/`zoomOut` (showcase
 * Task 3), are clamped to [fit / MAX_ZOOM_OUT, fit * MAX_ZOOM_IN] of the
 * fitted scale, through the shared `zoomStepScale`, which also keeps a
 * step from moving opposite to its direction when a keep-view resize has
 * left the scale outside that band.
 */
const MAX_ZOOM_OUT = 8;
const MAX_ZOOM_IN = 64;

/** A press released within this many pixels of where it started is a click, not a drag. */
const CLICK_SLOP = 4;

function cardIdAt(root: HTMLElement | null, clientX: number, clientY: number): string | null {
  if (!root) return null;
  // Reverse the DOM order rather than index from the end: `noUncheckedIndexedAccess`
  // makes an out-of-bounds index type `HTMLElement | undefined`, and this list can
  // never actually be out of bounds, so an `if (!card) continue` guard would be
  // dead code that a coverage gate can never satisfy. Topmost (last in DOM order)
  // still wins.
  const cards = [...root.querySelectorAll<HTMLElement>("[data-card]")].reverse();
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
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
export function CorpusMap({ ref, ...props }: CorpusMapProps): ReactElement {
  const { spec: raw, renderCard, onSelect, onRegimeChange, onViewChange } = props;
  const thresholds = useMemo(() => resolveThresholds(props.thresholds), [props.thresholds]);
  const tuning = useMemo(() => resolveTuning(props.tuning), [props.tuning]);
  const cardCap = props.cardCap ?? 200;
  // Not memoized: `layoutCards` is cheap and already recomputed every render
  // inside `CardOverlay`, so keying a memo on this object's identity would
  // only add a stale-dependency risk (Task 7's lesson) for no benefit.
  const cardSize = props.cardSize ?? DEFAULT_CARD_SIZE;
  const theme = props.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec]);

  const rootRef = useRef<HTMLDivElement>(null);
  // Always called (rules of hooks): a consumer that never removes/adds
  // `width`/`height` across an instance's lifetime never sees it matter, and
  // one that does gets a `measured` value that has been tracking the parent
  // the whole time, ready the moment the explicit props are dropped.
  const measured = useElementSize(rootRef);
  // "When both are given they win" (spec 4 §1): a lone `width` or `height`
  // does not count as explicit, and falls through to the measured box.
  const explicitBox =
    props.width !== undefined && props.height !== undefined ? { width: props.width, height: props.height } : null;
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

  const [vp, setVp] = useState<Viewport>(() => fitSpec(spec, width, height, FIT_PADDING));
  const fitted = useMemo(() => fitSpec(spec, width, height, FIT_PADDING), [spec, width, height]);
  const fitScale = fitted.scale;
  // Hysteresis regime; declared before the refit below (rather than nearer
  // where `ratio`/`next` are computed) so a spec/box swap can reset it in
  // the same render-phase adjustment that resets `vp`, not just `vp` alone.
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
  // fix round 1, per the controller's binding ruling) keeps `vp.scale` and
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
      if (fitBasis !== null) setRefits((n) => n + 1);
      setVp(fitted);
      setRegime(regimeAt(1, thresholds, "far", tuning.hysteresis));
    } else if (fitBasis.width !== width || fitBasis.height !== height) {
      setFitBasis({ spec, width, height });
      setVp(recenterOnBoxChange(vp, fitBasis.width, fitBasis.height, width, height));
    }
  }
  const fitScaleRef = useRef(fitScale);
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);
  const tuningRef = useRef(tuning);
  useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Press | null>(null);
  const pending = useRef<Pending | null>(null);
  // A world point from a minimap press/drag (showcase Task 4), flushed in
  // the same rAF-coalesced frame as `pending`'s drag delta, through the same
  // `setVp` — never its own, separately-scheduled commit.
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
  const hoverRef = useRef<HoverState | null>(null);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) window.cancelAnimationFrame(rafId.current);
    };
  }, []);

  const ratio = vp.scale / fitScale;
  // Hysteresis regime, adjusted during render (the same pattern as the
  // refit above): a finer regime is entered at its threshold and left only
  // once the ratio falls a fraction `hysteresis` below it, so an oscillating
  // zoom never mounts and unmounts cards on every tick. `next` — not the
  // (possibly stale, about-to-be-discarded) `regime` state — is what this
  // pass renders and paints.
  const next = regimeAt(ratio, thresholds, regime, tuning.hysteresis);
  if (next !== regime) setRegime(next);
  // A wheel zoom can leave the mid/near regimes without any further pointer
  // move to trigger the frame-flush clear below — adjusted here, during
  // render, so a stale hover name never has a frame where it is visibly
  // shown at the wrong regime, and never lingers to reappear untested for
  // proximity if the ratio zooms back in without a fresh move.
  if (next !== "mid" && next !== "near" && hover !== null) setHover(null);

  const pointAlpha = fade(ratio, thresholds.midAt, tuning.fadeBand);
  const cardOpacity = fade(ratio, thresholds.nearAt, tuning.fadeBand);

  // `onViewChange`'s node count: on-screen, uncapped — like the hover
  // hit-test's own `visibleNodes(..., Infinity)` call above, not the
  // cards/tree's `cardCap`-limited one, so a consumer's indicator reads the
  // same count a maxed-out card cap would otherwise hide (showcase Task 3).
  const visibleCount = ready ? visibleNodes(spec, vp, width, height, Number.POSITIVE_INFINITY).length : 0;

  // `false`/absent (no prop, or `minimap={false}`) are identical: no corner,
  // no `Minimap`. `true` picks the default corner; `{ corner }` picks that
  // one (spec 4 §1).
  const minimapCorner: MinimapCorner | null =
    props.minimap === true ? "bottom-left" : props.minimap ? props.minimap.corner : null;
  const world = useMemo(() => worldBounds(spec), [spec]);
  // The main view's own world-space bounding rectangle, in world units —
  // what the minimap draws its view rectangle from, and a dependency of its
  // paint effect (`Minimap.tsx`). The two `toWorld` calls are cheap, but the
  // *object* they build is not something to key an effect on by identity
  // (fix round 1, finding 2 — the project's own rule: never key an
  // expensive memo or effect on an object's identity, key on the values
  // used): `vp` is minted fresh by every `setVp`, including ones an
  // unrelated commit (a hover update, a freshly-literal `theme`/`tuning`
  // prop) never touches, so a plain object literal here changed identity —
  // and re-triggered the minimap's whole repaint — on every commit, not
  // just ones where the view actually moved. Memoized on the four
  // primitives themselves, so the minimap only repaints when `x`/`y`/`w`/`h`
  // actually changed.
  const [viewX0, viewY0] = toWorld(vp, 0, 0);
  const [viewX1, viewY1] = toWorld(vp, width, height);
  const viewWorld = useMemo(
    () => ({ x: viewX0, y: viewY0, w: viewX1 - viewX0, h: viewY1 - viewY0 }),
    [viewX0, viewY0, viewX1, viewY1],
  );

  // Computed once per spec/tuning/theme/measure — not per fitScale/box size:
  // placed names store an absolute `activeFromScale` (spec 4 "showcase"), so
  // the box a corpus is fitted into no longer belongs in this memo's key,
  // and a resize (which only changes `fitScale`) costs no scene rebuild.
  // Keyed on the primitive values `buildScene` actually reads — not on the
  // `tuning`/`theme` objects themselves, which `resolveTuning` and
  // `props.theme ?? DEFAULT_THEME` both mint fresh on every render for an
  // inline literal prop (spec 4's tuning panel does exactly that), which
  // would rebuild the scene (70-135ms on 10k items) on every render. The
  // literals below and the dependency list must both name every field
  // `buildScene` reads — nothing more, nothing less — which is also why
  // `buildScene` only asks for `Pick<Tuning, ...>` and `Pick<Theme, ...>`:
  // passing the whole objects here would put the whole (unstable) objects
  // back in the dependency list.
  const measure = useMeasure();
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
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Backing store in device pixels; the CSS box stays `width` x `height`.
    // Assigning `width` resets the bitmap, so only touch it when it changes.
    const dpr = window.devicePixelRatio ?? 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(canvasSurface(ctx), scene, spec, vp, { regime: next, pointAlpha, width, height }, theme);
  }, [spec, scene, vp, next, pointAlpha, theme, width, height]);

  // Latest callback in a ref so an inline arrow prop does not re-fire the
  // event on every render; the effect fires on mount (so the consumer learns
  // the initial regime) and then only when the regime actually changes.
  // Gated on `ready`: before the first measured size there is no real regime
  // yet (`next` is computed from the box's 0-fallback), and firing then
  // would hand a measured-mode consumer a bogus value before the map has
  // ever painted anything.
  const onRegimeChangeRef = useRef(onRegimeChange);
  useEffect(() => {
    onRegimeChangeRef.current = onRegimeChange;
  });
  useEffect(() => {
    if (!ready) return;
    onRegimeChangeRef.current?.(next);
  }, [next, ready]);

  // Latest callback in a ref, same pattern as `onRegimeChangeRef` just
  // above: an inline arrow prop (the demo's indicator will pass one) must
  // not re-fire the effect below just because its identity changed. Fires
  // once on mount (`ready` gate, same reasoning as `onRegimeChange`), then
  // again when `next`/`ratio`/`visibleCount` differ from the previous
  // commit's, or after a refit (`refits`). Being tied to commits is what
  // keeps it to at most once per animation frame during a drag: the drag's
  // own accumulated pan is already flushed into a single `setVp` per frame
  // (metric 13), so there is at most one commit per frame for this effect
  // to react to.
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  });
  useEffect(() => {
    if (!ready) return;
    onViewChangeRef.current?.({ regime: next, ratio, visibleCount });
  }, [next, ratio, visibleCount, ready, refits]);

  // React 19 ref-as-prop (spec 4 §1): no deps array, so the handle is
  // rebuilt every commit and its closures — `vp`/`fitScale`/`fitted`/
  // `tuning`/`width`/`height`/`thresholds` — are always the ones from the
  // render that just committed, never a stale render from before a spec or
  // box change. `zoomIn`/`zoomOut` use `setVp`'s functional-update form
  // (not the closed-over `vp` directly) so a burst of calls made between
  // renders — the showcase's zoom button held down, or this file's own
  // 200-calls test — each sees the previous call's result, not the same
  // pre-burst `vp` 200 times over.
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const factor = wheelZoomFactor({ deltaY: -120, deltaMode: 0, ctrlKey: false }, tuning);
      setVp((v) => {
        const target = zoomStepScale(v.scale, factor, fitScale, MAX_ZOOM_OUT, MAX_ZOOM_IN);
        return zoomTo(v, width / 2, height / 2, target);
      });
    },
    zoomOut: () => {
      const factor = wheelZoomFactor({ deltaY: 120, deltaMode: 0, ctrlKey: false }, tuning);
      setVp((v) => {
        const target = zoomStepScale(v.scale, factor, fitScale, MAX_ZOOM_OUT, MAX_ZOOM_IN);
        return zoomTo(v, width / 2, height / 2, target);
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
      setVp(fitted);
      setRefits((n) => n + 1);
      setRegime(regimeAt(1, thresholds, "far", tuning.hysteresis));
    },
  }));

  // Native, non-passive listener: React's `onWheel` is registered passive, so
  // `preventDefault` there cannot stop the page from scrolling under the map.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = wheelZoomFactor(
        { deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey },
        tuningRef.current,
      );
      setVp((v) => {
        const fit = fitScaleRef.current;
        const target = zoomStepScale(v.scale, factor, fit, MAX_ZOOM_OUT, MAX_ZOOM_IN);
        return zoomTo(v, e.clientX - rect.left, e.clientY - rect.top, target);
      });
      // A wheel zoom moves every on-screen point, so a hover name resolved
      // against the pre-zoom viewport is now anchored to the wrong screen
      // position; there is no guarantee of a further pointer move to
      // trigger a fresh resolution (I2). Clearing it here, rather than
      // waiting for one, means the next move — or the render-phase regime
      // check above — is what decides whether a hover reappears, never a
      // stale one left over from before the zoom.
      if (hoverRef.current !== null) setHover(null);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
  // cost one commit, through the same `setVp`. A no-op if a flush is
  // already pending.
  const scheduleFrame = () => {
    if (rafId.current !== null) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      const acc = pending.current;
      pending.current = null;
      if (acc) setVp((v) => panBy(v, acc.dx, acc.dy));
      // A minimap press/drag (showcase Task 4): centres the main view on
      // the pressed world point through the very same `setVp` a drag pans
      // with, just landing on an absolute `tx`/`ty` instead of an
      // accumulated delta — so `onViewChange` reacts to it exactly as it
      // would to any other committed view change, with no separate wiring.
      const centre = pendingCentre.current;
      pendingCentre.current = null;
      if (centre) {
        setVp((v) => ({
          scale: v.scale,
          tx: width / 2 - centre.wx * v.scale,
          ty: height / 2 - centre.wy * v.scale,
        }));
      }
      const hp = hoverPoint.current;
      // Not the applicable-regime/not-dragging/has-a-point condition's
      // `else`: a press, a `pointerleave`, or leaving the mid/near
      // regimes already clears `hover` synchronously at its own call
      // site (`onPointerDown`, `onPointerLeave`, the render-phase check
      // above) — including that update's effect, since each of those
      // runs to completion, effects included, strictly before any
      // already-scheduled flush like this one can run. So by the time
      // this condition is false, `hoverRef.current` is already null;
      // there is nothing left here to clear.
      if (drag.current === null && hp && (next === "mid" || next === "near") && pointAlpha >= 0.1) {
        // Uncapped, unlike the cards/tree's own `visibleNodes(..., cardCap)`
        // calls: the canvas paints every on-screen point regardless of the
        // card cap, so hover must be resolvable against all of them, not
        // just the first `cardCap` in spec order (C1) — otherwise most
        // on-screen points past the cap are silently unhoverable.
        const points = visibleNodes(spec, vp, width, height, Number.POSITIVE_INFINITY).map((n) => {
          const [x, y] = toScreen(vp, n.x, n.y);
          return { id: n.id, x, y };
        });
        const nearest = nearestWithin(points, hp.x, hp.y, tuning.hoverRadius);
        const prevHover = hoverRef.current;
        if (nearest) {
          // Same node, same screen position as the currently shown hover:
          // skip the call rather than dispatch a freshly-allocated (but
          // deeply equal) object every frame the pointer holds still —
          // `Object.is` would never consider two such objects equal, so
          // React would never bail out and a steady hover would cost a
          // commit on every frame (see the `hoverRef` comment above).
          const same =
            prevHover && prevHover.id === nearest.id && prevHover.x === nearest.x && prevHover.y === nearest.y;
          if (!same) {
            // `nearest.id` is always a key of `nodesById`: `points` was
            // built from `visibleNodes(spec, ...)`, which only ever
            // returns `spec`'s own nodes.
            const label = (nodesById.get(nearest.id) as MapNode).label;
            setHover({ id: nearest.id, label, x: nearest.x, y: nearest.y });
          }
        } else if (prevHover !== null) {
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
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      drag.current = { ...d, x: e.clientX, y: e.clientY };
      const p = pending.current;
      pending.current = p ? { dx: p.dx + dx, dy: p.dy + dy } : { dx, dy };
    } else {
      const rect = rootRef.current?.getBoundingClientRect();
      hoverPoint.current = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
    }
    scheduleFrame();
  };

  // The minimap's press/drag callback (showcase Task 4): queues a world
  // point to centre on and reuses `scheduleFrame`, so it is frame-coalesced
  // and lands through the same `setVp` the drag above uses — never a
  // separate, uncoalesced `setVp` call of its own.
  const onMinimapPoint = (wx: number, wy: number) => {
    pendingCentre.current = { wx, wy };
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
  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const d = drag.current;
    drag.current = null;
    if (!d || !onSelect || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK_SLOP) return;
    // Below opacity 0.1 a card is invisible but still mounted (the
    // hysteresis fade band keeps it in the DOM at opacity 0 rather than
    // unmounting it) — hit-testing it there would let a click on what the
    // user sees as empty map select an item they never saw (C2).
    if (cardOpacity < 0.1) return;
    const id = cardIdAt(rootRef.current, e.clientX, e.clientY);
    const node = id === null ? undefined : nodesById.get(id);
    if (node) onSelect(node);
  };

  return (
    <div
      ref={rootRef}
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
          <canvas ref={canvasRef} aria-hidden="true" style={{ width, height, display: "block" }} />
          <CardOverlay
            spec={spec}
            viewport={vp}
            regime={next}
            cap={cardCap}
            width={width}
            height={height}
            cardSize={cardSize}
            opacity={cardOpacity}
            theme={theme}
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
            viewport={vp}
            width={width}
            height={height}
            cap={cardCap}
            onFocusTerritory={(t) => {
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
              const [cx, cy] = t.centroid;
              const target = fitScale * thresholds.nearAt * (1 + tuning.fadeBand);
              const scale = Math.min(fitScale * MAX_ZOOM_IN, Math.max(fitScale / MAX_ZOOM_OUT, target));
              setVp({ scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale });
            }}
            onSelect={onSelect}
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
        </>
      ) : null}
    </div>
  );
}
