import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "../src/CorpusMap";
import type { MapNode, MapSpec } from "../src/shared/spec";
import { validateSpec } from "../src/shared/spec";
import { type GalleryEntry, gallery } from "./corpora";

/** Every gallery entry's spec — arXiv's dynamic import resolved, everything else already synchronous. */
async function resolveSpec(entry: GalleryEntry): Promise<MapSpec> {
  return "spec" in entry ? entry.spec : entry.load();
}

describe("gallery corpora", () => {
  it("ships at least two, from the one list the demo picker reads", () => {
    expect(gallery.length).toBeGreaterThanOrEqual(2);
    expect(new Set(gallery.map((g) => g.id)).size).toBe(gallery.length);
  });

  it("are all valid specs", async () => {
    for (const entry of gallery) {
      const spec = await resolveSpec(entry);
      expect(() => validateSpec(spec)).not.toThrow();
    }
  });

  it("each carries more than one territory, so the idiom is actually exercised", async () => {
    for (const entry of gallery) {
      const spec = await resolveSpec(entry);
      expect(spec.territories.length).toBeGreaterThan(1);
    }
  });

  it("the hand-authored and synthetic corpora contain no food vocabulary, because the gallery is the agnosticism proof", async () => {
    // arXiv is excluded on purpose: it is scraped, real-world paper titles,
    // and legitimately contains words like "recipe" (a common ML idiom) or
    // "food" (a research subject) that this promise was never meant to cover.
    const words = /recipe|ingredient|cook|kitchen|food|dish/i;
    for (const entry of gallery) {
      if (entry.id === "arxiv") continue;
      const spec = await resolveSpec(entry);
      expect(JSON.stringify(spec)).not.toMatch(words);
    }
  });

  it("opens every gallery corpus in the far regime, at the demo's own mount size (acceptance 3)", async () => {
    // The demo's map fills the window rather than mounting at a fixed size
    // (showcase Task 5), but this test still mounts `CorpusMap` directly at
    // 960x640 with no `thresholds` override — `DEFAULT_THRESHOLDS`. At mount
    // the viewport is exactly `fitSpec(...)`, so the fitted ratio (scale /
    // fitScale) is 1 -- below `DEFAULT_THRESHOLDS.midAt` for every corpus,
    // which is what puts the initial regime at "far" rather than "mid" or
    // "near".
    for (const entry of gallery) {
      const spec = await resolveSpec(entry);
      const onRegimeChange = vi.fn();
      const { unmount } = render(
        createElement(CorpusMap, {
          spec,
          renderCard: (node: MapNode) => createElement("div", null, node.label),
          width: 960,
          height: 640,
          onRegimeChange,
        }),
      );
      expect(onRegimeChange.mock.calls[0]).toEqual(["far"]);
      unmount();
    }
  });
});
