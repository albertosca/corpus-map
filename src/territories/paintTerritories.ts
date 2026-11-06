import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import { largestFirst } from "./colour";
import { levelsOf } from "./familyFocus";
import type { Ring } from "./shape";
import { visitedFactor } from "./visitedFactor";

/** Territory outline width in CSS pixels (spec slice D §3). */
export const TERRITORY_OUTLINE_WIDTH = 1.5;
/** A family's outline width in CSS pixels: the frame its children sit in (spec slice E §4). */
export const GROUP_OUTLINE_WIDTH = 2.5;

interface Projected {
  colour: string;
  isDimmed: boolean;
  rings: Array<Array<[number, number]>>;
}

/** Each id's rings in screen space, with its colour and whether it is dimmed; projected once per frame. */
function project(
  ids: readonly string[],
  shapes: ReadonlyMap<string, readonly Ring[]>,
  colours: ReadonlyMap<string, string>,
  neutral: string,
  isDimmed: (id: string) => boolean,
  viewport: Viewport,
): Projected[] {
  return ids.map((id) => ({
    colour: colours.get(id) ?? neutral,
    isDimmed: isDimmed(id),
    rings: (shapes.get(id) ?? [])
      .filter((ring) => ring.length >= 3)
      .map((ring) => ring.map(([horizontal, vertical]) => toScreen(viewport, horizontal, vertical))),
  }));
}

/** Fills every shape opaque, in order, into one layer composited at `alpha`; a dimmed one at `DIMMED_ALPHA`. */
function fillLayer(surface: Surface, projected: readonly Projected[], alpha: number): void {
  surface.layer(alpha, (layer) => {
    let faded = false;
    for (const { colour, rings, isDimmed } of projected) {
      if (isDimmed !== faded) {
        layer.globalAlpha(isDimmed ? DIMMED_ALPHA : 1);
        faded = isDimmed;
      }
      for (const ring of rings) layer.polygon(ring, colour, "transparent");
    }
    if (faded) layer.globalAlpha(1);
  });
}

/**
 * Outlines every ring in its full colour at `width`, at `alpha` (a dimmed one
 * at `DIMMED_ALPHA * alpha`), as one stroke per colour and alpha in the order
 * each first appears: one path per ring cost a stroke per ring (backlog,
 * measured in slice D). Where two colours' outlines cross, the colour that
 * appears later in `projected` is on top. One path is painted once where its
 * own rings cross, so a translucent outline (dimmed, mid cross-fade, or an
 * `rgba` theme colour) no longer darkens where two same-colour rings cross.
 */
function outlines(surface: Surface, projected: readonly Projected[], width: number, alpha: number): void {
  const batches = new Map<string, { colour: string; alpha: number; rings: Array<Array<[number, number]>> }>();
  for (const { colour, rings, isDimmed } of projected) {
    if (rings.length === 0) continue;
    const wanted = isDimmed ? DIMMED_ALPHA * alpha : alpha;
    const key = `${wanted} ${colour}`;
    const batch = batches.get(key) ?? { colour, alpha: wanted, rings: [] };
    batch.rings.push(...rings);
    batches.set(key, batch);
  }
  let current = 1;
  for (const batch of batches.values()) {
    if (batch.alpha !== current) {
      surface.globalAlpha(batch.alpha);
      current = batch.alpha;
    }
    surface.outline(batch.rings, batch.colour, width);
  }
  if (current !== 1) surface.globalAlpha(1);
}

/** The projected shapes grouped by their value, in order of first appearance; a value of 0 or less draws nothing. */
function byLevel(projected: readonly Projected[], levels: readonly number[]): Array<[number, Projected[]]> {
  const groups = new Map<number, Projected[]>();
  projected.forEach((shape, position) => {
    const level = levels[position] as number;
    if (level <= 0) return;
    const group = groups.get(level);
    if (group) group.push(shape);
    else groups.set(level, [shape]);
  });
  return [...groups];
}

