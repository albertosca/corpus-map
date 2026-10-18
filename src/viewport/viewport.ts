export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export function toScreen(viewport: Viewport, worldHorizontal: number, worldVertical: number): [number, number] {
  return [worldHorizontal * viewport.scale + viewport.tx, worldVertical * viewport.scale + viewport.ty];
}

export function toWorld(viewport: Viewport, screenHorizontal: number, screenVertical: number): [number, number] {
  return [(screenHorizontal - viewport.tx) / viewport.scale, (screenVertical - viewport.ty) / viewport.scale];
}

export function panBy(viewport: Viewport, horizontalDelta: number, verticalDelta: number): Viewport {
  return { scale: viewport.scale, tx: viewport.tx + horizontalDelta, ty: viewport.ty + verticalDelta };
}

export function zoomAt(viewport: Viewport, screenHorizontal: number, screenVertical: number, factor: number): Viewport {
  const scale = viewport.scale * factor;
  return {
    scale,
    tx: screenHorizontal - (screenHorizontal - viewport.tx) * factor,
    ty: screenVertical - (screenVertical - viewport.ty) * factor,
  };
}

/**
 * Like `zoomAt`, but lands on `scale` exactly instead of on
 * `viewport.scale * (scale / viewport.scale)`, which can miss the target by a float ulp —
 * enough to fall on the wrong side of a regime threshold.
 */
export function zoomTo(viewport: Viewport, screenHorizontal: number, screenVertical: number, scale: number): Viewport {
  const factor = scale / viewport.scale;
  return {
    scale,
    tx: screenHorizontal - (screenHorizontal - viewport.tx) * factor,
    ty: screenVertical - (screenVertical - viewport.ty) * factor,
  };
}

/**
 * Clamps `scale` to `[fit / maximumZoomOut, fit * maximumZoomIn]`. The wheel
 * handler and the imperative handle's `zoomIn`/`zoomOut` (showcase Task 3)
 * both reach it through `zoomStepScale`, so they clamp to exactly the same
 * band through the same code.
 */
export function clampScale(scale: number, fit: number, maximumZoomOut: number, maximumZoomIn: number): number {
  return Math.min(fit * maximumZoomIn, Math.max(fit / maximumZoomOut, scale));
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
  maximumZoomOut: number,
  maximumZoomIn: number,
): number {
  const target = clampScale(scale * factor, fit, maximumZoomOut, maximumZoomIn);
  return factor >= 1 ? Math.max(scale, target) : Math.min(scale, target);
}

/**
 * A box resize (showcase Task 2): keeps `scale` and keeps the world point
 * formerly at the old box's centre at the new box's centre, instead of
 * refitting — a spec change refits (via `fitSpec`); a box change alone does
 * not.
 */
export function recenterOnBoxChange(
  viewport: Viewport,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): Viewport {
  const [worldHorizontal, worldVertical] = toWorld(viewport, oldWidth / 2, oldHeight / 2);
  return {
    scale: viewport.scale,
    tx: newWidth / 2 - worldHorizontal * viewport.scale,
    ty: newHeight / 2 - worldVertical * viewport.scale,
  };
}
