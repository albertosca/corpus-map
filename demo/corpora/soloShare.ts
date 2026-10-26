import { type CardAnchor, layoutCards } from "../../src/cards/layout";
import { estimateText } from "../../src/labels/placement";
import { visibleNodes } from "../../src/lod/visible";
import { buildScene, type Scene } from "../../src/shared/scene";
import type { MapSpec } from "../../src/shared/spec";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitScene } from "../../src/viewport/fitScene";
import { toScreen } from "../../src/viewport/viewport";
import type { CardSize } from "./display";

/**
 * Metric 18's measure (spec 2026-10-25-display-settings-design.md section 5):
 * how many of the items a reader sees get a card of their own, not a share of
 * a group card. Test-only, beside the corpora it measures.
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

/** The `nearAt` values the criterion tries, earliest first; 6 is the default before slice G. */
export const NEAR_AT_CANDIDATES: readonly number[] = [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const BASELINE_NEAR_AT = 6;
/** How far below today's solo share an earlier `nearAt` may land and still pass. */
const TOLERANCE = 0.1;
const FIT_PADDING = 24;
const CARD_CAP = 200;

const scenes = new WeakMap<MapSpec, Scene>();

function sceneOf(spec: MapSpec): Scene {
  const known = scenes.get(spec);
  if (known) return known;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  scenes.set(spec, scene);
  return scene;
}

/**
 * The mean, over territories with at least one item on screen, of the share
 * of on-screen items whose card holds them alone, with the box centred on
 * each territory's members at `ratio` times the fitted scale.
 */
export function soloShare(spec: MapSpec, box: Box, cardSize: CardSize, ratio: number): number {
  const scale = fitScene(spec, sceneOf(spec), box.width, box.height, FIT_PADDING).scale * ratio;
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
    const shown = visibleNodes(spec, viewport, box.width, box.height, CARD_CAP);
    if (shown.length === 0) continue;
    const anchors: CardAnchor[] = shown.map((node) => {
      const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
      return { id: node.id, x: horizontal, y: vertical };
    });
    const solo = layoutCards(anchors, cardSize, box).filter((card) => card.ids.length === 1).length;
    total += solo / shown.length;
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

/**
 * The smallest candidate whose full-opacity ratio (`nearAt × (1 + fadeBand)`)
 * leaves every corpus, in both review boxes, no more than `TOLERANCE` below
 * its solo share at today's full opacity. Today's value always passes.
 */
export function chooseNearAt(specs: readonly MapSpec[], cardSizeOf: (spec: MapSpec) => CardSize): number {
  const opaque = 1 + DEFAULT_TUNING.fadeBand;
  const cases = specs.flatMap((spec) =>
    REVIEW_BOXES.map((box) => ({
      spec,
      box,
      cardSize: cardSizeOf(spec),
      baseline: soloShare(spec, box, cardSizeOf(spec), BASELINE_NEAR_AT * opaque),
    })),
  );
  for (const candidate of NEAR_AT_CANDIDATES) {
    const passes = cases.every(
      ({ spec, box, cardSize, baseline }) => soloShare(spec, box, cardSize, candidate * opaque) >= baseline - TOLERANCE,
    );
    if (passes) return candidate;
  }
  return BASELINE_NEAR_AT;
}
