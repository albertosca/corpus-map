import { type PointerEvent, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccessibleTree } from "./a11y/AccessibleTree";
import { CardOverlay, DEFAULT_CARD_SIZE } from "./cards/CardOverlay";
import { useMeasure } from "./labels/useMeasure";
import { DEFAULT_THRESHOLDS, type LodThresholds, type Regime } from "./lod/lod";
import { fade, regimeAt } from "./lod/regime";
import { visibleNodes } from "./lod/visible";
import { nearestWithin } from "./points/hover";
import { paint } from "./shared/paint";
import { buildScene } from "./shared/scene";
import { type MapNode, type MapSpec, validateSpec } from "./shared/spec";
import { canvasSurface } from "./shared/surface";
import { DEFAULT_THEME, type Theme } from "./shared/theme";
import { resolveTuning, type Tuning } from "./shared/tuning";
import { fitSpec } from "./viewport/fit";
import { panBy, toScreen, type Viewport, zoomTo } from "./viewport/viewport";
import { wheelZoomFactor } from "./viewport/wheel";

export interface CorpusMapProps {
  spec: MapSpec;
  renderCard: (node: MapNode) => ReactNode;
  width: number;
  height: number;
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
}

const FIT_PADDING = 24;

/** Wheel zoom is clamped to [fit / MAX_ZOOM_OUT, fit * MAX_ZOOM_IN] of the fitted scale. */
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

export function CorpusMap(props: CorpusMapProps): ReactElement {
  const { spec: raw, renderCard, width, height, onSelect, onRegimeChange } = props;
  const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;
  const tuning = useMemo(() => resolveTuning(props.tuning), [props.tuning]);
  const cardCap = props.cardCap ?? 200;
  // Not memoized: `layoutCards` is cheap and already recomputed every render
  // inside `CardOverlay`, so keying a memo on this object's identity would
  // only add a stale-dependency risk (Task 7's lesson) for no benefit.
  const cardSize = props.cardSize ?? DEFAULT_CARD_SIZE;
  const theme = props.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec]);
  const [vp, setVp] = useState<Viewport>(() => fitSpec(spec, width, height, FIT_PADDING));
  const fitted = useMemo(() => fitSpec(spec, width, height, FIT_PADDING), [spec, width, height]);
  const fitScale = fitted.scale;
  // Hysteresis regime; declared before the refit below (rather than nearer
  // where `ratio`/`next` are computed) so a spec/box swap can reset it in
  // the same render-phase adjustment that resets `vp`, not just `vp` alone.
  const [regime, setRegime] = useState<Regime>(() => regimeAt(1, thresholds, "far", tuning.hysteresis));
  // Refit when the spec or the box changes, during render rather than in an
  // effect, so no frame is ever painted with the new spec at the old
  // viewport. The new viewport is exactly the fresh fit, so its ratio is
  // always 1: reset the regime the same way a fresh mount would compute it,
  // or a regime whose hysteresis exit band was sized for the OLD corpus's
  // ratio can carry over onto a new corpus where it should have released
  // (e.g. a wide hysteresis and a nearAt close to 1 — reproduced with
  // `{ nearAt: 1.02 }`, `hysteresis: 0.3`: swapping specs while "near"
  // left the regime stuck "near" on the new corpus's fitted view).
  const [fitBasis, setFitBasis] = useState({ spec, width, height });
  if (fitBasis.spec !== spec || fitBasis.width !== width || fitBasis.height !== height) {
    setFitBasis({ spec, width, height });
    setVp(fitted);
    setRegime(regimeAt(1, thresholds, "far", tuning.hysteresis));
  }
  const fitScaleRef = useRef(fitScale);
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);
  const tuningRef = useRef(tuning);
  useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Press | null>(null);
  const pending = useRef<Pending | null>(null);
  const rafId = useRef<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  // The pointer's latest surface-relative position while not pressed,
  // awaiting resolution in the same animation-frame flush as a drag's
  // accumulated pan (metric 13: resolving it synchronously in the move
  // handler instead would cost one commit per move).
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);

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

  // Computed once per spec/tuning/theme/measure/fit: concave territory
  // shapes and placed names. Keyed on the primitive values `buildScene`
  // actually reads — not on the `tuning`/`theme` objects themselves, which
  // `resolveTuning` and `props.theme ?? DEFAULT_THEME` both mint fresh on
  // every render for an inline literal prop (spec 4's tuning panel does
  // exactly that), which would rebuild the scene (70-135ms on 10k items)
  // on every render. The literals below and the dependency list must both
  // name every field `buildScene` reads — nothing more, nothing less —
  // which is also why `buildScene` only asks for `Pick<Tuning, ...>` and
  // `Pick<Theme, ...>`: passing the whole objects here would put the whole
  // (unstable) objects back in the dependency list.
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
        fitScale,
      ),
    [
      spec,
      fitScale,
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
    paint(canvasSurface(ctx), scene, spec, vp, { regime: next, ratio, pointAlpha }, theme);
  }, [spec, scene, vp, next, ratio, pointAlpha, theme, width, height]);

  // Latest callback in a ref so an inline arrow prop does not re-fire the
  // event on every render; the effect fires on mount (so the consumer learns
  // the initial regime) and then only when the regime actually changes.
  const onRegimeChangeRef = useRef(onRegimeChange);
  useEffect(() => {
    onRegimeChangeRef.current = onRegimeChange;
  });
  useEffect(() => {
    onRegimeChangeRef.current?.(next);
  }, [next]);

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
        const target = Math.min(fit * MAX_ZOOM_IN, Math.max(fit / MAX_ZOOM_OUT, v.scale * factor));
        return zoomTo(v, e.clientX - rect.left, e.clientY - rect.top, target);
      });
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
    if (rafId.current === null) {
      rafId.current = window.requestAnimationFrame(() => {
        rafId.current = null;
        const acc = pending.current;
        pending.current = null;
        if (acc) setVp((v) => panBy(v, acc.dx, acc.dy));
        const hp = hoverPoint.current;
        if (drag.current === null && hp && (next === "mid" || next === "near")) {
          const points = visibleNodes(spec, vp, width, height, cardCap).map((n) => {
            const [x, y] = toScreen(vp, n.x, n.y);
            return { id: n.id, x, y };
          });
          const nearest = nearestWithin(points, hp.x, hp.y, tuning.hoverRadius);
          // `nearest.id` is always a key of `nodesById`: `points` was built
          // from `visibleNodes(spec, ...)`, which only ever returns `spec`'s
          // own nodes.
          setHover(
            nearest
              ? { id: nearest.id, label: (nodesById.get(nearest.id) as MapNode).label, x: nearest.x, y: nearest.y }
              : null,
          );
        } else if (hover !== null) {
          setHover(null);
        }
      });
    }
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
      style={{ position: "relative", width, height, touchAction: "none" }}
    >
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
          // residual ulp of this multiply.
          const [cx, cy] = t.centroid;
          const scale = fitScale * thresholds.nearAt;
          setVp({ scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale });
        }}
        onSelect={onSelect}
      />
    </div>
  );
}
