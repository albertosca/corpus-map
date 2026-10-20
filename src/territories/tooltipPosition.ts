/** Gap between the cursor and the tooltip, in CSS pixels (spec categories §7). */
export const TOOLTIP_OFFSET = 12;

/** Opacity of the group line in the territory balloon; CorpusMap.tooltip.test.tsx pins 4.5:1 contrast in both themes. */
export const GROUP_LINE_OPACITY = 0.8;

/** Rows the territory balloon lists before "+N more": deep zoom stacks twenty-odd territories under one cursor. */
export const TOOLTIP_ROW_LIMIT = 5;

/** The tooltip's top-left corner: below-right of the cursor, flipped on an axis where it would leave the map, never above or left of it. */
export function tooltipPosition(
  cursorHorizontal: number,
  cursorVertical: number,
  boxWidth: number,
  boxHeight: number,
  mapWidth: number,
  mapHeight: number,
  offset: number = TOOLTIP_OFFSET,
): { left: number; top: number } {
  const right = cursorHorizontal + offset;
  const below = cursorVertical + offset;
  const left = right + boxWidth > mapWidth ? cursorHorizontal - offset - boxWidth : right;
  const top = below + boxHeight > mapHeight ? cursorVertical - offset - boxHeight : below;
  return { left: Math.max(0, left), top: Math.max(0, top) };
}
