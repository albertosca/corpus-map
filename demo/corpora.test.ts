import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "../src/CorpusMap";
import type { MapNode, MapSpec } from "../src/shared/spec";
import { validateSpec } from "../src/shared/spec";
import { type GalleryEntry, gallery } from "./corpora";
import arxivJson from "./corpora/arxiv.json";

const arxivBody = JSON.stringify(arxivJson);

/** A `fetch` stand-in that answers the asset request the way the dev server and the build would. */
async function fetchArxivAsset(_url: string | URL | Request): Promise<Response> {
  return new Response(arxivBody, { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Every gallery entry's spec — arXiv through a stubbed `fetch`, everything else already synchronous. */
async function resolveSpec(entry: GalleryEntry): Promise<MapSpec> {
  if ("spec" in entry) return entry.spec;
  vi.stubGlobal("fetch", vi.fn(fetchArxivAsset));
  return entry.load();
}

/** The arXiv entry from a fresh module instance, so no earlier test's loaded spec is held in memory. */
async function arxivEntry(): Promise<Extract<GalleryEntry, { id: "arxiv" }>> {
  vi.resetModules();
  const { gallery: freshGallery } = await import("./corpora");
  const entry = freshGallery.find((candidate) => candidate.id === "arxiv");
  if (entry === undefined || !("load" in entry)) throw new Error("the gallery lost its arXiv entry");
  return entry;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("arXiv loader", () => {
  it("goes back to the network after a failed load, so the demo's Try again can succeed (B11)", async () => {
    const fetchStub = vi.fn(fetchArxivAsset).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchStub);
    const load = (await arxivEntry()).load;

    await expect(load()).rejects.toThrow();
    const spec = await load();

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(String(fetchStub.mock.calls[1]?.[0])).toMatch(/\/demo\/corpora\/arxiv\.json$/);
    expect(spec.territories.length).toBeGreaterThan(1);
  });

  it("serves a load after a success from memory, without another 1.8 MB request", async () => {
    const fetchStub = vi.fn(fetchArxivAsset);
    vi.stubGlobal("fetch", fetchStub);
    const load = (await arxivEntry()).load;

    const first = await load();
    const second = await load();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("rejects on an HTTP error status instead of parsing the error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Service Unavailable", { status: 503 })),
    );

    await expect((await arxivEntry()).load()).rejects.toThrow(/503/);
  });
});

describe("gallery corpora", () => {
  it("ships at least two, from the one list the demo picker reads", () => {
    expect(gallery.length).toBeGreaterThanOrEqual(2);
    expect(new Set(gallery.map((entry) => entry.id)).size).toBe(gallery.length);
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
