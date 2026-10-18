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

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.w &&
    second.x < first.x + first.w &&
    first.y < second.y + second.h &&
    second.y < first.y + first.h
  );
}

function distanceToRect(pointHorizontal: number, pointVertical: number, rect: Rect): number {
  const horizontalGap = Math.max(rect.x - pointHorizontal, 0, pointHorizontal - (rect.x + rect.w));
  const verticalGap = Math.max(rect.y - pointVertical, 0, pointVertical - (rect.y + rect.h));
  return Math.hypot(horizontalGap, verticalGap);
}

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
  const { width, height } = size;
  const placed: Array<PlacedCard & { rect: Rect }> = [];
  for (const anchor of anchors) {
    const free = candidates(anchor.x, anchor.y, width, height, gap)
      .map(([left, top]) => ({ x: left, y: top, w: width, h: height }))
      .find(
        (rect) =>
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.x + width <= box.width &&
          rect.y + height <= box.height &&
          !placed.some((card) => overlaps(card.rect, rect)),
      );
    if (free) {
      placed.push({ ids: [anchor.id], x: free.x, y: free.y, rect: free });
      continue;
    }
    let nearest: (PlacedCard & { rect: Rect }) | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const card of placed) {
      const distance = distanceToRect(anchor.x, anchor.y, card.rect);
      if (distance < best) {
        best = distance;
        nearest = card;
      }
    }
    if (nearest) {
      nearest.ids.push(anchor.id);
    } else {
      const left = Math.max(0, Math.min(anchor.x + gap, box.width - width));
      const top = Math.max(0, Math.min(anchor.y - height / 2, box.height - height));
      const rect = { x: left, y: top, w: width, h: height };
      placed.push({ ids: [anchor.id], x: left, y: top, rect });
    }
  }
  return placed.map(({ ids, x: left, y: top }) => ({ ids, x: left, y: top }));
}
