import { compareIds } from "../shared/compareIds";
import type { MapSpec } from "../shared/spec";
import { type FixedBox, placeBoxes } from "./placeBoxes";
import type { Measure, PlacedLabel } from "./placement";

/** Screen pixels between the point's centre and the bottom of its label's plate. */
export const ITEM_LABEL_GAP = 6;
export const ITEM_LABEL_PADDING = { horizontal: 4, vertical: 2 } as const;
/** Line height as a multiple of the font's px size. */
export const ITEM_LABEL_LINE_HEIGHT = 1.25;
export const ITEM_LABEL_RADIUS = 3;
export const DEFAULT_ITEM_LABEL_FONT = "500 11px system-ui, sans-serif";
const ELLIPSIS = "…";

/** The font's px size; 12 when it states none, as `estimateText` assumes. */
export function fontPixels(font: string): number {
  return Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
}

/**
 * Greedy word wrap into at most `maximumLines` lines of at most
 * `maximumWidth` pixels; text left over ends the last line in an ellipsis,
 * and a single word wider than the width is cut with one.
 */
export function wrapLabel(
  text: string,
  font: string,
  maximumWidth: number,
  maximumLines: number,
  measure: Measure,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const fits = (line: string) => measure(line, font).width <= maximumWidth;
  const withEllipsis = (line: string): string => {
    let kept = line;
    while (kept.length > 0 && !fits(`${kept}${ELLIPSIS}`)) kept = kept.slice(0, -1).trimEnd();
    return `${kept}${ELLIPSIS}`;
  };
  const lines: string[] = [];
  let index = 0;
  while (index < words.length && lines.length < maximumLines) {
    let line = words[index] as string;
    index += 1;
    if (!fits(line)) {
      lines.push(withEllipsis(line));
      continue;
    }
    while (index < words.length && fits(`${line} ${words[index]}`)) {
      line = `${line} ${words[index]}`;
      index += 1;
    }
    lines.push(line);
  }
  const last = lines.length - 1;
  if (index < words.length && last >= 0) lines[last] = withEllipsis(lines[last] as string);
  return lines;
}

/** An item's label plate and the scale from which it is drawn (spec item labels §2-3). */
export interface PlacedItemLabel {
  id: string;
  territory: string | null;
  anchor: readonly [number, number];
  lines: string[];
  width: number;
  height: number;
  /** The plate centre's screen offset from the point: straight up, its bottom `ITEM_LABEL_GAP` above it. */
  offset: readonly [number, number];
  /** Absolute scale, as `PlacedLabel.activeFromScale`. */
  activeFromScale: number;
}

export interface ItemLabelOptions {
  font: string;
  width: number;
  lines: number;
}

/**
 * Every item's label plate, in priority order (`priority`, then edge count,
 * then id), with the scale from which it is drawn: the territory names in
 * `seeds` are placed first and never overlapped (spec item labels §3). The
 * edge count reads `spec.edges`, not the scene, so a palette change never
 * re-places the labels.
 */
export function placeItemLabels(
  spec: MapSpec,
  seeds: readonly PlacedLabel[],
  options: ItemLabelOptions,
  measure: Measure,
): PlacedItemLabel[] {
  const degree = new Map<string, number>();
  for (const edge of spec.edges ?? []) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const ordered = [...spec.nodes].sort(
    (first, second) =>
      (second.priority ?? 0) - (first.priority ?? 0) ||
      (degree.get(second.id) ?? 0) - (degree.get(first.id) ?? 0) ||
      compareIds(first.id, second.id),
  );
  const lineHeight = fontPixels(options.font) * ITEM_LABEL_LINE_HEIGHT;
  const labels: PlacedItemLabel[] = [];
  for (const node of ordered) {
    const lines = wrapLabel(node.label, options.font, options.width, options.lines, measure);
    if (lines.length === 0) continue;
    const textWidth = Math.max(...lines.map((line) => measure(line, options.font).width));
    const width = textWidth + 2 * ITEM_LABEL_PADDING.horizontal;
    const height = lines.length * lineHeight + 2 * ITEM_LABEL_PADDING.vertical;
    labels.push({
      id: node.id,
      territory: node.territory,
      anchor: [node.x, node.y],
      lines,
      width,
      height,
      offset: [0, -(height / 2 + ITEM_LABEL_GAP)],
      activeFromScale: 0,
    });
  }
  const fixed: FixedBox[] = seeds.map((seed) => ({
    id: seed.id,
    anchor: seed.anchor,
    width: seed.width,
    height: seed.height,
    offset: [0, 0],
    activeFromScale: seed.activeFromScale,
  }));
  const scales = placeBoxes(labels, fixed);
  return labels.map((label, index) => ({ ...label, activeFromScale: scales[index] as number }));
}
