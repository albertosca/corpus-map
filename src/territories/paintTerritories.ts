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

/**
 * Fills every shape opaque, in order, into one layer composited at the strongest of `alphas` (one per shape, a
 * dimmed one at `DIMMED_ALPHA` of its own). When the alphas differ, each shape first erases what is under it and is
 * then drawn at its alpha relative to the strongest, so a pixel still shows the smallest territory covering it, at
 * that territory's own alpha, and overlaps never darken or reorder across steps.
 */
function fillLayer(surface: Surface, projected: readonly Projected[], alphas: readonly number[], empty: number): void {
  // No shape: the layer is still opened at `empty` (the base alpha), as it always was; Math.max() of nothing is -Infinity.
  const strongest = alphas.length === 0 ? empty : Math.max(...alphas);
  const mixed = alphas.some((alpha) => alpha !== strongest);
  surface.layer(strongest, (layer) => {
    let current = 1;
    projected.forEach(({ colour, rings, isDimmed }, position) => {
      const wanted = (mixed ? (alphas[position] as number) / strongest : 1) * (isDimmed ? DIMMED_ALPHA : 1);
      if (wanted !== current) {
        layer.globalAlpha(wanted);
        current = wanted;
      }
      if (mixed) layer.erase(rings);
      for (const ring of rings) layer.polygon(ring, colour, "transparent");
    });
    if (current !== 1) layer.globalAlpha(1);
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

/** The projected shapes grouped by their level, in order of first appearance; a level of 0 or less draws nothing. */
function byLevel(
  projected: readonly Projected[],
  levels: readonly number[],
): Array<{ level: number; shapes: Projected[]; positions: number[] }> {
  const groups = new Map<number, { level: number; shapes: Projected[]; positions: number[] }>();
  projected.forEach((shape, position) => {
    const level = levels[position] as number;
    if (level <= 0) return;
    const group = groups.get(level) ?? { level, shapes: [], positions: [] };
    group.shapes.push(shape);
    group.positions.push(position);
    groups.set(level, group);
  });
  return [...groups.values()];
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
 * (1 where no point is drawn, 0 where the points are fully drawn) and capped at 1; no visited node leaves the calls
 * unchanged. Territories at different visited steps share the layer (each erases what is under it, `fillLayer`), so
 * the smallest-on-top rule holds across steps.
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
  // The visited factor, blended toward 1 by `1 - visitedStrength` (the points fading in take the boost away), and
  // the boosted alpha capped at 1: a theme fill above 1 / 1.5 must not turn a fully visited territory opaque.
  const boostedBy = (share: number | undefined, base: number) =>
    Math.min(1, base * (1 + (visitedFactor(share ?? 0) - 1) * visitedStrength));
  const boosted = (id: string, base: number) => boostedBy(scene.visitedShare.get(id), base);
  if (scene.groupShapes.size === 0) {
    // One layer; with none visited every alpha is `fillAlpha` and these are the calls it always issued.
    fillLayer(
      surface,
      leaves,
      scene.paintOrder.map((id) => boosted(id, fillAlpha)),
      fillAlpha,
    );
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
  // A shape's fill alpha is the base times its visited factor times its level; one layer per level.
  const leafGroups = byLevel(leaves, leafLevels);
  for (const { level, shapes, positions } of leafGroups)
    fillLayer(
      surface,
      shapes,
      positions.map((position) => boosted(scene.paintOrder[position] as string, fillAlpha) * level),
      fillAlpha,
    );
  // The family layer goes over its leaves' layer, so it is drawn at the alpha that leaves the pair as opaque as
  // `fillAlpha` itself: 1 - (1 - fillAlpha * leaf) * (1 - alpha) = fillAlpha. Without it a mid transition showed
  // a lighter fill than either end (review M-6). At level 1 (no leaf layer under it) this is `fillAlpha`.
  for (const { level, shapes, positions } of byLevel(families, familyLevels))
    fillLayer(
      surface,
      shapes,
      positions.map((position) => {
        const strong = boostedBy(scene.groupVisitedShare.get(familyOrder[position] as string), fillAlpha);
        return (strong * level) / (1 - strong * (1 - level));
      }),
      fillAlpha,
    );
  for (const { level, shapes } of leafGroups) outlines(surface, shapes, TERRITORY_OUTLINE_WIDTH, level);
  outlines(surface, families, GROUP_OUTLINE_WIDTH, 1);
}
