import { DEFAULT_ITEM_LABEL_FONT, type PlacedItemLabel, placeItemLabels } from "../../src/labels/itemLabels";
import { drawnItemLabels } from "../../src/labels/paintItemLabels";
import { estimateText } from "../../src/labels/placement";
import { visibleNodes } from "../../src/lod/visible";
import { buildScene, type Scene } from "../../src/shared/scene";
import type { MapSpec } from "../../src/shared/spec";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitScene } from "../../src/viewport/fitScene";

/**
 * Metric 18's measure (spec 2026-10-30-item-labels-design.md section 6): how
 * many of the items a reader sees carry a drawn item label. Test-only,
 * beside the corpora it measures.
 */

export interface Box {
  width: number;
  height: number;
}

/** The two review viewports less the top bar. */
export const REVIEW_BOXES: readonly Box[] = [
  { width: 1440, height: 860 },
  { width: 375, height: 740 },
];

/** The `nearAt` values the criterion tries, earliest first. */
export const NEAR_AT_CANDIDATES: readonly number[] = [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const BASELINE_NEAR_AT = 6;
/** How far below the share at the baseline an earlier `nearAt` may land and still pass. */
const TOLERANCE = 0.1;
const FIT_PADDING = 24;
const NO_DIMMED = new Set<string>();

const placed = new WeakMap<MapSpec, { scene: Scene; labels: Map<string, PlacedItemLabel> }>();

function placedOf(spec: MapSpec): { scene: Scene; labels: Map<string, PlacedItemLabel> } {
  const known = placed.get(spec);
  if (known) return known;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const options = {
    font: DEFAULT_ITEM_LABEL_FONT,
    width: DEFAULT_TUNING.itemLabelWidth,
    lines: DEFAULT_TUNING.itemLabelLines,
  };
  const labels = new Map(placeItemLabels(spec, scene.labels, options, estimateText).map((label) => [label.id, label]));
  const entry = { scene, labels };
  placed.set(spec, entry);
  return entry;
}

/**
 * The mean, over territories with at least one item on screen, of the share
 * of on-screen items whose label is drawn, with the box centred on each
 * territory's members at `ratio` times the fitted scale.
 */
export function labelledShare(spec: MapSpec, box: Box, ratio: number): number {
  const { scene, labels } = placedOf(spec);
  const scale = fitScene(spec, scene, box.width, box.height, FIT_PADDING).scale * ratio;
  const members = new Map<string, Array<[number, number]>>();
  for (const node of spec.nodes) {
    if (node.territory === null) continue;
    const points = members.get(node.territory) ?? [];
    points.push([node.x, node.y]);
    members.set(node.territory, points);
  }
  let total = 0;
  let counted = 0;
  for (const points of members.values()) {
    const centreHorizontal = points.reduce((sum, [horizontal]) => sum + horizontal, 0) / points.length;
    const centreVertical = points.reduce((sum, [, vertical]) => sum + vertical, 0) / points.length;
    const viewport = {
      scale,
      tx: box.width / 2 - centreHorizontal * scale,
      ty: box.height / 2 - centreVertical * scale,
    };
    const shown = visibleNodes(spec, viewport, box.width, box.height, Number.POSITIVE_INFINITY);
    if (shown.length === 0) continue;
    const candidates = shown.flatMap((node) => {
      const label = labels.get(node.id);
      return label ? [label] : [];
    });
    const drawn = drawnItemLabels(candidates, viewport, { ...box, dimmed: NO_DIMMED }).length;
    total += drawn / shown.length;
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

/**
 * The smallest candidate whose full-opacity ratio (`nearAt × (1 + fadeBand)`)
 * leaves every corpus, in both review boxes, no more than `TOLERANCE` below
 * its labelled share at the baseline's full opacity. The baseline always passes.
 */
export function chooseNearAt(specs: readonly MapSpec[]): number {
  const opaque = 1 + DEFAULT_TUNING.fadeBand;
  const cases = specs.flatMap((spec) =>
    REVIEW_BOXES.map((box) => ({ spec, box, baseline: labelledShare(spec, box, BASELINE_NEAR_AT * opaque) })),
  );
  for (const candidate of NEAR_AT_CANDIDATES) {
    if (cases.every(({ spec, box, baseline }) => labelledShare(spec, box, candidate * opaque) >= baseline - TOLERANCE))
      return candidate;
  }
  return BASELINE_NEAR_AT;
}
