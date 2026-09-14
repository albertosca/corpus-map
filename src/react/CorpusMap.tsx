import {
  type JSX,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { DEFAULT_THEME, paint, type Theme } from "../canvas/painter";
import { canvasSurface } from "../canvas/surface";
import { fitSpec } from "../geometry/fit";
import { DEFAULT_THRESHOLDS, type LodThresholds, regimeFor } from "../lod";
import { type MapNode, type MapSpec, validateSpec } from "../spec";
import { panBy, toScreen, type Viewport, zoomAt } from "../viewport";
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
}

export function CorpusMap(props: CorpusMapProps): JSX.Element {
  const { spec: raw, renderCard, width, height, onSelect } = props;
  const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;
  const cardCap = props.cardCap ?? 200;
  const theme = props.theme ?? DEFAULT_THEME;

  const spec = useMemo(() => validateSpec(raw), [raw]);
  const [vp, setVp] = useState<Viewport>(() => fitSpec(spec, width, height, 24));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const regime = regimeFor(vp.scale, thresholds);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    paint(canvasSurface(ctx), spec, vp, regime, theme);
  }, [spec, vp, regime, theme]);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setVp((v) => panBy(v, e.clientX - d.x, e.clientY - d.y));
    drag.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onWheel = (e: WheelEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setVp((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
  };

  return (
    <div
      data-map-surface=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{ position: "relative", width, height, touchAction: "none" }}
    >
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative — the accessible tree carries the real content and interaction; the canvas must stay hidden from AT regardless of default focusability. */}
      <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" />
      <CardOverlay
        spec={spec}
        viewport={vp}
        regime={regime}
        cap={cardCap}
        width={width}
        height={height}
        renderCard={renderCard}
        onSelect={onSelect}
      />
      <AccessibleTree
        spec={spec}
        regime={regime}
        viewport={vp}
        width={width}
        height={height}
        cap={cardCap}
        onFocusTerritory={(t) =>
          setVp((v) => {
            const [sx, sy] = toScreen(v, t.centroid[0], t.centroid[1]);
            const centred = panBy(v, width / 2 - sx, height / 2 - sy);
            return zoomAt(centred, width / 2, height / 2, thresholds.nearAt / centred.scale);
          })
        }
        onSelect={onSelect}
      />
    </div>
  );
}
