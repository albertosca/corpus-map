import { type PointerEvent, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_THEME, paint, type Theme } from "../canvas/painter";
import { canvasSurface } from "../canvas/surface";
import { fitSpec } from "../geometry/fit";
import { DEFAULT_THRESHOLDS, type LodThresholds, type Regime, regimeFor } from "../lod";
import { type MapNode, type MapSpec, validateSpec } from "../spec";
import { panBy, type Viewport, zoomTo } from "../viewport";
import { AccessibleTree } from "./AccessibleTree";
import { CardOverlay } from "./CardOverlay";

export interface CorpusMapProps {
  spec: MapSpec;
  renderCard: (node: MapNode) => ReactNode;
  width: number;
  height: number;
  thresholds?: LodThresholds;
  cardCap?: number;
  theme?: Theme;
  onSelect?: (node: MapNode) => void;
  /** Fired once on mount with the initial regime, then on every change. */
  onRegimeChange?: (regime: Regime) => void;
}

const FIT_PADDING = 24;

/** Scale factor per unit of `deltaY`: a 120-unit notch zooms by exp(0.24) ≈ 1.27. */
const WHEEL_SENSITIVITY = 0.002;

/** Wheel zoom is clamped to [fit / MAX_ZOOM_OUT, fit * MAX_ZOOM_IN] of the fitted scale. */
const MAX_ZOOM_OUT = 8;
const MAX_ZOOM_IN = 64;

/** A press released within this many pixels of where it started is a click, not a drag. */
const CLICK_SLOP = 4;

function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.tx === b.tx && a.ty === b.ty;
}

function cardIdAt(root: HTMLElement | null, clientX: number, clientY: number): string | null {
  if (!root) return null;
  const cards = root.querySelectorAll<HTMLElement>("[data-card]");
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    const r = cards[i].getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return cards[i].getAttribute("data-card");
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

export function CorpusMap(props: CorpusMapProps): ReactElement {
  const { spec: raw, renderCard, width, height, onSelect, onRegimeChange } = props;
  const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;
  const cardCap = props.cardCap ?? 200;
  const theme = props.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const nodesById = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec]);
  const [vp, setVp] = useState<Viewport>(() => fitSpec(spec, width, height, FIT_PADDING));
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Press | null>(null);
  const fitScale = useRef(vp.scale);
  const regime = regimeFor(vp.scale, thresholds);

  // A different spec (or box) refits the viewport; consumers do not need to
  // remount with `key=`. The bail-out keeps mount and StrictMode's double
  // effect from producing an extra paint.
  useEffect(() => {
    const fitted = fitSpec(spec, width, height, FIT_PADDING);
    fitScale.current = fitted.scale;
    setVp((v) => (sameViewport(v, fitted) ? v : fitted));
  }, [spec, width, height]);

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
    paint(canvasSurface(ctx), spec, vp, regime, theme);
  }, [spec, vp, regime, theme, width, height]);

  // Latest callback in a ref so an inline arrow prop does not re-fire the
  // event on every render; the effect fires on mount (so the consumer learns
  // the initial regime) and then only when the regime actually changes.
  const onRegimeChangeRef = useRef(onRegimeChange);
  onRegimeChangeRef.current = onRegimeChange;
  useEffect(() => {
    onRegimeChangeRef.current?.(regime);
  }, [regime]);

  // Native, non-passive listener: React's `onWheel` is registered passive, so
  // `preventDefault` there cannot stop the page from scrolling under the map.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY);
      setVp((v) => {
        const fit = fitScale.current;
        const target = Math.min(fit * MAX_ZOOM_IN, Math.max(fit / MAX_ZOOM_OUT, v.scale * factor));
        return zoomTo(v, e.clientX - rect.left, e.clientY - rect.top, target);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setVp((v) => panBy(v, e.clientX - d.x, e.clientY - d.y));
    drag.current = { ...d, x: e.clientX, y: e.clientY };
  };

  const onPointerCancel = () => {
    drag.current = null;
  };

  // The card overlay is inert, so it cannot receive the click itself: a
  // press released within CLICK_SLOP of where it started is resolved here
  // against the visible cards' boxes. Topmost (last in DOM order) wins.
  const onPointerUp = (e: PointerEvent) => {
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
        regime={regime}
        cap={cardCap}
        width={width}
        height={height}
        renderCard={renderCard}
      />
      <AccessibleTree
        spec={spec}
        regime={regime}
        viewport={vp}
        width={width}
        height={height}
        cap={cardCap}
        onFocusTerritory={(t) => {
          // Built from the target scale directly rather than via a zoom
          // factor: `scale * (nearAt / scale)` can land a float ulp below
          // `nearAt`, on the wrong side of the threshold.
          const [cx, cy] = t.centroid;
          const scale = thresholds.nearAt;
          setVp({ scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale });
        }}
        onSelect={onSelect}
      />
    </div>
  );
}
