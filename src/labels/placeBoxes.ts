import { LABEL_PADDING } from "./placement";

/** A label box to place: its world anchor, its screen size, and its centre's screen offset from the anchor. */
export interface BoxInput {
  id: string;
  anchor: readonly [number, number];
  width: number;
  height: number;
  offset: readonly [number, number];
}

/** A box placed before the others (a territory name), active from its own scale. */
export interface FixedBox extends BoxInput {
  activeFromScale: number;
}

/**
 * The scale past which two boxes never overlap, generalising
 * `separationScale` to boxes whose centres sit at a screen offset from their
 * anchors: on one axis the boxes are apart once `|scale × delta + offsetDelta|`
 * reaches the summed half size plus `LABEL_PADDING`, which holds for every
 * scale from `(reach − sign(delta) × offsetDelta) / |delta|` on. With no
 * offsets this is `separationScale`.
 */
export function offsetSeparation(
  horizontalDelta: number,
  verticalDelta: number,
  horizontalOffsetDelta: number,
  verticalOffsetDelta: number,
  halfWidth: number,
  halfHeight: number,
): number {
  const axis = (delta: number, offsetDelta: number, half: number): number => {
    const reach = half + LABEL_PADDING;
    if (delta === 0) return Math.abs(offsetDelta) >= reach ? 0 : Number.POSITIVE_INFINITY;
    return Math.max(0, (reach - Math.sign(delta) * offsetDelta) / Math.abs(delta));
  };
  return Math.min(
    axis(horizontalDelta, horizontalOffsetDelta, halfWidth),
    axis(verticalDelta, verticalOffsetDelta, halfHeight),
  );
}

/**
 * Been, Daiches and Yap's active ranges for boxes already in priority order,
 * after `fixed` (placed first, never moved): each box starts at the smallest
 * scale at which it overlaps no box already active there. Placed boxes are
 * bucketed on a uniform grid and each new box scans them ring by ring; a
 * ring whose nearest possible member could not raise the box's scale ends
 * the scan, so the result is exactly the all-pairs loop's.
 */
export function placeBoxes(ordered: readonly BoxInput[], fixed: readonly FixedBox[] = []): number[] {
  if (ordered.length === 0) return [];
  const everything = [...fixed, ...ordered];
  let minimumHorizontal = Number.POSITIVE_INFINITY;
  let minimumVertical = Number.POSITIVE_INFINITY;
  let maximumHorizontal = Number.NEGATIVE_INFINITY;
  let maximumVertical = Number.NEGATIVE_INFINITY;
  for (const box of everything) {
    minimumHorizontal = Math.min(minimumHorizontal, box.anchor[0]);
    minimumVertical = Math.min(minimumVertical, box.anchor[1]);
    maximumHorizontal = Math.max(maximumHorizontal, box.anchor[0]);
    maximumVertical = Math.max(maximumVertical, box.anchor[1]);
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(everything.length)));
  const span = Math.max(maximumHorizontal - minimumHorizontal, maximumVertical - minimumVertical);
  const cell = span > 0 ? span / columns : 1;
  const cellOf = (value: number, minimum: number) => Math.min(columns - 1, Math.floor((value - minimum) / cell));
  const keyOf = (column: number, row: number) => column * 65_536 + row;

  const placed: FixedBox[] = [];
  const buckets = new Map<number, number[]>();
  let widest = 0;
  let tallest = 0;
  let farthestHorizontalOffset = 0;
  let farthestVerticalOffset = 0;
  const add = (box: FixedBox) => {
    const key = keyOf(cellOf(box.anchor[0], minimumHorizontal), cellOf(box.anchor[1], minimumVertical));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(placed.length);
    else buckets.set(key, [placed.length]);
    placed.push(box);
    widest = Math.max(widest, box.width);
    tallest = Math.max(tallest, box.height);
    farthestHorizontalOffset = Math.max(farthestHorizontalOffset, Math.abs(box.offset[0]));
    farthestVerticalOffset = Math.max(farthestVerticalOffset, Math.abs(box.offset[1]));
  };
  for (const box of fixed) add(box);

  const result: number[] = [];
  for (const box of ordered) {
    const column = cellOf(box.anchor[0], minimumHorizontal);
    const row = cellOf(box.anchor[1], minimumVertical);
    let active = 0;
    const consider = (index: number) => {
      const other = placed[index] as FixedBox;
      const separation = offsetSeparation(
        box.anchor[0] - other.anchor[0],
        box.anchor[1] - other.anchor[1],
        box.offset[0] - other.offset[0],
        box.offset[1] - other.offset[1],
        (box.width + other.width) / 2,
        (box.height + other.height) / 2,
      );
      if (other.activeFromScale < separation && separation > active) active = separation;
    };
    for (let ring = 0; ring < columns; ring += 1) {
      if (ring >= 2) {
        // Every box in this ring or beyond is at least (ring - 1) cells away on one axis.
        const distance = (ring - 1) * cell;
        const reach = Math.max(
          (box.width + widest) / 2 + LABEL_PADDING + Math.abs(box.offset[0]) + farthestHorizontalOffset,
          (box.height + tallest) / 2 + LABEL_PADDING + Math.abs(box.offset[1]) + farthestVerticalOffset,
        );
        if (reach / distance <= active) break;
      }
      for (let ringColumn = column - ring; ringColumn <= column + ring; ringColumn += 1) {
        if (ringColumn < 0 || ringColumn >= columns) continue;
        const onEdge = ringColumn === column - ring || ringColumn === column + ring;
        const step = onEdge ? 1 : 2 * ring;
        for (let ringRow = row - ring; ringRow <= row + ring; ringRow += Math.max(1, step)) {
          if (ringRow < 0 || ringRow >= columns) continue;
          for (const index of buckets.get(keyOf(ringColumn, ringRow)) ?? []) consider(index);
        }
      }
    }
    result.push(active);
    add({ ...box, activeFromScale: active });
  }
  return result;
}
