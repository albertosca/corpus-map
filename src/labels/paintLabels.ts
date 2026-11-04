import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import { DENSE_NAME_ALPHA, type Presentation } from "../shared/presentation";
import { GROUP_LETTER_SPACING, type Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { levelsOf } from "../territories/familyFocus";
import { toScreen, type Viewport } from "../viewport/viewport";
import type { PlacedItemLabel } from "./itemLabels";
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
  /** Draw the family names compact, as a box narrower than `NARROW_BOX_WIDTH` does (spec mobile §4); absent means false. */
  compactGroupNames?: boolean | undefined;
  /** Family id → weight (spec family focus §3): a family's leaf names are drawn at `(1 - groupAlpha) * weight`, its own name at the rest. Absent means every family at 1. */
  focus?: ReadonlyMap<string, number> | undefined;
  /** The item label plates drawn this frame (near only; review I-2): a family name gives way to one it overlaps, by `itemPlateAlpha`. Absent means none. */
  itemPlates?: readonly PlacedItemLabel[] | undefined;
  /** The alpha the plates are drawn at; absent means 0. */
  itemPlateAlpha?: number | undefined;
}

interface Item {
  name: string;
  anchor: readonly [number, number];
  font: string;
  alpha: number;
  letterSpacing?: string;
}

/** How far two name boxes must overlap, in screen pixels, before one gives way completely: a smaller overlap fades it in proportion, so a zoom across the edge never pops it. */
const OVERLAP_BAND = 8;

/**
 * How much of `label`'s box the box of width/height centred `(offsetAcross, offsetDown)` screen pixels away
 * covers, in [0, 1]: 0 when they only touch, 1 from `OVERLAP_BAND` pixels of overlap.
 */
function coverage(offsetAcross: number, offsetDown: number, width: number, height: number, label: PlacedLabel): number {
  const across = (width + label.width) / 2 - Math.abs(offsetAcross);
  const down = (height + label.height) / 2 - Math.abs(offsetDown);
  return across <= 0 || down <= 0 ? 0 : Math.min(1, Math.min(across, down) / OVERLAP_BAND);
}

/**
 * The strongest cover over `label` by a drawn item label plate. Both are measured in screen pixels
 * from the anchors and the plate's offset, so a pan changes neither the answer nor the fade.
 */
function platedOver(label: PlacedLabel, plates: readonly PlacedItemLabel[], scale: number): number {
  let strongest = 0;
  for (const plate of plates)
    strongest = Math.max(
      strongest,
      coverage(
        (plate.anchor[0] - label.anchor[0]) * scale + plate.offset[0],
        (plate.anchor[1] - label.anchor[1]) * scale + plate.offset[1],
        plate.width,
        plate.height,
        label,
      ),
    );
  return strongest;
}

