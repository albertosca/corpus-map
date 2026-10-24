import { toWorld, type Viewport } from "./viewport";

/** Box-independent view: the world point at the box centre, and the scale relative to the fitted view. */
export interface MapViewport {
  centre: [number, number];
  zoom: number;
}

/** Why `onViewportChange` fired: a reader's action, an explicit fit, or the fit a new spec proposes. */
export type ViewportChangeReason = "interaction" | "fit" | "spec";

/** The zoom range a public view is clamped to, relative to the fit. */
export interface ZoomBand {
  minimum: number;
  maximum: number;
}

export function toPublic(viewport: Viewport, fitScale: number, width: number, height: number): MapViewport {
  return { centre: toWorld(viewport, width / 2, height / 2), zoom: viewport.scale / fitScale };
}

export function fromPublic(view: MapViewport, fitScale: number, width: number, height: number): Viewport {
  const scale = fitScale * view.zoom;
  return { scale, tx: width / 2 - view.centre[0] * scale, ty: height / 2 - view.centre[1] * scale };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A usable view, the zoom clamped to `band`; `null` for anything that cannot be drawn (the map then draws the fit). */
export function sanitise(
  view: { centre?: unknown; zoom?: unknown } | null | undefined,
  band: ZoomBand,
): MapViewport | null {
  if (!view || !Array.isArray(view.centre) || view.centre.length < 2) return null;
  const [horizontal, vertical] = view.centre as unknown[];
  const zoom = view.zoom;
  if (!finite(horizontal) || !finite(vertical) || !finite(zoom) || zoom <= 0) return null;
  return { centre: [horizontal, vertical], zoom: Math.min(band.maximum, Math.max(band.minimum, zoom)) };
}

const close = (left: number, right: number) =>
  Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));

/** Equal within a relative 1e-9: a round trip through pixels is never a change. */
export function sameView(left: MapViewport, right: MapViewport): boolean {
  return (
    close(left.zoom, right.zoom) && close(left.centre[0], right.centre[0]) && close(left.centre[1], right.centre[1])
  );
}
