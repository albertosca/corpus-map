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
   * divided by `fitScale`): the label is drawn when `viewport.scale >=
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
  const counts = inputs.map((input) => input.members).sort((first, second) => first - second);
  const classes = new Map<string, LabelClass>();
  const denominator = Math.max(1, counts.length - 1);
  for (const input of inputs) {
    const rank = counts.indexOf(input.members) / denominator;
    classes.set(input.id, rank >= cut.large ? "large" : rank >= cut.medium ? "medium" : "small");
  }
  return classes;
}

/** Scale at which two label boxes, anchored `horizontalDelta`,`verticalDelta` apart in world units, stop overlapping. */
export function separationScale(horizontalDelta: number, verticalDelta: number, width: number, height: number): number {
  const horizontalScale =
    horizontalDelta === 0 ? Number.POSITIVE_INFINITY : (width + LABEL_PADDING) / Math.abs(horizontalDelta);
  const verticalScale =
    verticalDelta === 0 ? Number.POSITIVE_INFINITY : (height + LABEL_PADDING) / Math.abs(verticalDelta);
  return Math.min(horizontalScale, verticalScale);
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
  const ordered = [...inputs].sort(
    (first, second) => second.members - first.members || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0),
  );
  const placed: PlacedLabel[] = [];
  for (const input of ordered) {
    const labelClass = classes.get(input.id) ?? "small";
    const { width, height } = measure(input.name, fonts[labelClass]);
    let activeFromScale = 0;
    for (const other of placed) {
      const separation = separationScale(
        input.anchor[0] - other.anchor[0],
        input.anchor[1] - other.anchor[1],
        (width + other.width) / 2,
        (height + other.height) / 2,
      );
      if (other.activeFromScale < separation && separation > activeFromScale) activeFromScale = separation;
    }
    placed.push({ id: input.id, name: input.name, anchor: input.anchor, labelClass, width, height, activeFromScale });
  }
  return placed;
}

/** Deterministic text measure for environments without a canvas (tests). */
export function estimateText(text: string, font: string): { width: number; height: number } {
  const pixels = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
  return { width: text.length * 0.6 * pixels, height: pixels };
}
