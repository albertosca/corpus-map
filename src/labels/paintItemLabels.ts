import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import {
  DEFAULT_ITEM_LABEL_FONT,
  fontPixels,
  ITEM_LABEL_LINE_HEIGHT,
  ITEM_LABEL_PADDING,
  ITEM_LABEL_RADIUS,
  type PlacedItemLabel,
} from "./itemLabels";

export interface ItemLabelBox {
  width: number;
  height: number;
  dimmed: ReadonlySet<string>;
}

/**
 * The labels drawn at this scale, wherever they sit: position never enters
 * the decision, as for territory names, so a pan cannot pop one; a plate
 * larger than the canvas and a dimmed territory's items are left out.
 */
export function drawnItemLabels(
  labels: readonly PlacedItemLabel[],
  viewport: Viewport,
  box: ItemLabelBox,
): PlacedItemLabel[] {
  return labels.filter(
    (label) =>
      viewport.scale >= label.activeFromScale &&
      label.width <= box.width &&
      label.height <= box.height &&
      (label.territory === null || !box.dimmed.has(label.territory)),
  );
}

/** The plate's screen rectangle at this viewport. */
export function itemLabelRect(
  label: PlacedItemLabel,
  viewport: Viewport,
): { left: number; top: number; width: number; height: number } {
  const [horizontal, vertical] = toScreen(viewport, label.anchor[0], label.anchor[1]);
  return {
    left: horizontal + label.offset[0] - label.width / 2,
    top: vertical + label.offset[1] - label.height / 2,
    width: label.width,
    height: label.height,
  };
}

/** Each drawn label as a tooltip left open: a plate in `hoverBackground`, its lines in `hoverText`. */
export function paintItemLabels(
  surface: Surface,
  labels: readonly PlacedItemLabel[],
  viewport: Viewport,
  theme: Theme,
  box: ItemLabelBox,
): void {
  const font = theme.itemLabelFont ?? DEFAULT_ITEM_LABEL_FONT;
  const lineHeight = fontPixels(font) * ITEM_LABEL_LINE_HEIGHT;
  for (const label of drawnItemLabels(labels, viewport, box)) {
    const rect = itemLabelRect(label, viewport);
    // Wholly off the canvas: invisible whether issued or not.
    if (rect.left > box.width || rect.top > box.height || rect.left + rect.width < 0 || rect.top + rect.height < 0)
      continue;
    surface.plate(rect.left, rect.top, rect.width, rect.height, ITEM_LABEL_RADIUS, theme.hoverBackground);
    const centre = rect.left + rect.width / 2;
    for (const [index, line] of label.lines.entries())
      surface.text(
        line,
        centre,
        rect.top + ITEM_LABEL_PADDING.vertical + lineHeight * (index + 0.5),
        theme.hoverText,
        font,
      );
  }
}
