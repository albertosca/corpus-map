import { paintFocusedNode, paintFocusedTerritory } from "../a11y/paintFocus";
import { paintEdges } from "../edges/paintEdges";
import type { PlacedItemLabel } from "../labels/itemLabels";
import { paintItemLabels } from "../labels/paintItemLabels";
import { paintLabels } from "../labels/paintLabels";
import type { Regime } from "../lod/lod";
import { paintPoints } from "../points/paintPoints";
import { paintSelection } from "../points/paintSelection";
import { paintTerritories } from "../territories/paintTerritories";
import type { Viewport } from "../viewport/viewport";
import { NO_DIMMED } from "./dimmed";
import { DENSE_FILL_FACTOR, type Presentation } from "./presentation";
import type { Scene } from "./scene";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";

/**
 * Per-frame values a precomputed `Scene` does not carry: the regime, the
 * point layer's fade, and the canvas's CSS size (a name larger than the
 * canvas is skipped, see `paintLabels`). No ratio here — a placed
 * name carries its own absolute `activeFromScale` (see
 * `labels/placement.ts`), so `paintLabels` reads `viewport.scale` directly
 * instead of a fit-relative ratio threaded through the frame.
 *
 * `focusedTerritory`/`focusedNode` are the ids (primitives, so they can sit
 * in an effect's dependency list) of the territory or item whose button in
 * the accessible tree has keyboard focus; absent or `null` means none.
 */
export interface Frame {
  regime: Regime;
  pointAlpha: number;
  width: number;
  height: number;
  focusedTerritory?: string | null | undefined;
  focusedNode?: string | null | undefined;
  /** Guided or dense emphasis (spec slice D §4); absent means guided. */
  presentation?: Presentation | undefined;
  /** Group names' alpha this frame (spec categories §4); absent means 0. */
  groupAlpha?: number | undefined;
  /** Territory ids drawn at `DIMMED_ALPHA` (spec categories §5); absent means none. */
  dimmed?: ReadonlySet<string> | undefined;
  /** The selected item's id, ringed inside the point layer (spec slice C §5); absent or `null` means none. */
  selected?: string | null | undefined;
  /** The hovered item's id, whose edges are previewed at half the point alpha (spec slice E §6); absent or `null` means none. */
  hovered?: string | null | undefined;
  /** How many edges an item draws (`Tuning.edgesPerNode`); absent means none. */
  edgesPerNode?: number | undefined;
  /** Item labels placed for this spec (spec item labels §3); painted at near only. Absent means none. */
  itemLabels?: readonly PlacedItemLabel[] | undefined;
  /** The item labels' fade this frame (`cardOpacity`); absent means 0. */
  itemLabelAlpha?: number | undefined;
  /** The family names are the compact ones, for a box narrower than `NARROW_BOX_WIDTH` (spec mobile §4); absent means false. */
  compactGroupNames?: boolean | undefined;
}

/**
 * The single place that decides paint order: the territory fill layer
 * (largest first; with groups, the leaves' and the families' layers
 * cross-faded by `groupAlpha`), territory outlines, the families' outlines, points (then the item labels at near, then the hovered and the selected item's edges, then the selection ring), the keyboard-focus outline,
 * then names, so a name is never covered by a mark, by a territory's fill or
 * by the focus outline, and the focus outline is never covered by a
 * boundary or a point.
 */
export function paint(
  surface: Surface,
  scene: Scene,
  spec: MapSpec,
  viewport: Viewport,
  frame: Frame,
  theme: Theme,
): void {
  surface.clear();
  const fillAlpha = theme.territoryFillAlpha * (frame.presentation === "dense" ? DENSE_FILL_FACTOR : 1);
  const dimmed = frame.dimmed ?? NO_DIMMED;
  paintTerritories(surface, scene, viewport, theme, fillAlpha, dimmed, frame.groupAlpha ?? 0);
  if (frame.regime !== "far" && frame.pointAlpha > 0) {
    surface.globalAlpha(frame.pointAlpha);
    paintPoints(surface, scene, spec, viewport, theme, dimmed, frame.pointAlpha);
    const itemLabelAlpha = frame.itemLabelAlpha ?? 0;
    if (frame.regime === "near" && itemLabelAlpha > 0 && frame.itemLabels) {
      surface.globalAlpha(frame.pointAlpha * itemLabelAlpha);
      paintItemLabels(surface, frame.itemLabels, viewport, theme, { width: frame.width, height: frame.height, dimmed });
      surface.globalAlpha(frame.pointAlpha);
    }
    const cap = frame.edgesPerNode ?? 0;
    const edgeBox = { width: frame.width, height: frame.height, cap, dimmed, restoreAlpha: frame.pointAlpha };
    if (cap > 0 && typeof frame.hovered === "string" && frame.hovered !== frame.selected)
      paintEdges(surface, scene, viewport, theme, { ...edgeBox, id: frame.hovered, alpha: frame.pointAlpha * 0.5 });
    if (cap > 0 && typeof frame.selected === "string")
      paintEdges(surface, scene, viewport, theme, { ...edgeBox, id: frame.selected, alpha: frame.pointAlpha });
    if (typeof frame.selected === "string") paintSelection(surface, scene, viewport, theme, frame.selected);
    surface.globalAlpha(1);
  }
  if (typeof frame.focusedTerritory === "string")
    paintFocusedTerritory(surface, scene, viewport, theme, frame.focusedTerritory);
  if (typeof frame.focusedNode === "string") paintFocusedNode(surface, scene, viewport, theme, frame.focusedNode);
  paintLabels(surface, scene, viewport, theme, frame);
}
