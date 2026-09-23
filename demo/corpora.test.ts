import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "../src/CorpusMap";
import type { MapNode } from "../src/shared/spec";
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

  it("opens every gallery corpus in the far regime, at the demo's own mount size (acceptance 3)", () => {
    // The demo (App.tsx) mounts at 960x640 with no `thresholds` override, so
    // this is `DEFAULT_THRESHOLDS`. At mount `CorpusMap`'s viewport is
    // exactly `fitSpec(...)`, so the fitted ratio (scale / fitScale) is 1 —
    // below `DEFAULT_THRESHOLDS.midAt` for every corpus, which is what puts
    // the initial regime at "far" rather than "mid" or "near".
    for (const entry of gallery) {
      const onRegimeChange = vi.fn();
      const { unmount } = render(
        createElement(CorpusMap, {
          spec: entry.spec,
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
