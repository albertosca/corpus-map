import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import { DENSE_NAME_ALPHA, type Presentation } from "../shared/presentation";
import { GROUP_LETTER_SPACING, type Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import type { PlacedLabel } from "./placement";

/** The canvas's CSS size; a name larger than it is never drawn. */
export interface LabelBox {
  width: number;
  height: number;
  /** Absent means guided. */
  presentation?: Presentation | undefined;
  /** Group names' alpha (spec categories §4); territory names take the rest. Absent means 0. */
  groupAlpha?: number | undefined;
  /** Territory ids whose names are drawn at `DIMMED_ALPHA` (spec categories §5); absent means none. */
  dimmed?: ReadonlySet<string> | undefined;
}

interface Item {
  name: string;
  anchor: readonly [number, number];
  font: string;
  alpha: number;
  letterSpacing?: string;
}

/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached, except a name whose measured box is wider or taller
 * than the canvas: it could never be read whole anywhere on screen. Where a
 * name sits never enters the decision, so pan and zoom cannot make a name
 * pop out (map-feel metric 7).
 *
 * With groups, group names are drawn at `groupAlpha` and territory names at
 * the rest, so the two levels cross-fade; without groups `groupAlpha` is
 * ignored. In dense, medium and small territory names are drawn at
 * `DENSE_NAME_ALPHA`. Names are drawn brightest first (a stable sort keeps
 * the placement order within an alpha), `globalAlpha` is set only when it
 * changes and is left at 1, and a name at alpha 0 is not drawn at all. A
 * dimmed territory's name, and a group's name when every member is dimmed,
 * are drawn at `DIMMED_ALPHA` of their alpha, so after the others.
 */
export function paintLabels(surface: Surface, scene: Scene, viewport: Viewport, theme: Theme, box: LabelBox): void {
  const hasGroups = scene.groups.length > 0;
  const groupAlpha = hasGroups ? (box.groupAlpha ?? 0) : 0;
  const territoryAlpha = 1 - groupAlpha;
  const dimmed = box.dimmed ?? NO_DIMMED;
  const fadeOf = (isDimmed: boolean) => (isDimmed ? DIMMED_ALPHA : 1);
  const isWhollyDimmed = (members: readonly string[]) =>
    members.length > 0 && members.every((member) => dimmed.has(member));
  const fits = (label: PlacedLabel) =>
    viewport.scale >= label.activeFromScale && label.width <= box.width && label.height <= box.height;
  const items: Item[] = [];
  if (territoryAlpha > 0)
    for (const label of scene.labels)
      if (fits(label))
        items.push({
          name: label.name,
          anchor: label.anchor,
          font: theme.territoryFonts[label.labelClass],
          alpha:
            territoryAlpha *
            (box.presentation === "dense" && label.labelClass !== "large" ? DENSE_NAME_ALPHA : 1) *
            fadeOf(dimmed.has(label.id)),
        });
  const groupsById = new Map(scene.groups.map((group) => [group.id, group]));
  if (groupAlpha > 0)
    for (const label of scene.groupLabels)
      if (fits(label))
        items.push({
          name: label.name,
          anchor: label.anchor,
          font: theme.territoryFonts.large,
          alpha: groupAlpha * fadeOf(isWhollyDimmed(groupsById.get(label.id)?.members ?? [])),
          letterSpacing: `${GROUP_LETTER_SPACING}px`,
        });
  items.sort((first, second) => second.alpha - first.alpha);
  let current = 1;
  for (const item of items) {
    if (item.alpha !== current) {
      surface.globalAlpha(item.alpha);
      current = item.alpha;
    }
    const [horizontal, vertical] = toScreen(viewport, item.anchor[0], item.anchor[1]);
    if (item.letterSpacing === undefined)
      surface.text(item.name, horizontal, vertical, theme.territoryLabel, item.font);
    else surface.text(item.name, horizontal, vertical, theme.territoryLabel, item.font, item.letterSpacing);
  }
  if (current !== 1) surface.globalAlpha(1);
}
