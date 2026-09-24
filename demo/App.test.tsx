import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    const select = screen.getByLabelText("Corpus") as HTMLSelectElement;
    expect(select.style.maxWidth.endsWith("vw")).toBe(true);

    const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
    expect(zoom?.style.position).toBe("fixed");

    const indicator = container.querySelector<HTMLElement>("[data-indicator]");
    expect(indicator?.style.position).toBe("fixed");
    expect(indicator?.style.maxWidth.endsWith("vw")).toBe(true);

    const footer = container.querySelector<HTMLElement>("[data-footer]");
    expect(footer?.style.position).toBe("fixed");
    expect(footer?.style.maxWidth.endsWith("vw")).toBe(true);
  });
});
