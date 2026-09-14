import { describe, expect, it } from "vitest";
import { constellationsSpec } from "../demo/corpora/constellations";
import { elementsSpec } from "../demo/corpora/elements";
import { validateSpec } from "../src/spec";

describe("gallery corpora", () => {
  it("ships at least two", () => {
    expect([elementsSpec, constellationsSpec]).toHaveLength(2);
  });

  it("are both valid specs", () => {
    expect(() => validateSpec(elementsSpec)).not.toThrow();
    expect(() => validateSpec(constellationsSpec)).not.toThrow();
  });

  it("each carries more than one territory, so the idiom is actually exercised", () => {
    expect(elementsSpec.territories.length).toBeGreaterThan(1);
    expect(constellationsSpec.territories.length).toBeGreaterThan(1);
  });

  it("contain no food vocabulary, because the gallery is the agnosticism proof", () => {
    const words = /recipe|ingredient|cook|kitchen|food|dish/i;
    const blob = JSON.stringify([elementsSpec, constellationsSpec]);
    expect(blob).not.toMatch(words);
  });
});
