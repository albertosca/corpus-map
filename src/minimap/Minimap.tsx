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
export function Minimap({ scene, world, view, corner, theme, onPoint }: MinimapProps): ReactElement {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) return;
    const devicePixelRatio = window.devicePixelRatio ?? 1;
    const backingWidth = Math.round(MINIMAP_SIZE.width * devicePixelRatio);
    const backingHeight = Math.round(MINIMAP_SIZE.height * devicePixelRatio);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    paintMinimap(canvasSurface(context), scene, world, view, MINIMAP_SIZE, theme);
  }, [scene, world, view, theme]);

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = canvasReference.current?.getBoundingClientRect();
    if (!rect) return;
    const fitted = minimapFit(world, MINIMAP_SIZE);
    const [worldHorizontal, worldVertical] = toWorld(fitted, event.clientX - rect.left, event.clientY - rect.top);
    onPoint(worldHorizontal, worldVertical);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointAt(event);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!dragging.current) return;
    pointAt(event);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    dragging.current = false;
  };
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    dragging.current = false;
  };

  // `aria-hidden` sits on a plain wrapper, not on the canvas: a canvas
  // counts as focusable content to the a11y lint, while a div that only
  // listens for pointer events does not, and hiding the wrapper hides the
  // canvas inside it just the same.
  return (
    <div
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
    >
      <canvas
        ref={canvasReference}
        data-minimap-canvas=""
        style={{ display: "block", width: MINIMAP_SIZE.width, height: MINIMAP_SIZE.height }}
      />
    </div>
  );
}
