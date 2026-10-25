import { estimateText } from "../labels/placement";
import type { Scene } from "../shared/scene";
import type { MapNode } from "../shared/spec";
import { toScreen, type Viewport } from "../viewport/viewport";
import { clipToBox, drawnEdges } from "./paintEdges";

/** A box at the edge of the map naming a drawn neighbour that lies off screen (spec slice E §6). */
export interface EdgeMarker {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MARKER_HEIGHT = 22;
export const MARKER_MAXIMUM_WIDTH = 160;
export const MARKER_FONT = "12px system-ui, sans-serif";
export const MARKER_GAP = 4;
// Horizontal padding inside a marker, both sides together.
const MARKER_PADDING = 16;

type Side = "left" | "right" | "top" | "bottom";

function sideOf([horizontal, vertical]: [number, number], width: number): Side {
  if (horizontal <= 0) return "left";
  if (horizontal >= width) return "right";
  if (vertical <= 0) return "top";
  return "bottom";
}

/**
 * One marker per drawn edge of `id` whose neighbour is off screen, placed
 * inside the box against the edge the line leaves through, centred on where
 * it leaves; markers on one edge are pushed apart along it, and stack back
 * from the end when they run past it. A neighbour gets no marker when its
 * segment never crosses the box (both ends off screen, the line passing
 * outside it): nothing on screen points that way, so there is no edge to pin
 * a marker to.
 */
export function edgeMarkers(
  scene: Pick<Scene, "related" | "byId">,
  viewport: Viewport,
  options: { id: string; width: number; height: number; cap: number; dimmed: ReadonlySet<string> },
): EdgeMarker[] {
  const origin = scene.byId.get(options.id);
  if (!origin || options.cap <= 0) return [];
  const originPoint = toScreen(viewport, origin.x, origin.y);
  const bySide = new Map<Side, Array<EdgeMarker & { along: number }>>();
  for (const edge of drawnEdges(scene, options.id, options.cap, options.dimmed)) {
    const neighbour = scene.byId.get(edge.neighbour) as MapNode;
    const neighbourPoint = toScreen(viewport, neighbour.x, neighbour.y);
    const onScreen =
      neighbourPoint[0] >= 0 &&
      neighbourPoint[0] <= options.width &&
      neighbourPoint[1] >= 0 &&
      neighbourPoint[1] <= options.height;
    if (onScreen) continue;
    const clipped = clipToBox(originPoint, neighbourPoint, options.width, options.height);
    if (!clipped) continue;
    const anchor = clipped[1];
    const side = sideOf(anchor, options.width);
    const width = Math.min(MARKER_MAXIMUM_WIDTH, estimateText(neighbour.label, MARKER_FONT).width + MARKER_PADDING);
    const alongHorizontalEdge = side === "top" || side === "bottom";
    const along = alongHorizontalEdge ? anchor[0] - width / 2 : anchor[1] - MARKER_HEIGHT / 2;
    const left = side === "right" ? options.width - width : 0;
    const top = side === "bottom" ? options.height - MARKER_HEIGHT : 0;
    const list = bySide.get(side) ?? [];
    list.push({ id: neighbour.id, label: neighbour.label, left, top, width, height: MARKER_HEIGHT, along });
    bySide.set(side, list);
  }
  const markers: EdgeMarker[] = [];
  for (const [side, list] of bySide) {
    const alongHorizontalEdge = side === "top" || side === "bottom";
    const limit = alongHorizontalEdge ? options.width : options.height;
    const sizeOf = (marker: EdgeMarker) => (alongHorizontalEdge ? marker.width : marker.height);
    list.sort((first, second) => first.along - second.along || (first.id < second.id ? -1 : 1));
    // Forward pass: each marker at its anchor or just past the previous one.
    const starts: number[] = [];
    let nextFree = 0;
    for (const marker of list) {
      const start = Math.max(0, marker.along, nextFree);
      starts.push(start);
      nextFree = start + sizeOf(marker) + MARKER_GAP;
    }
    // Backward pass: whatever ran past the end stacks back from it.
    let limitFree = limit;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const size = sizeOf(list[index] as EdgeMarker);
      const start = Math.min(starts[index] as number, limitFree - size);
      starts[index] = Math.max(0, start);
      limitFree = start - MARKER_GAP;
    }
    for (const [index, marker] of list.entries()) {
      const { along: _along, ...placed } = marker;
      const start = starts[index] as number;
      markers.push(alongHorizontalEdge ? { ...placed, left: start } : { ...placed, top: start });
    }
  }
  return markers;
}

/** The id of the topmost marker containing the box position, or null. */
export function markerAt(markers: readonly EdgeMarker[], horizontal: number, vertical: number): string | null {
  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index] as EdgeMarker;
    if (
      horizontal >= marker.left &&
      horizontal <= marker.left + marker.width &&
      vertical >= marker.top &&
      vertical <= marker.top + marker.height
    )
      return marker.id;
  }
  return null;
}
