import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import type { Bounds } from "../viewport/fit";
import { toScreen, type Viewport } from "../viewport/viewport";

/**
 * Kept between the fitted world extent and the minimap's own edge, in
 * minimap pixels — the same padded-fit idea `viewport/fit.ts`'s `fitSpec`
 * applies to the main box, scaled down for a canvas this small.
 */
const MINIMAP_PADDING = 6;

/**
 * Fits `world` into `size`, centred, the same way `fitSpec` fits a spec into
 * the main box — but from a `Bounds` directly, since the minimap draws a
 * precomputed `Scene`'s shapes rather than a `MapSpec`. Exported so
 * `Minimap.tsx` can invert it (`toWorld`) to resolve a press/drag's world
 * point, rather than keep a second copy of this arithmetic that could drift
 * from the one `paintMinimap` paints with.
 */
export function minimapFit(world: Bounds, size: { width: number; height: number }): Viewport {
  const usableW = Math.max(1, size.width - MINIMAP_PADDING * 2);
  const usableH = Math.max(1, size.height - MINIMAP_PADDING * 2);
  const worldW = Math.max(1e-9, world.maxX - world.minX);
  const worldH = Math.max(1e-9, world.maxY - world.minY);
  const scale = Math.min(usableW / worldW, usableH / worldH);
  const cx = (world.minX + world.maxX) / 2;
  const cy = (world.minY + world.maxY) / 2;
  return { scale, tx: size.width / 2 - cx * scale, ty: size.height / 2 - cy * scale };
}

function clampToSize([x, y]: [number, number], size: { width: number; height: number }): [number, number] {
  return [Math.min(size.width, Math.max(0, x)), Math.min(size.height, Math.max(0, y))];
}

/**
 * Pure paint for the minimap (spec 4 §1): every territory ring — one polygon
 * per ring, summed across territories, not one per territory — fitted to
 * `size` from `world` and left unclipped (a ring padded slightly past the
 * node extent still reads fine a few pixels past the fitted box); then the
 * current view's world rectangle as a stroked polygon, with its corners
 * clamped to `size`'s edges so a view zoomed out past the world bounds still
 * draws entirely inside the minimap's own canvas instead of spilling past
 * it.
 */
export function paintMinimap(
  surface: Surface,
  scene: Scene,
  world: Bounds,
  view: { x: number; y: number; w: number; h: number },
  size: { width: number; height: number },
  theme: Theme,
): void {
  const vp = minimapFit(world, size);
  for (const rings of scene.shapes.values()) {
    for (const ring of rings) {
      if (ring.length < 3) continue;
      surface.polygon(
        ring.map(([x, y]) => toScreen(vp, x, y)),
        theme.territoryFill,
        theme.territoryStroke,
      );
    }
  }
  const corners: Array<[number, number]> = [
    [view.x, view.y],
    [view.x + view.w, view.y],
    [view.x + view.w, view.y + view.h],
    [view.x, view.y + view.h],
  ];
  surface.polygon(
    corners.map(([x, y]) => clampToSize(toScreen(vp, x, y), size)),
    "transparent",
    theme.visited,
  );
}
