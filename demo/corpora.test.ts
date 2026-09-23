import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/shared/spec";
import { gallery } from "./corpora";

describe("gallery corpora", () => {
  it("ships at least two, from the one list the demo picker reads", () => {
    expect(gallery.length).toBeGreaterThanOrEqual(2);
    expect(new Set(gallery.map((g) => g.id)).size).toBe(gallery.length);
  });

  it("are all valid specs", () => {
    for (const entry of gallery) expect(() => validateSpec(entry.spec)).not.toThrow();
  });

  it("each carries more than one territory, so the idiom is actually exercised", () => {
    for (const entry of gallery) expect(entry.spec.territories.length).toBeGreaterThan(1);
  });

  it("contain no food vocabulary, because the gallery is the agnosticism proof", () => {
    const words = /recipe|ingredient|cook|kitchen|food|dish/i;
    const blob = JSON.stringify(gallery.map((g) => g.spec));
    expect(blob).not.toMatch(words);
  });
});
