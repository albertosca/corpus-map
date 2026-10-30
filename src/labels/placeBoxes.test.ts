import { describe, expect, it } from "vitest";
import { type BoxInput, type FixedBox, offsetSeparation, placeBoxes } from "./placeBoxes";
import { LABEL_PADDING, separationScale } from "./placement";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function allPairs(ordered: readonly BoxInput[], fixed: readonly FixedBox[]): number[] {
  const placed: FixedBox[] = [...fixed];
  const result: number[] = [];
  for (const box of ordered) {
    let active = 0;
    for (const other of placed) {
      const separation = offsetSeparation(
        box.anchor[0] - other.anchor[0],
        box.anchor[1] - other.anchor[1],
        box.offset[0] - other.offset[0],
        box.offset[1] - other.offset[1],
        (box.width + other.width) / 2,
        (box.height + other.height) / 2,
      );
      if (other.activeFromScale < separation && separation > active) active = separation;
    }
    result.push(active);
    placed.push({ ...box, activeFromScale: active });
  }
  return result;
}

function randomBoxes(random: () => number, count: number, withOffsets: boolean): BoxInput[] {
  return Array.from({ length: count }, (_, index) => {
    const height = 10 + random() * 30;
    return {
      id: `b${index}`,
      anchor: [random() * 1000, random() * 600] as const,
      width: 20 + random() * 140,
      height,
      offset: withOffsets ? ([0, -(height / 2 + 6)] as const) : ([0, 0] as const),
    };
  });
}

describe("offsetSeparation", () => {
  it("equals separationScale with no offsets", () => {
    for (const [horizontal, vertical] of [
      [3, 4],
      [-7, 1],
      [0, 5],
      [5, 0],
    ] as const)
      expect(offsetSeparation(horizontal, vertical, 0, 0, 40, 10)).toBe(separationScale(horizontal, vertical, 40, 10));
  });

  it("past the returned scale two offset boxes never overlap (brute force over a scale sweep)", () => {
    const random = seeded(7);
    for (let trial = 0; trial < 500; trial += 1) {
      const delta = [random() * 20 - 10, random() * 20 - 10] as const;
      const offsetDelta = [random() * 40 - 20, random() * 40 - 20] as const;
      const half = [5 + random() * 50, 5 + random() * 20] as const;
      const separation = offsetSeparation(delta[0], delta[1], offsetDelta[0], offsetDelta[1], half[0], half[1]);
      if (!Number.isFinite(separation)) continue;
      for (let factor = 1; factor <= 50; factor *= 1.07) {
        const scale = separation * factor;
        const apartHorizontally = Math.abs(scale * delta[0] + offsetDelta[0]) >= half[0] + LABEL_PADDING - 1e-9;
        const apartVertically = Math.abs(scale * delta[1] + offsetDelta[1]) >= half[1] + LABEL_PADDING - 1e-9;
        expect(apartHorizontally || apartVertically).toBe(true);
      }
    }
  });

  it("is 0 on an axis whose offsets alone keep the boxes apart, and Infinity when nothing can", () => {
    expect(offsetSeparation(0, 0, 0, 100, 10, 10)).toBe(0);
    expect(offsetSeparation(0, 0, 0, 0, 10, 10)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("placeBoxes", () => {
  for (const withOffsets of [false, true])
    it(`matches the all-pairs loop on seeded random inputs (offsets: ${withOffsets})`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const random = seeded(seed);
        const ordered = randomBoxes(random, 400, withOffsets);
        const fixed = randomBoxes(random, 20, false).map((box, index) => ({
          ...box,
          id: `f${index}`,
          activeFromScale: random() * 0.5,
        }));
        expect(placeBoxes(ordered, fixed)).toEqual(allPairs(ordered, fixed));
      }
    });

  it("identical anchors: the later box never becomes active", () => {
    const box: BoxInput = { id: "a", anchor: [5, 5], width: 30, height: 12, offset: [0, -12] };
    expect(placeBoxes([box, { ...box, id: "b" }])).toEqual([0, Number.POSITIVE_INFINITY]);
  });

  it("zero span: one node, and many nodes on one point, still match all pairs", () => {
    const single: BoxInput = { id: "a", anchor: [3, 3], width: 10, height: 10, offset: [0, 0] };
    expect(placeBoxes([single])).toEqual([0]);
    const stacked = Array.from({ length: 5 }, (_, index) => ({ ...single, id: `s${index}` }));
    expect(placeBoxes(stacked)).toEqual(allPairs(stacked, []));
  });

  it("a seeded fixed box is never overlapped by an active box at any scale", () => {
    const fixed: FixedBox[] = [
      { id: "name", anchor: [0, 0], width: 120, height: 20, offset: [0, 0], activeFromScale: 0 },
    ];
    const [active] = placeBoxes([{ id: "item", anchor: [1, 0], width: 60, height: 16, offset: [0, -14] }], fixed);
    for (const scale of [active ?? 0, (active ?? 0) * 2, (active ?? 0) * 10]) {
      const centreGap = Math.abs(scale * 1);
      const verticalGap = Math.abs(-14);
      expect(centreGap >= 90 + LABEL_PADDING - 1e-9 || verticalGap >= 18 + LABEL_PADDING - 1e-9).toBe(true);
    }
  });

  it("returns an empty list for no boxes", () => {
    expect(placeBoxes([])).toEqual([]);
  });
});
