export interface CardAnchor {
  id: string;
  x: number;
  y: number;
}

export interface PlacedCard {
  ids: string[];
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Top-left corners of the eight candidates, in preference order: right, left, above, below, then the diagonals. */
export function candidates(x: number, y: number, w: number, h: number, gap: number): Array<[number, number]> {
  return [
    [x + gap, y - h / 2],
    [x - gap - w, y - h / 2],
    [x - w / 2, y - gap - h],
    [x - w / 2, y + gap],
    [x + gap, y - gap - h],
    [x - gap - w, y - gap - h],
    [x + gap, y + gap],
    [x - gap - w, y + gap],
  ];
}

/**
 * Place a card beside each anchor, in the first of eight candidate positions
 * that stays inside the box and overlaps no placed card (Christensen, Marks and
 * Shieber 1995). An anchor with no free candidate joins the placed card nearest
 * to it, which becomes a group card. If no card has been placed yet and the
 * anchor has no free candidate, place its card anyway, clamped to the box corner.
 * A card larger than the box is placed at the box's corner (0, 0).
 */
export function layoutCards(
  anchors: readonly CardAnchor[],
  size: { width: number; height: number },
  box: { width: number; height: number },
  gap = 6,
): PlacedCard[] {
  const { width: w, height: h } = size;
  const placed: Array<PlacedCard & { rect: Rect }> = [];
  for (const a of anchors) {
    const free = candidates(a.x, a.y, w, h, gap)
      .map(([x, y]) => ({ x, y, w, h }))
      .find(
        (r) =>
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + w <= box.width &&
          r.y + h <= box.height &&
          !placed.some((p) => overlaps(p.rect, r)),
      );
    if (free) {
      placed.push({ ids: [a.id], x: free.x, y: free.y, rect: free });
      continue;
    }
    let nearest: (PlacedCard & { rect: Rect }) | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const p of placed) {
      const d = distanceToRect(a.x, a.y, p.rect);
      if (d < best) {
        best = d;
        nearest = p;
      }
    }
    if (nearest) {
      nearest.ids.push(a.id);
    } else {
      const x = Math.max(0, Math.min(a.x + gap, box.width - w));
      const y = Math.max(0, Math.min(a.y - h / 2, box.height - h));
      const rect = { x, y, w, h };
      placed.push({ ids: [a.id], x, y, rect });
    }
  }
  return placed.map(({ ids, x, y }) => ({ ids, x, y }));
}
