import { describe, expect, it } from "vitest";
import { FAR_CARD_GAP, NEAR_CARD_GAP, placeSelectedCard } from "./placeSelectedCard";

const AREA = { left: 0, top: 0, width: 800, height: 600 };
const SIZE = { width: 100, height: 40 };
const base = { anchor: [400, 300] as const, size: SIZE, area: AREA, edges: [], points: [] };

describe("placeSelectedCard", () => {
  it("prefers the right with nothing in the way, without a leader", () => {
    expect(placeSelectedCard(base)).toEqual({ left: 400 + NEAR_CARD_GAP, top: 280, leader: null });
  });

  it("a right card crossing two edges loses to the left", () => {
    const edges = [
      [
        [400, 300],
        [700, 290],
      ],
      [
        [400, 300],
        [700, 310],
      ],
    ] as const;
    expect(placeSelectedCard({ ...base, edges })).toMatchObject({ left: 400 - NEAR_CARD_GAP - 100, top: 280 });
  });

  it("weighs an edge crossing as four points", () => {
    // Only the right and left spots fit; the edge crosses both right cards, the points sit under both left ones.
    const area = { left: 0, top: 280, width: 800, height: 40 };
    const edges = [
      [
        [400, 300],
        [700, 300],
      ],
    ] as const;
    const points = [310, 320, 330].map((horizontal) => [horizontal, 300] as const);
    // right: 4 (one edge); left: 3 points — the left wins; at weight 1 the right would.
    expect(placeSelectedCard({ ...base, area, edges, points })).toEqual({
      left: 400 - NEAR_CARD_GAP - 100,
      top: 280,
      leader: null,
    });
  });

  it("moves to the far ring with a leader when every near candidate costs more", () => {
    const points: Array<readonly [number, number]> = [];
    for (let horizontal = 250; horizontal <= 550; horizontal += 4)
      for (let vertical = 220; vertical <= 380; vertical += 4)
        if (Math.abs(horizontal - 400) > 3 || Math.abs(vertical - 300) > 3) points.push([horizontal, vertical]);
    const placement = placeSelectedCard({ ...base, points });
    expect(placement.leader).not.toBeNull();
    // Hand count: best near 216 points, far right 225, far above 192 (first of the 192 ties).
    expect(placement).toMatchObject({ left: 350, top: 300 - FAR_CARD_GAP - 40 });
    expect(placement.leader).toEqual({ from: [400, 300], to: [400, 300 - FAR_CARD_GAP] });
  });

  it("respects the area left by the insets", () => {
    const area = { left: 0, top: 0, width: 450, height: 600 };
    expect(placeSelectedCard({ ...base, area })).toMatchObject({ left: 400 - NEAR_CARD_GAP - 100 });
  });

  it("clamps into the area when no candidate fits, never at negative coordinates", () => {
    const tiny = { left: 10, top: 10, width: 50, height: 20 };
    expect(placeSelectedCard({ ...base, area: tiny })).toEqual({ left: 10, top: 10, leader: null });
  });
});
