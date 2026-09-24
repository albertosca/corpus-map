import {
  type CSSProperties,
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import type { Scene } from "../shared/scene";
import { canvasSurface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import type { Bounds } from "../viewport/fit";
import { toWorld } from "../viewport/viewport";
import { minimapFit, paintMinimap } from "./paintMinimap";

/** The minimap is always this size (spec 4 §1): a 160 x 110 canvas. */
export const MINIMAP_SIZE = { width: 160, height: 110 };

/** Where the minimap sits inside the map's box; `minimap={true}` picks the default, `"bottom-left"`. */
export type MinimapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const MARGIN = 12;

const CORNER_STYLE: Record<MinimapCorner, CSSProperties> = {
  "top-left": { top: MARGIN, left: MARGIN },
  "top-right": { top: MARGIN, right: MARGIN },
  "bottom-left": { bottom: MARGIN, left: MARGIN },
  "bottom-right": { bottom: MARGIN, right: MARGIN },
};

interface MinimapProps {
  scene: Scene;
  world: Bounds;
  view: { x: number; y: number; w: number; h: number };
  corner: MinimapCorner;
  theme: Theme;
  /** Called with the world point under a press or drag on the minimap. */
  onPoint: (worldX: number, worldY: number) => void;
}

/**
 * The minimap's React half: a fixed-size canvas painted by the pure
 * `paintMinimap`, positioned in one of the box's corners. `aria-hidden`
 * (spec 4 §1 — the accessible tree already offers territory navigation);
 * every pointer handler calls `stopPropagation` so a press or drag here
 * never reaches the map surface underneath — it can neither start a pan nor
 * resolve a card click there, regardless of where in the box the minimap's
 * corner happens to sit.
 */
export function Minimap({ scene, world, view, corner, theme, onPoint }: MinimapProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const bw = Math.round(MINIMAP_SIZE.width * dpr);
    const bh = Math.round(MINIMAP_SIZE.height * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintMinimap(canvasSurface(ctx), scene, world, view, MINIMAP_SIZE, theme);
  }, [scene, world, view, theme]);

  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = minimapFit(world, MINIMAP_SIZE);
    const [wx, wy] = toWorld(vp, e.clientX - rect.left, e.clientY - rect.top);
    onPoint(wx, wy);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || !e.isPrimary) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointAt(e);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (!dragging.current) return;
    pointAt(e);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    dragging.current = false;
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    dragging.current = false;
  };

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative — the accessible tree already offers territory navigation (spec 4 §1); pointer-only, so hidden from AT regardless of default focusability.
    <canvas
      ref={canvasRef}
      data-minimap=""
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        position: "absolute",
        ...CORNER_STYLE[corner],
        width: MINIMAP_SIZE.width,
        height: MINIMAP_SIZE.height,
        touchAction: "none",
        cursor: "pointer",
      }}
    />
  );
}
