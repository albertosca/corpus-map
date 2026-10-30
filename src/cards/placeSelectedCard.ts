import { clipToBox } from "../edges/paintEdges";

export const NEAR_CARD_GAP = 6;
export const FAR_CARD_GAP = 48;
/** An edge the card would cover costs as much as this many points under it. */
export const EDGE_CROSSING_COST = 4;

/** Top-left corners of the eight candidates, in preference order: right, left, above, below, then the diagonals. */
export function candidates(
  horizontal: number,
  vertical: number,
  width: number,
  height: number,
  gap: number,
): Array<[number, number]> {
  return [
    [horizontal + gap, vertical - height / 2],
    [horizontal - gap - width, vertical - height / 2],
    [horizontal - width / 2, vertical - gap - height],
    [horizontal - width / 2, vertical + gap],
    [horizontal + gap, vertical - gap - height],
    [horizontal - gap - width, vertical - gap - height],
    [horizontal + gap, vertical + gap],
    [horizontal - gap - width, vertical + gap],
  ];
}

export interface SelectedCardInput {
  anchor: readonly [number, number];
  size: { width: number; height: number };
  area: { left: number; top: number; width: number; height: number };
  /** The selected item's drawn edges, as screen segments. */
  edges: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>;
  /** The other on-screen, non-dimmed points. */
  points: ReadonlyArray<readonly [number, number]>;
}

export interface SelectedCardPlacement {
  left: number;
  top: number;
  /** From the point to the nearest point of the card's frame; only for a far-ring card. */
  leader: { from: [number, number]; to: [number, number] } | null;
}

/**
 * The selected card's spot (spec item labels §4): of the eight candidates at
 * `NEAR_CARD_GAP` then the eight at `FAR_CARD_GAP` that fit inside `area`,
 * the cheapest, where each drawn edge crossing the card costs
 * `EDGE_CROSSING_COST` and each point under it costs 1; ties go to the
 * earlier candidate. Nothing fits: the near-right spot clamped into `area`.
 */
export function placeSelectedCard(input: SelectedCardInput): SelectedCardPlacement {
  const { anchor, size, area, edges, points } = input;
  const right = area.left + area.width;
  const bottom = area.top + area.height;
  let best: { left: number; top: number; far: boolean; cost: number } | null = null;
  for (const [gap, far] of [
    [NEAR_CARD_GAP, false],
    [FAR_CARD_GAP, true],
  ] as const) {
    for (const [left, top] of candidates(anchor[0], anchor[1], size.width, size.height, gap)) {
      if (left < area.left || top < area.top || left + size.width > right || top + size.height > bottom) continue;
      let cost = 0;
      for (const [start, end] of edges)
        if (clipToBox([start[0] - left, start[1] - top], [end[0] - left, end[1] - top], size.width, size.height))
          cost += EDGE_CROSSING_COST;
      for (const [horizontal, vertical] of points)
        if (horizontal > left && horizontal < left + size.width && vertical > top && vertical < top + size.height)
          cost += 1;
      if (best === null || cost < best.cost) best = { left, top, far, cost };
    }
  }
  if (best === null) {
    const left = Math.max(area.left, Math.min(anchor[0] + NEAR_CARD_GAP, right - size.width));
    const top = Math.max(area.top, Math.min(anchor[1] - size.height / 2, bottom - size.height));
    return { left, top, leader: null };
  }
  const leader = best.far
    ? {
        from: [anchor[0], anchor[1]] as [number, number],
        to: [
          Math.max(best.left, Math.min(anchor[0], best.left + size.width)),
          Math.max(best.top, Math.min(anchor[1], best.top + size.height)),
        ] as [number, number],
      }
    : null;
  return { left: best.left, top: best.top, leader };
}
