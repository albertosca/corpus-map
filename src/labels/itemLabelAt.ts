import type { Viewport } from "../viewport/viewport";
import type { PlacedItemLabel } from "./itemLabels";
import { drawnItemLabels, type ItemLabelBox, itemLabelRect } from "./paintItemLabels";

/** The id of the drawn plate under (horizontal, vertical), the last painted winning; `null` when none. */
export function itemLabelAt(
  labels: readonly PlacedItemLabel[],
  viewport: Viewport,
  box: ItemLabelBox,
  horizontal: number,
  vertical: number,
): string | null {
  const drawn = drawnItemLabels(labels, viewport, box);
  for (let index = drawn.length - 1; index >= 0; index -= 1) {
    const label = drawn[index] as PlacedItemLabel;
    const rect = itemLabelRect(label, viewport);
    if (
      horizontal >= rect.left &&
      horizontal <= rect.left + rect.width &&
      vertical >= rect.top &&
      vertical <= rect.top + rect.height
    )
      return label.id;
  }
  return null;
}
