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
 * Clamps `scale` to `[fit / maxZoomOut, fit * maxZoomIn]`. Factored out of
 * the wheel handler so the imperative handle's `zoomIn`/`zoomOut` (showcase
 * Task 3) clamp to exactly the same band through the same code, rather than
 * a second copy of the arithmetic that could drift from it.
 */
export function clampScale(scale: number, fit: number, maxZoomOut: number, maxZoomIn: number): number {
  return Math.min(fit * maxZoomIn, Math.max(fit / maxZoomOut, scale));
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
