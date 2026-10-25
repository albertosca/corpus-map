import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import { largestFirst } from "./colour";
import type { Ring } from "./shape";

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

/** Outlines every ring in its full colour at `width`, at `alpha` (a dimmed one at `DIMMED_ALPHA * alpha`). */
function outlines(surface: Surface, projected: readonly Projected[], width: number, alpha: number): void {
  let current = 1;
  for (const { colour, rings, isDimmed } of projected) {
    const wanted = isDimmed ? DIMMED_ALPHA * alpha : alpha;
    if (wanted !== current) {
      surface.globalAlpha(wanted);
      current = wanted;
    }
    for (const ring of rings) surface.outline(ring, colour, width);
  }
  if (current !== 1) surface.globalAlpha(1);
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
 */
export function paintTerritories(
  surface: Surface,
  scene: Scene,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral">,
  fillAlpha: number,
  dimmed: ReadonlySet<string> = NO_DIMMED,
  familyAlpha = 0,
): void {
  const leaves = project(
    scene.paintOrder,
    scene.shapes,
    scene.colours,
    theme.pointNeutral,
    (id) => dimmed.has(id),
    viewport,
  );
  if (scene.groupShapes.size === 0) {
    fillLayer(surface, leaves, fillAlpha);
    outlines(surface, leaves, TERRITORY_OUTLINE_WIDTH, 1);
    return;
  }
  const membersOf = new Map(scene.groups.map((group) => [group.id, group.members]));
  const families = project(
    largestFirst(scene.groupShapes),
    scene.groupShapes,
    scene.groupColours,
    theme.pointNeutral,
    (id) => (membersOf.get(id) ?? []).every((member) => dimmed.has(member)),
    viewport,
  );
  if (familyAlpha < 1) fillLayer(surface, leaves, fillAlpha * (1 - familyAlpha));
  if (familyAlpha > 0) fillLayer(surface, families, fillAlpha * familyAlpha);
  if (familyAlpha < 1) outlines(surface, leaves, TERRITORY_OUTLINE_WIDTH, 1 - familyAlpha);
  outlines(surface, families, GROUP_OUTLINE_WIDTH, 1);
}
