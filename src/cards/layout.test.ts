import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../fixtures/synthetic/generate";
import { type CardAnchor, layoutCards, type PlacedCard } from "./layout";

const SIZE = { width: 160, height: 56 };
const BOX = { width: 960, height: 640 };

function problems(cards: PlacedCard[]) {
  let overlaps = 0;
  let outside = 0;
  for (let i = 0; i < cards.length; i += 1) {
    const a = cards[i];
    if (!a) continue;
    if (a.x < 0 || a.y < 0 || a.x + SIZE.width > BOX.width || a.y + SIZE.height > BOX.height) outside += 1;
    for (let j = i + 1; j < cards.length; j += 1) {
      const b = cards[j];
      if (b && a.x < b.x + SIZE.width && b.x < a.x + SIZE.width && a.y < b.y + SIZE.height && b.y < a.y + SIZE.height)
        overlaps += 1;
    }
  }
  return { overlaps, outside };
}

describe("layoutCards", () => {
  const rand = mulberry32(7);
  const anchors: CardAnchor[] = Array.from({ length: 200 }, (_, i) =>
    i < 60
      ? { id: `n${i}`, x: 480 + rand() * 20, y: 320 + rand() * 20 }
      : { id: `n${i}`, x: rand() * 960, y: rand() * 640 },
  );
  const cards = layoutCards(anchors, SIZE, BOX);

  it("metric 11: no two cards overlap and none leaves the viewport", () => {
    expect(problems(cards)).toEqual({ overlaps: 0, outside: 0 });
  });

  it("accounts for every anchor exactly once, grouping what does not fit", () => {
    const ids = cards.flatMap((c) => c.ids);
    expect(ids).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
    expect(cards.some((c) => c.ids.length > 1)).toBe(true);
  });

  it("puts a lone card to the right of its point, centred vertically, 6 px away", () => {
    expect(layoutCards([{ id: "a", x: 100, y: 100 }], SIZE, BOX)).toEqual([{ ids: ["a"], x: 106, y: 72 }]);
  });

  it.each([
    [2, 2],
    [958, 2],
    [2, 638],
    [958, 638],
  ])("keeps a card for a point at (%i, %i) inside the viewport", (x, y) => {
    expect(problems(layoutCards([{ id: "a", x, y }], SIZE, BOX))).toEqual({ overlaps: 0, outside: 0 });
  });

  it("returns nothing for no anchors", () => {
    expect(layoutCards([], SIZE, BOX)).toEqual([]);
  });

  it("places first anchor even when it has no free candidate, clamped to box", () => {
    const cards = layoutCards(
      [
        { id: "a", x: 50, y: 50 },
        { id: "b", x: 60, y: 60 },
        { id: "c", x: 70, y: 70 },
      ],
      { width: 200, height: 200 },
      { width: 100, height: 100 },
    );
    expect(cards).toEqual([{ ids: ["a", "b", "c"], x: 0, y: 0 }]);
  });

  it("all anchors appear exactly once across all cards (property test)", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const rand = mulberry32(seed);
      const cardWidth = Math.floor(20 + rand() * 280);
      const cardHeight = Math.floor(20 + rand() * 280);
      const anchors: CardAnchor[] = Array.from({ length: 30 }, (_, i) => ({
        id: `p${seed}_${i}`,
        x: rand() * 200,
        y: rand() * 150,
      }));
      const cards = layoutCards(anchors, { width: cardWidth, height: cardHeight }, { width: 200, height: 150 });
      const allIds = cards.flatMap((c) => c.ids);
      expect(allIds).toHaveLength(30);
      expect(new Set(allIds).size).toBe(30);
    }
  });
});
