import { compareIds } from "../shared/compareIds";
import type { MapSpec } from "../shared/spec";
import { finish, type Steps } from "../shared/steps";
import { type FixedBox, placingBoxes } from "./placeBoxes";
import type { Measure, PlacedLabel } from "./placement";

/** Screen pixels between the point's centre and the bottom of its label's plate. */
export const ITEM_LABEL_GAP = 6;
export const ITEM_LABEL_PADDING = { horizontal: 4, vertical: 2 } as const;
/** Line height as a multiple of the font's px size. */
export const ITEM_LABEL_LINE_HEIGHT = 1.25;
export const ITEM_LABEL_RADIUS = 3;
export const DEFAULT_ITEM_LABEL_FONT = "500 11px system-ui, sans-serif";
const ELLIPSIS = "…";

/** CSS pixels per unit of a font size; em and rem count against the browser's default 16px. */
const PIXELS_PER_UNIT: Readonly<Record<string, number>> = { px: 1, pt: 4 / 3, em: 16, rem: 16 };

/** The font's size in px, from a px, pt, em or rem size; 12 when it states none, as `estimateText` assumes. */
export function fontPixels(font: string): number {
  const size = /(?:^|\s)(\d*\.?\d+)(px|pt|rem|em)(?=[\s/]|$)/i.exec(font);
  if (!size) return 12;
  const [, amount, unit] = size as unknown as [string, string, string];
  return Number.parseFloat(amount) * (PIXELS_PER_UNIT[unit.toLowerCase()] as number);
}

/**
 * A line's width as the sum of its words' widths and of the single spaces
 * between them, the last word measured with any ellipsis it carries. The
 * measure then sees each word, not every candidate line the wrap tries:
 * fewer calls, and fewer distinct strings for a browser to shape and keep
 * (spec mobile §7: the arXiv corpus measured 77,000 distinct lines on load).
 * Across a space this drops only the kerning, which a browser's text does not
 * apply there; under `estimateText` the sum is exact.
 */
function lineWidth(line: string, font: string, measure: Measure): number {
  const [first = "", ...rest] = line.split(" ");
  let width = measure(first, font).width;
  for (const word of rest) width = extended(width, word, font, measure);
  return width;
}

/** A line's width with one more word after a space; summed in `lineWidth`'s order, so both agree to the bit. */
function extended(width: number, word: string, font: string, measure: Measure): number {
  return width + measure(" ", font).width + measure(word, font).width;
}

/** `measure` answering each (text, font) pair from the first call, for one placement run. */
function remembering(measure: Measure): Measure {
  const answersByFont = new Map<string, Map<string, ReturnType<Measure>>>();
  return (text, font) => {
    let answers = answersByFont.get(font);
    if (!answers) {
      answers = new Map();
      answersByFont.set(font, answers);
    }
    const known = answers.get(text);
    if (known) return known;
    const answer = measure(text, font);
    answers.set(text, answer);
    return answer;
  };
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
  const fits = (line: string) => lineWidth(line, font, measure) <= maximumWidth;
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
    let width = measure(line, font).width;
    if (width > maximumWidth) {
      lines.push(withEllipsis(line));
      continue;
    }
    while (index < words.length) {
      const next = words[index] as string;
      const nextWidth = extended(width, next, font, measure);
      if (nextWidth > maximumWidth) break;
      line = `${line} ${next}`;
      width = nextWidth;
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
  return finish(placingItemLabels(spec, seeds, options, measure));
}

/**
 * `placeItemLabels` one step per label wrapped and one per plate placed, so
 * a large corpus is placed in slices between frames (spec mobile §7).
 */
export function* placingItemLabels(
  spec: MapSpec,
  seeds: readonly PlacedLabel[],
  options: ItemLabelOptions,
  measure: Measure,
): Steps<PlacedItemLabel[]> {
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
  const wordMeasure = remembering(measure);
  const labels: PlacedItemLabel[] = [];
  for (const node of ordered) {
    const lines = wrapLabel(node.label, options.font, options.width, options.lines, wordMeasure);
    yield;
    if (lines.length === 0) continue;
    const textWidth = Math.max(...lines.map((line) => lineWidth(line, options.font, wordMeasure)));
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
  const scales = yield* placingBoxes(labels, fixed);
  return labels.map((label, index) => ({ ...label, activeFromScale: scales[index] as number }));
}
