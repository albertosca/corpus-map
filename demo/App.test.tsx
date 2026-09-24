import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only: safe to import statically even though every test imports the
// component itself dynamically (`await import("./App")`), per-test, so each
// gets its own fresh module graph for `vi.doMock`/`vi.resetModules`.
import type { AppProps } from "./App";
import { constellationsSpec } from "./corpora/constellations";
import { elementsSpec } from "./corpora/elements";
import { syntheticSpec } from "./corpora/synthetic";

/** A tiny, valid arXiv-shaped spec — stands in for the real 1.8 MB corpus.json in every test but the loading-state one. */
const TINY_ARXIV_SPEC: MapSpec = {
  version: "1",
  territories: [{ id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2"], centroid: [0, 0] }],
  nodes: [
    {
      id: "p1",
      label: "A Tiny Paper About Testing",
      x: -1,
      y: 0,
      territory: "cs.AI",
      meta: { year: 2026, url: "https://arxiv.org/abs/0000.00001" },
    },
    {
      id: "p2",
      label: "Another Tiny Paper",
      x: 1,
      y: 0,
      territory: "cs.AI",
      meta: { year: 2025, url: "https://arxiv.org/abs/0000.00002" },
    },
  ],
};

/** The exact text a far-regime territory button carries (`AccessibleTree`): `"<name> (<memberCount>)"`. */
function territoryButtonText(spec: MapSpec, index = 0): string {
  const t = spec.territories[index];
  if (!t) throw new Error(`spec has no territory at index ${index}`);
  return `${t.name} (${t.members.length})`;
}

const VIEWPORT_WIDTH_PX = 375;
const GUTTER_PX = 16;
const MAX_CONTENT_PX = VIEWPORT_WIDTH_PX - 2 * GUTTER_PX; // 343
const WIDTH_PROPS = ["width", "maxWidth", "minWidth"] as const;
const OFFSET_PROPS = ["left", "right"] as const;

/**
 * Parses one inline CSS length (`vw`/`%`/`px`) from a floating control and
 * asserts it cannot push content past a 375px-wide viewport. Fix round 1,
 * Finding 2: the previous version of this check only asserted the *unit*
 * was `"vw"`, which a planted `maxWidth: "250vw"` passed straight through —
 * this reads the actual number. `width`/`maxWidth`/`minWidth` are checked
 * against the viewport itself (`vw`/`%` <= 100) or the usable width once
 * both 16px gutters are subtracted (`px`, <= 343); `left`/`right` are
 * additionally checked for a negative value, which would push the element
 * outside the viewport on that side regardless of its own width.
 */
function checkNoOverflowAt375(el: HTMLElement, label: string): void {
  for (const prop of [...WIDTH_PROPS, ...OFFSET_PROPS]) {
    const raw = el.style[prop];
    if (!raw || raw === "auto") continue;
    const match = /^(-?[\d.]+)(vw|px|%)$/.exec(raw.trim());
    if (!match) {
      throw new Error(
        `${label}.${prop} = "${raw}" is not a recognised vw/px/% length — extend checkNoOverflowAt375 before trusting this control`,
      );
    }
    const value = Number(match[1]);
    const unit = match[2];

    if (unit === "vw" || unit === "%") {
      expect(
        value,
        `${label}.${prop} = ${raw} would exceed the 375px viewport (unit is ${unit}, must be <= 100)`,
      ).toBeLessThanOrEqual(100);
    } else if ((WIDTH_PROPS as readonly string[]).includes(prop)) {
      expect(
        value,
        `${label}.${prop} = ${raw} would exceed the viewport once both 16px gutters are subtracted (max ${MAX_CONTENT_PX}px)`,
      ).toBeLessThanOrEqual(MAX_CONTENT_PX);
    }
    if ((OFFSET_PROPS as readonly string[]).includes(prop)) {
      expect(
        value,
        `${label}.${prop} = ${raw} is negative, which pushes the element outside the viewport on that side`,
      ).toBeGreaterThanOrEqual(0);
    }
  }
}

/** Mocks the arXiv dynamic import with an already-resolved payload, then imports and renders a fresh `App`. */
async function renderApp(arxivPayload: unknown = TINY_ARXIV_SPEC) {
  vi.doMock("./corpora/arxiv.json", () => ({ default: arxivPayload }));
  const { App } = await import("./App");
  return render(createElement(App));
}

/**
 * jsdom has no `ResizeObserver`. The demo's `App` never passes explicit
 * `width`/`height` to `CorpusMap` — it fills the window (showcase Task 5) —
 * so without this fake `useElementSize` never measures a box and the map
 * never renders anything (`ready` stays false forever). A real observer
 * reports the observed element's current size as soon as `observe()`
 * starts (the same fact `src/viewport/useElementSize.test.tsx` documents);
 * this fake does the same, with a fixed size standing in for the window.
 */
class FakeResizeObserver {
  static readonly size = { width: 1280, height: 800 };
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    const entry = { contentRect: FakeResizeObserver.size } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }

  unobserve(): void {}
  disconnect(): void {}
}

describe("App (showcase Task 5)", () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    vi.resetModules();
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    vi.doUnmock("./corpora/arxiv.json");
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver | undefined }).ResizeObserver =
      originalResizeObserver;
  });

  it("shows a loading state, then the map, for the default arXiv corpus (mocked dynamic import)", async () => {
    // The deferred promise is created up front, outside the mock factory,
    // so `resolveImport` is bound synchronously here rather than depending
    // on exactly when Vitest's module runner gets around to invoking the
    // factory for a dynamic `import()` buried inside an effect.
    let resolveImport!: (value: { default: unknown }) => void;
    const pending = new Promise<{ default: unknown }>((resolve) => {
      resolveImport = resolve;
    });
    vi.doMock("./corpora/arxiv.json", () => pending);
    const { App } = await import("./App");
    render(createElement(App));

    expect(screen.getByText("Loading corpus…")).not.toBeNull();
    expect(screen.queryByText(territoryButtonText(TINY_ARXIV_SPEC))).toBeNull();

    await act(async () => {
      resolveImport({ default: TINY_ARXIV_SPEC });
    });

    // Mounting the map itself (the `ResizeObserver`'s first report, the
    // scene build) is a further step past the corpus resolving, so wait for
    // its own content rather than just the loading text's disappearance.
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    expect(screen.queryByText("Loading corpus…")).toBeNull();
  });

  it("switches the rendered corpus and the exact footer text through the corpus select", async () => {
    await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    expect(screen.getByText("Thank you to arXiv for use of its open access interoperability.")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
    await screen.findByText(territoryButtonText(elementsSpec));
    expect(screen.queryByText("Thank you to arXiv for use of its open access interoperability.")).toBeNull();
    expect(screen.queryByText(/^Synthetic corpus,/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
    await screen.findByText(territoryButtonText(syntheticSpec));
    expect(screen.getByText("Synthetic corpus, generated for scale testing.")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "constellations" } });
    await screen.findByText(territoryButtonText(constellationsSpec));
    expect(screen.queryByText(/^Synthetic corpus,/)).toBeNull();
  });

  it("calls the zoom handle from the Zoom in button and the indicator reflects the new ratio", async () => {
    await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    await screen.findByText("far · 1.0× · 2 items");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    await waitFor(() => {
      expect(screen.queryByText("far · 1.0× · 2 items")).toBeNull();
    });
  });

  it("renders the indicator from onViewChange's own values on mount", async () => {
    await renderApp();
    await screen.findByText("far · 1.0× · 2 items");
  });

  it("keeps every floating control out of document flow and bounded to the viewport (style checks, not pixels)", async () => {
    const { container } = await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    // The indicator only appears once `onViewChange` has committed — a
    // separate effect from the one that renders the territory list above —
    // so wait for it by name before reading anyone's style, rather than
    // assuming the two are always in the same commit.
    await screen.findByText("far · 1.0× · 2 items");

    const shell = container.querySelector<HTMLElement>("[data-app-shell]");
    expect(shell?.style.overflow).toBe("hidden");

    const topbar = container.querySelector<HTMLElement>("[data-topbar]");
    expect(topbar?.style.position).toBe("fixed");
    expect(topbar?.style.flexWrap).toBe("wrap");

    const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
    expect(zoom?.style.position).toBe("fixed");

    const indicator = container.querySelector<HTMLElement>("[data-indicator]");
    expect(indicator?.style.position).toBe("fixed");

    const footer = container.querySelector<HTMLElement>("[data-footer]");
    expect(footer?.style.position).toBe("fixed");

    for (const [label, el] of [
      ["topbar", topbar],
      ["select", screen.getByLabelText("Corpus") as HTMLSelectElement],
      ["zoom-controls", zoom],
      ...Array.from(zoom?.querySelectorAll<HTMLElement>("button") ?? []).map((b, i): [string, HTMLElement] => [
        `zoom-button-${i}`,
        b,
      ]),
      ["indicator", indicator],
      ["footer", footer],
    ] as Array<[string, HTMLElement | null]>) {
      if (!el) throw new Error(`${label} not found`);
      checkNoOverflowAt375(el, label);
    }
  });

  describe("Fix round 1 — failed arXiv load recovers, and the switch-away-and-back race", () => {
    it("shows a plain error and a Try again button when the arXiv import rejects; retrying loads the map", async () => {
      let resolveRetry!: (spec: MapSpec) => void;
      const retryPromise = new Promise<MapSpec>((resolve) => {
        resolveRetry = resolve;
      });
      const loadArxiv = vi
        .fn<() => Promise<MapSpec>>()
        .mockRejectedValueOnce(new Error("network drop"))
        .mockReturnValueOnce(retryPromise);
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await screen.findByText("Could not load the corpus.");
      // No apology, no jargon, and it says what to do next.
      expect(screen.queryByText(/sorry/i)).toBeNull();

      // The corpus select stays usable even while the map failed to load.
      expect((screen.getByLabelText("Corpus") as HTMLSelectElement).disabled).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      // The stale error must not linger while the retry itself is still in
      // flight — this is what proves the retry's own `attempt` tag (not
      // just its eventual success) is what makes it stop showing.
      await waitFor(() => {
        expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      });
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      await act(async () => {
        resolveRetry(TINY_ARXIV_SPEC);
      });

      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      expect(loadArxiv).toHaveBeenCalledTimes(2);
    });

    it("a late-resolving stale load never overwrites the corpus after switching away and back before it settles", async () => {
      const resolvers: Array<(spec: MapSpec) => void> = [];
      const loadArxiv = vi.fn<() => Promise<MapSpec>>(
        () =>
          new Promise<MapSpec>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const STALE_SPEC: MapSpec = {
        version: "1",
        territories: [{ id: "stale", name: "Stale Territory", members: ["s1"], centroid: [0, 0] }],
        nodes: [{ id: "s1", label: "Stale paper", x: 0, y: 0, territory: "stale" }],
      };
      const FRESH_SPEC: MapSpec = {
        version: "1",
        territories: [{ id: "fresh", name: "Fresh Territory", members: ["f1"], centroid: [0, 0] }],
        nodes: [{ id: "f1", label: "Fresh paper", x: 0, y: 0, territory: "fresh" }],
      };

      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      // First load in flight (arxiv is the default corpus).
      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));

      // Switch away, then back to arxiv, before that first load resolves.
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));
      expect(resolvers).toHaveLength(2);

      // Resolve the FIRST (now-stale) promise late, with a spec that must
      // never reach the screen — it belongs to an abandoned load attempt.
      await act(async () => {
        const stale = resolvers[0];
        if (!stale) throw new Error("expected the first resolver to exist");
        stale(STALE_SPEC);
      });
      expect(screen.queryByText(territoryButtonText(STALE_SPEC))).toBeNull();
      // Still showing the loading state for the second (current) attempt.
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      // Now resolve the SECOND (current) promise — this is the one that must win.
      await act(async () => {
        const fresh = resolvers[1];
        if (!fresh) throw new Error("expected the second resolver to exist");
        fresh(FRESH_SPEC);
      });
      await screen.findByText(territoryButtonText(FRESH_SPEC));
      expect(screen.queryByText(territoryButtonText(STALE_SPEC))).toBeNull();
    });
  });
});
