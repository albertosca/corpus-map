export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export function toScreen(v: Viewport, wx: number, wy: number): [number, number] {
  return [wx * v.scale + v.tx, wy * v.scale + v.ty];
}

export function toWorld(v: Viewport, sx: number, sy: number): [number, number] {
  return [(sx - v.tx) / v.scale, (sy - v.ty) / v.scale];
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy };
}

export function zoomAt(v: Viewport, sx: number, sy: number, factor: number): Viewport {
  const scale = v.scale * factor;
  return { scale, tx: sx - (sx - v.tx) * factor, ty: sy - (sy - v.ty) * factor };
}

/**
 * Like `zoomAt`, but lands on `scale` exactly instead of on
 * `v.scale * (scale / v.scale)`, which can miss the target by a float ulp —
 * enough to fall on the wrong side of a regime threshold.
 */
export function zoomTo(v: Viewport, sx: number, sy: number, scale: number): Viewport {
  const factor = scale / v.scale;
  return { scale, tx: sx - (sx - v.tx) * factor, ty: sy - (sy - v.ty) * factor };
}

/**
 * Clamps `scale` to `[fit / maxZoomOut, fit * maxZoomIn]`. The wheel
 * handler and the imperative handle's `zoomIn`/`zoomOut` (showcase Task 3)
 * both reach it through `zoomStepScale`, so they clamp to exactly the same
 * band through the same code.
 */
export function clampScale(scale: number, fit: number, maxZoomOut: number, maxZoomIn: number): number {
  return Math.min(fit * maxZoomIn, Math.max(fit / maxZoomOut, scale));
}

/**
 * The scale after one zoom step by `factor` (> 1 zooms in, < 1 zooms out),
 * clamped to the band like `clampScale`, but never moving opposite to the
 * step. A keep-view resize can leave the scale outside the band (zoomed to
 * the maximum, then the box shrinks); there, clamping alone would turn a
 * zoom-in into a zoom-out. Outside the band a step only moves toward it,
 * and a step away from it leaves the scale where it is.
 */
export function zoomStepScale(
  scale: number,
  factor: number,
  fit: number,
  maxZoomOut: number,
  maxZoomIn: number,
): number {
  const target = clampScale(scale * factor, fit, maxZoomOut, maxZoomIn);
  return factor >= 1 ? Math.max(scale, target) : Math.min(scale, target);
}

/**
 * A box resize (showcase Task 2): keeps `scale` and keeps the world point
 * formerly at the old box's centre at the new box's centre, instead of
 * refitting — a spec change refits (via `fitSpec`); a box change alone does
 * not.
 */
export function recenterOnBoxChange(
  v: Viewport,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): Viewport {
  const [wx, wy] = toWorld(v, oldWidth / 2, oldHeight / 2);
  return { scale: v.scale, tx: newWidth / 2 - wx * v.scale, ty: newHeight / 2 - wy * v.scale };
}
