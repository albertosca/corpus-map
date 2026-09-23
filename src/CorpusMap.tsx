import { type PointerEvent, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccessibleTree } from "./a11y/AccessibleTree";
import { CardOverlay } from "./cards/CardOverlay";
import { useMeasure } from "./labels/useMeasure";
import { DEFAULT_THRESHOLDS, type LodThresholds, type Regime } from "./lod/lod";
import { fade, regimeAt } from "./lod/regime";
import { paint } from "./shared/paint";
import { buildScene } from "./shared/scene";
import { type MapNode, type MapSpec, validateSpec } from "./shared/spec";
import { canvasSurface } from "./shared/surface";
import { DEFAULT_THEME, type Theme } from "./shared/theme";
import { resolveTuning, type Tuning } from "./shared/tuning";
import { fitSpec } from "./viewport/fit";
import { panBy, type Viewport, zoomTo } from "./viewport/viewport";
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

export function CorpusMap(props: CorpusMapProps): ReactElement {
  const { spec: raw, renderCard, width, height, onSelect, onRegimeChange } = props;
  const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;
  const tuning = useMemo(() => resolveTuning(props.tuning), [props.tuning]);
  const cardCap = props.cardCap ?? 200;
  const theme = props.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec]);
  const [vp, setVp] = useState<Viewport>(() => fitSpec(spec, width, height, FIT_PADDING));
  // Refit when the spec or the box changes, during render rather than in an
  // effect, so no frame is ever painted with the new spec at the old viewport.
  const fitted = useMemo(() => fitSpec(spec, width, height, FIT_PADDING), [spec, width, height]);
  const fitScale = fitted.scale;
  const [fitBasis, setFitBasis] = useState({ spec, width, height });
  if (fitBasis.spec !== spec || fitBasis.width !== width || fitBasis.height !== height) {
    setFitBasis({ spec, width, height });
    setVp(fitted);
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
  const [regime, setRegime] = useState<Regime>(() => regimeAt(ratio, thresholds, "far", tuning.hysteresis));
  const next = regimeAt(ratio, thresholds, regime, tuning.hysteresis);
  if (next !== regime) setRegime(next);

  const pointAlpha = fade(ratio, thresholds.midAt, tuning.fadeBand);
  const cardOpacity = fade(ratio, thresholds.nearAt, tuning.fadeBand);

  // Computed once per spec/tuning/theme/measure/fit: concave territory
  // shapes and placed names.
  const measure = useMeasure();
  const scene = useMemo(
    () => buildScene(spec, tuning, theme, measure, fitScale),
    [spec, tuning, theme, measure, fitScale],
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
  };

  // Pointer moves only accumulate a delta; the viewport is updated at most
  // once per animation frame, so a burst of move events costs one React
  // commit per frame, not one per event (metric 13).
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    const p = pending.current;
    pending.current = p ? { dx: p.dx + dx, dy: p.dy + dy } : { dx, dy };
    if (rafId.current === null) {
      rafId.current = window.requestAnimationFrame(() => {
        rafId.current = null;
        const acc = pending.current;
        pending.current = null;
        if (acc) setVp((v) => panBy(v, acc.dx, acc.dy));
      });
    }
  };

  const onPointerCancel = () => {
    drag.current = null;
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
        opacity={cardOpacity}
        renderCard={renderCard}
      />
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
