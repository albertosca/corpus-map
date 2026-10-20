import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { paintTerritories } from "../territories/paintTerritories";
import { type Bounds, fitBounds } from "../viewport/fit";
import { toScreen, type Viewport } from "../viewport/viewport";

/**
 * Kept between the fitted world extent and the minimap's own edge, in
 * minimap pixels — the same padded-fit idea `viewport/fit.ts`'s `fitBounds`
 * applies to the main box, scaled down for a canvas this small.
 */
const MINIMAP_PADDING = 6;

/**
 * Fits `world` into `size`, centred, through the same shared `fitBounds`
 * `fitSpec` itself is built on (fix round 1, finding 3 — this used to be a
 * private copy of that same padded-fit arithmetic). Kept as its own,
 * `size`-shaped wrapper (rather than inlining `fitBounds` at each call site)
 * so `Minimap.tsx` still has one name to invert (`toWorld`) for a
 * press/drag's world point, and so this file's own tests keep asserting
 * against the transform `paintMinimap` actually paints with, by name.
 */
export function minimapFit(world: Bounds, size: { width: number; height: number }): Viewport {
  return fitBounds(world, size.width, size.height, MINIMAP_PADDING);
}

function clamp(value: number, upper: number): number {
  return Math.min(upper, Math.max(0, value));
}

/**
 * Pure paint for the minimap (spec 4 §1): `surface.clear()` first, like
 * `shared/paint.ts`'s own compositor — this canvas is repainted in place
 * (`Minimap.tsx`'s DPR guard deliberately skips reassigning `canvas.width`
 * when the byte size hasn't changed, precisely to avoid the implicit clear
 * that would trigger, so nothing else erases the bitmap between paints);
 * then the territories, fitted to `size` from `world` and painted by the
 * same `paintTerritories` as the main map (one fill layer, then one outline
 * per ring), left unclipped (a ring padded slightly past the node extent
 * still reads fine a few pixels past the fitted box); then the current
 * view's world rectangle as a polygon stroked in the name colour — the one
 * colour guaranteed to contrast with every fill (metric 16) — clamped to `size`'s edges *as a rectangle*
 * — the screen-space box's two diagonal corners are each clamped once, and
 * all four drawn corners are built from those two clamped points, rather
 * than clamping each of the four corners independently (fix round 1,
 * finding 4) — so a view that overflows on some sides but not others still
 * comes out a proper axis-aligned box instead of four separately-placed
 * points that could, for a transform this code doesn't happen to use today
 * (any shear or rotation), stop agreeing with each other.
 */
export function paintMinimap(
  surface: Surface,
  scene: Scene,
  world: Bounds,
  view: { x: number; y: number; w: number; h: number },
  size: { width: number; height: number },
  theme: Theme,
): void {
  surface.clear();
  const fitted = minimapFit(world, size);
  paintTerritories(surface, scene, fitted, theme, theme.territoryFillAlpha);
  const [firstHorizontal, firstVertical] = toScreen(fitted, view.x, view.y);
  const [secondHorizontal, secondVertical] = toScreen(fitted, view.x + view.w, view.y + view.h);
  const left = clamp(Math.min(firstHorizontal, secondHorizontal), size.width);
  const right = clamp(Math.max(firstHorizontal, secondHorizontal), size.width);
  const top = clamp(Math.min(firstVertical, secondVertical), size.height);
  const bottom = clamp(Math.max(firstVertical, secondVertical), size.height);
  surface.polygon(
    [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ],
    "transparent",
    theme.territoryLabel,
  );
}