/**
 * Fills every territory opaque, largest first, into one layer composited at
 * `fillAlpha`, so each pixel shows the colour of the smallest territory
 * covering it and overlaps never darken; then outlines every ring in its
 * territory's full colour. A territory missing from `scene.colours` (an
 * empty palette) is painted in `theme.pointNeutral`. A dimmed territory's
 * fill and outline are drawn at `DIMMED_ALPHA`.
 *
 * With groups (spec slice E §4), `familyAlpha` (the frame's group-name
 * alpha) picks the level: the leaves' layer at `fillAlpha * (1 -
 * familyAlpha)` and their outlines at `1 - familyAlpha`, the families' layer
 * at `fillAlpha * familyAlpha`, then every family's outline on top at
 * `GROUP_OUTLINE_WIDTH` as the frame its children sit in. A family whose
 * every leaf is dimmed is drawn at `DIMMED_ALPHA`.
 *
 * `focus` (spec family focus §4) gives each family a weight; its leaves are
 * drawn at `(1 - familyAlpha) * weight` and its own region at the rest. Shapes
 * of one level share one layer (and one stroke alpha), so overlaps inside a
 * level never darken and the steady state stays at two layers. Absent, or all
 * 1, it draws exactly what it drew before; a leaf in no family counts as 1.
 *
 * A territory's fill alpha is also multiplied by its visited factor (spec far-visited), scaled by `visitedStrength`
 * (1 where no point is drawn, 0 where the points are fully drawn); no visited node leaves the calls unchanged.
 */
export function paintTerritories(
  surface: Surface,
  scene: Scene,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral">,
  fillAlpha: number,
  dimmed: ReadonlySet<string> = NO_DIMMED,
  familyAlpha = 0,
  focus?: ReadonlyMap<string, number>,
  visitedStrength = 1,
): void {
  const leaves = project(
    scene.paintOrder,
    scene.shapes,
    scene.colours,
    theme.pointNeutral,
    (id) => dimmed.has(id),
    viewport,
  );
  // The visited factor, blended toward 1 by `1 - visitedStrength` (the points fading in take the boost away).
  const boost = (id: string) => 1 + (visitedFactor(scene.visitedShare.get(id) ?? 0) - 1) * visitedStrength;
  if (scene.groupShapes.size === 0) {
    // Territories at one visited step share a layer; with none visited this is the one layer at `fillAlpha`.
    const alphas = scene.paintOrder.map((id) => fillAlpha * boost(id));
    for (const [alpha, group] of byLevel(leaves, alphas)) fillLayer(surface, group, alpha);
    outlines(surface, leaves, TERRITORY_OUTLINE_WIDTH, 1);
    return;
  }
  const membersOf = new Map(scene.groups.map((group) => [group.id, group.members]));
  const familyOfLeaf = new Map(scene.groups.flatMap((group) => group.members.map((member) => [member, group.id])));
  const familyOrder = largestFirst(scene.groupShapes);
  const families = project(
    familyOrder,
    scene.groupShapes,
    scene.groupColours,
    theme.pointNeutral,
    (id) => (membersOf.get(id) ?? []).every((member) => dimmed.has(member)),
    viewport,
  );
  const leafLevels = scene.paintOrder.map(
    (id) => levelsOf(familyAlpha, focus?.get(familyOfLeaf.get(id) ?? "") ?? 1).leaf,
  );
  const familyLevels = familyOrder.map((id) => levelsOf(familyAlpha, focus?.get(id) ?? 1).family);
  // A shape's fill alpha is the base times its visited factor times its level; shapes at one alpha share a layer.
  const leafAlphas = scene.paintOrder.map((id, position) => fillAlpha * boost(id) * (leafLevels[position] as number));
  for (const [alpha, group] of byLevel(leaves, leafAlphas)) fillLayer(surface, group, alpha);
  const leafGroups = byLevel(leaves, leafLevels);
  // The family layer goes over its leaves' layer, so it is drawn at the alpha that leaves the pair as opaque as
  // `fillAlpha` itself: 1 - (1 - fillAlpha * leaf) * (1 - alpha) = fillAlpha. Without it a mid transition showed
  // a lighter fill than either end (review M-6). At level 1 (no leaf layer under it) this is `fillAlpha`.
  const familyAlphas = familyOrder.map((id, position) => {
    const boosted = fillAlpha * boost(id);
    const level = familyLevels[position] as number;
    return level <= 0 ? 0 : (boosted * level) / (1 - boosted * (1 - level));
  });
  for (const [alpha, group] of byLevel(families, familyAlphas)) fillLayer(surface, group, alpha);
  for (const [level, group] of leafGroups) outlines(surface, group, TERRITORY_OUTLINE_WIDTH, level);
  outlines(surface, families, GROUP_OUTLINE_WIDTH, 1);
}