/** The strongest cover over `label` by a drawn leaf name, at that name's drawn alpha. Both boxes are centred on their anchors and measured in screen pixels. */
function boxedBy(
  label: PlacedLabel,
  drawn: ReadonlyArray<{ label: PlacedLabel; alpha: number }>,
  scale: number,
): number {
  let strongest = 0;
  for (const { label: leaf, alpha } of drawn)
    strongest = Math.max(
      strongest,
      alpha *
        coverage(
          (leaf.anchor[0] - label.anchor[0]) * scale,
          (leaf.anchor[1] - label.anchor[1]) * scale,
          leaf.width,
          leaf.height,
          label,
        ),
    );
  return strongest;
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
 * ignored. A family of one territory named like it draws that name once, as
 * the territory's, at full alpha through the fade (while the territory's name
 * is not drawn yet, the family's stays). In dense, medium and small territory names are drawn at
 * `DENSE_NAME_ALPHA`. Names are drawn brightest first (a stable sort keeps
 * the placement order within an alpha), `globalAlpha` is set only when it
 * changes and is left at 1, and a name at alpha 0 is not drawn at all. A
 * dimmed territory's name, and a group's name when every member is dimmed,
 * are drawn at `DIMMED_ALPHA` of their alpha, so after the others.
 */
export function paintLabels(surface: Surface, scene: Scene, viewport: Viewport, theme: Theme, box: LabelBox): void {
  const hasGroups = scene.groups.length > 0;
  const groupAlpha = hasGroups ? (box.groupAlpha ?? 0) : 0;
  const dimmed = box.dimmed ?? NO_DIMMED;
  const fadeOf = (isDimmed: boolean) => (isDimmed ? DIMMED_ALPHA : 1);
  const isWhollyDimmed = (members: readonly string[]) =>
    members.length > 0 && members.every((member) => dimmed.has(member));
  const fits = (label: PlacedLabel) =>
    viewport.scale >= label.activeFromScale && label.width <= box.width && label.height <= box.height;
  const items: Item[] = [];
  const groupsById = new Map(scene.groups.map((group) => [group.id, group]));
  const familyOfLeaf = new Map(scene.groups.flatMap((group) => group.members.map((member) => [member, group.id])));
  const weightOf = (familyId: string | undefined) => (familyId === undefined ? 1 : (box.focus?.get(familyId) ?? 1));
  // A family of one territory named like it shows that name once: the family
  // hands it to the territory, drawn at full alpha through the fade, while the
  // territory's own name is drawn (backlog 2026-10-26).
  // One set holds both ids: the family's and the territory's (ids are unique across all territories).
  const handedOver = new Set<string>();
  const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
  for (const group of scene.groups) {
    if (levelsOf(groupAlpha, weightOf(group.id)).family <= 0) continue;
    const label = group.members.length === 1 ? labelsById.get(group.members[0] as string) : undefined;
    if (label && label.id !== group.id && label.name === group.name && fits(label))
      handedOver.add(group.id).add(label.id);
  }
  // Each leaf name drawn, at the alpha it is drawn at, so a family name gives way to what is really on screen.
  const drawnLeaves: Array<{ label: PlacedLabel; alpha: number }> = [];
  for (const label of scene.labels) {
    if (!fits(label)) continue;
    const level = levelsOf(groupAlpha, weightOf(familyOfLeaf.get(label.id))).leaf;
    if (level <= 0 && !handedOver.has(label.id)) continue;
    const alpha =
      (handedOver.has(label.id) ? 1 : level) *
      (box.presentation === "dense" && label.labelClass !== "large" ? DENSE_NAME_ALPHA : 1) *
      fadeOf(dimmed.has(label.id));
    if (alpha > 0) drawnLeaves.push({ label, alpha });
    items.push({
      name: label.name,
      anchor: label.anchor,
      font: theme.territoryFonts[label.labelClass],
      alpha,
    });
  }
  const [groupLabels, groupFont] = box.compactGroupNames
    ? [scene.compactGroupLabels, scene.compactGroupFont]
    : [scene.groupLabels, theme.territoryFonts.large];
  for (const label of groupLabels) {
    if (!fits(label) || handedOver.has(label.id)) continue;
    const weight = weightOf(label.id);
    const level = levelsOf(groupAlpha, weight).family;
    if (level <= 0) continue;
    // A family the focus has taken down a level shares the map with leaf names it was not placed
    // against: it gives way to a drawn leaf name that boxes it, by that name's level (no pop on pan).
    const underLeaf = weight < 1 ? 1 - boxedBy(label, drawnLeaves, viewport.scale) : 1;
    // And to an item label plate drawn over it at near, which was placed against the leaf names only.
    const underPlate =
      box.itemPlates === undefined
        ? 1
        : 1 - platedOver(label, box.itemPlates, viewport.scale) * (box.itemPlateAlpha ?? 0);
    const clear = underLeaf * underPlate;
    if (clear <= 0) continue;
    items.push({
      name: label.name,
      anchor: label.anchor,
      font: groupFont,
      alpha: level * clear * fadeOf(isWhollyDimmed(groupsById.get(label.id)?.members ?? [])),
      letterSpacing: `${GROUP_LETTER_SPACING}px`,
    });
  }
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
