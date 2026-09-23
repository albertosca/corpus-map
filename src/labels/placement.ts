import type { Point } from "../territories/shape";

export type LabelClass = "large" | "medium" | "small";

export interface LabelInput {
  id: string;
  name: string;
  anchor: Point;
  members: number;
}

export interface PlacedLabel {
  id: string;
  name: string;
  anchor: Point;
  labelClass: LabelClass;
  width: number;
  height: number;
  /**
   * Absolute scale units (`s_ij`, the same units as `Viewport.scale`, never
   * divided by `fitScale`): the label is drawn when `vp.scale >=
   * activeFromScale`. Keeping it absolute is what lets a resize — which only
   * changes `fitScale` — skip a scene rebuild.
   */
  activeFromScale: number;
}

export type Measure = (text: string, font: string) => { width: number; height: number };

export const LABEL_PADDING = 2;

/** Percentile rank in [0, 1] of each member count (ties share the lower rank). */
export function labelClasses(
  inputs: readonly LabelInput[],
  cut: { large: number; medium: number },
): Map<string, LabelClass> {
  const counts = inputs.map((l) => l.members).sort((a, b) => a - b);
  const out = new Map<string, LabelClass>();
  const n = Math.max(1, counts.length - 1);
  for (const l of inputs) {
    const rank = counts.indexOf(l.members) / n;
    out.set(l.id, rank >= cut.large ? "large" : rank >= cut.medium ? "medium" : "small");
  }
  return out;
}

/** Scale at which two label boxes, anchored `dx`,`dy` apart in world units, stop overlapping. */
export function separationScale(dx: number, dy: number, w: number, h: number): number {
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : (w + LABEL_PADDING) / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : (h + LABEL_PADDING) / Math.abs(dy);
  return Math.min(sx, sy);
}

/**
 * Active ranges after Been, Daiches and Yap (2006): labels in priority order
 * (more members first, then id); each starts at the smallest absolute scale
 * at which it no longer overlaps any higher-priority label already visible
 * there. A label, once shown, stays shown on zoom in, never changes on pan,
 * and the set shown depends only on the current scale.
 */
export function placeLabels(
  inputs: readonly LabelInput[],
  fonts: Record<LabelClass, string>,
  cut: { large: number; medium: number },
  measure: Measure,
): PlacedLabel[] {
  const classes = labelClasses(inputs, cut);
  const ordered = [...inputs].sort((a, b) => b.members - a.members || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: PlacedLabel[] = [];
  for (const l of ordered) {
    const labelClass = classes.get(l.id) ?? "small";
    const { width, height } = measure(l.name, fonts[labelClass]);
    let activeFromScale = 0;
    for (const p of placed) {
      const s = separationScale(
        l.anchor[0] - p.anchor[0],
        l.anchor[1] - p.anchor[1],
        (width + p.width) / 2,
        (height + p.height) / 2,
      );
      if (p.activeFromScale < s && s > activeFromScale) activeFromScale = s;
    }
    placed.push({ id: l.id, name: l.name, anchor: l.anchor, labelClass, width, height, activeFromScale });
  }
  return placed;
}

/** Deterministic text measure for environments without a canvas (tests). */
export function estimateText(text: string, font: string): { width: number; height: number } {
  const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
  return { width: text.length * 0.6 * px, height: px };
}
