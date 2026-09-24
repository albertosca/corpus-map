import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only: safe to import statically even though every test imports the
// component itself dynamically (`await import("./App")`), per-test, so each
// gets its own fresh module graph for `vi.doMock`/`vi.resetModules`.
import type { AppProps } from "./App";
import { DRAWER_MAX_WIDTH } from "./components/Drawer";
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

/** The element's own identifying `data-*` attribute name (besides `data-floating-control`), or its tag name if it has none. */
function labelFor(el: HTMLElement): string {
  const dataAttr = Array.from(el.attributes).find(
    (a) => a.name.startsWith("data-") && a.name !== "data-floating-control",
  );
  return dataAttr ? dataAttr.name.slice("data-".length) : el.tagName.toLowerCase();
}

/**
 * Walks every element `App` marks `data-floating-control` (the map's own
 * top bar, zoom controls, indicator, footer, and the load-error block), plus
 * each one's `button`/`select` descendants — the only elements that
 * currently carry their own width-like inline styles — and overflow-checks
 * every one. Fix round 2, Finding 2: the previous version of this test
 * hand-picked which elements to check, so a new floating control (the
 * load-error block and its "Try again" button, added in Fix round 1) could
 * slip past unnoticed; discovering them from the DOM instead means a future
 * one can't slip past the same way.
 */
function checkAllFloatingControls(container: HTMLElement): void {
  const controls = Array.from(container.querySelectorAll<HTMLElement>("[data-floating-control]"));
  expect(controls.length, "expected at least one [data-floating-control] element to check").toBeGreaterThan(0);
  for (const el of controls) {
    const label = labelFor(el);
    checkNoOverflowAt375(el, label);
    for (const child of Array.from(el.querySelectorAll<HTMLElement>("button, select"))) {
      checkNoOverflowAt375(child, `${label} > ${labelFor(child)}`);
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

    checkAllFloatingControls(container);
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
      const { container } = render(createElement<AppProps>(App, { loadArxiv }));

      await screen.findByText("Could not load the corpus.");
      // No apology, no jargon, and it says what to do next.
      expect(screen.queryByText(/sorry/i)).toBeNull();

      // The corpus select stays usable even while the map failed to load.
      expect((screen.getByLabelText("Corpus") as HTMLSelectElement).disabled).toBe(false);

      // Fix round 2, Finding 2: the load-error block and its "Try again"
      // button are floating controls too — checked here, while the error
      // state is actually on screen, since the general layout-sanity test
      // never triggers this branch.
      checkAllFloatingControls(container);

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      // The stale error must not linger while the retry itself is still in
      // flight — this is what proves clearing on a fresh load key (not just
      // the retry's eventual success) is what makes it stop showing.
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

  describe("Fix round 2 — every load start gets its own attempt identity", () => {
    /** A `loadArxiv` mock whose Nth call's controls (resolve/reject) are pushed to `controls` in call order. */
    function controllableLoader(): {
      loadArxiv: () => Promise<MapSpec>;
      controls: Array<{ resolve: (spec: MapSpec) => void; reject: (err: Error) => void }>;
    } {
      const controls: Array<{ resolve: (spec: MapSpec) => void; reject: (err: Error) => void }> = [];
      const loadArxiv = vi.fn<() => Promise<MapSpec>>(
        () =>
          new Promise<MapSpec>((resolve, reject) => {
            controls.push({ resolve, reject });
          }),
      );
      return { loadArxiv, controls };
    }

    it("switching away from a failed load and back shows Loading, not the stale error, while the fresh load is in flight", async () => {
      const { loadArxiv, controls } = controllableLoader();
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));
      const first = controls[0];
      if (!first) throw new Error("expected the first load's controls to exist");
      await act(async () => {
        first.reject(new Error("network drop"));
      });
      await screen.findByText("Could not load the corpus.");

      // Switch away, then back to arXiv, before the fresh load settles —
      // the re-reviewer's exact scenario: this is an *implicit* retry
      // (never touches `retryToken`), so a scheme that only tags a fresh
      // attempt on "Try again" clicks misses it entirely.
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));
      // A genuinely fresh load is now in flight; the previous, already-
      // settled error must not still be on screen.
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      const second = controls[1];
      if (!second) throw new Error("expected the second load's controls to exist");
      await act(async () => {
        second.resolve(TINY_ARXIV_SPEC);
      });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    });

    it("pins: switching away from a loaded corpus and back re-imports rather than reusing the cached spec", async () => {
      const loadArxiv = vi.fn<() => Promise<MapSpec>>().mockResolvedValue(TINY_ARXIV_SPEC);
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      expect(loadArxiv).toHaveBeenCalledTimes(1);

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      // Pinned, not asserted as "the only correct choice": every switch
      // back into arXiv re-imports rather than reusing a cached spec. The
      // real dynamic import this stands in for is itself cheap to call
      // again — the browser's own module cache serves a second
      // `import()` of the same specifier without a network re-fetch — so
      // there is no caching layer here that could quietly go stale.
      expect(loadArxiv).toHaveBeenCalledTimes(2);
    });

    it("pins: a stale failure that arrives after a later success does not override it", async () => {
      const { loadArxiv, controls } = controllableLoader();
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });
      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));

      const second = controls[1];
      if (!second) throw new Error("expected the second load's controls to exist");
      await act(async () => {
        second.resolve(TINY_ARXIV_SPEC);
      });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      // The stale FIRST attempt now fails, late — must not override the
      // success already on screen.
      const first = controls[0];
      if (!first) throw new Error("expected the first load's controls to exist");
      await act(async () => {
        first.reject(new Error("stale network drop"));
      });
      expect(screen.getByText(territoryButtonText(TINY_ARXIV_SPEC))).not.toBeNull();
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
    });
  });

  describe("Selected-item drawer (showcase Task 6)", () => {
    /**
     * Selection only reaches `onSelect` through the accessible tree's own
     * per-node buttons, which only exist at the "near" regime
     * (`AccessibleTree`), for whichever nodes `visibleNodes` currently
     * considers on screen. `TINY_ARXIV_SPEC`'s own two nodes sit exactly at
     * its world bounds' extremes, so `fit`'s view just barely contains them
     * at ratio 1 and *any* further zoom-in (which shrinks the view about
     * the box centre) pushes both out of view before "near" is even
     * reached — there is no zoom level where they are both in view and in
     * the near regime. `SELECT_SPEC` below carries the same two papers
     * (same ids, labels and meta as `TINY_ARXIV_SPEC`'s `p1`/`p2`, so every
     * assertion below reads the same) placed a hair off dead centre
     * instead, plus two filler nodes far out at the bounds' actual extremes
     * — the fit still centres on (0, 0), so `p1`/`p2` stay on screen no
     * matter how far in the box zooms.
     */
    const SELECT_SPEC: MapSpec = {
      version: "1",
      territories: [
        { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2", "west", "east"], centroid: [0, 0] },
      ],
      nodes: [
        {
          id: "p1",
          label: "A Tiny Paper About Testing",
          x: -0.0001,
          y: 0,
          territory: "cs.AI",
          meta: { year: 2026, url: "https://arxiv.org/abs/0000.00001" },
        },
        {
          id: "p2",
          label: "Another Tiny Paper",
          x: 0.0001,
          y: 0,
          territory: "cs.AI",
          meta: { year: 2025, url: "https://arxiv.org/abs/0000.00002" },
        },
        { id: "west", label: "West filler", x: -1, y: 0, territory: "cs.AI" },
        { id: "east", label: "East filler", x: 1, y: 0, territory: "cs.AI" },
      ],
    };

    /**
     * Each "Zoom in" click multiplies the ratio by
     * `exp(120 * DEFAULT_TUNING.wheelSensitivity)` (~1.27x); ten clicks
     * clears the default `nearAt` threshold of 6 with room to spare, well
     * under the `MAX_ZOOM_IN` clamp of 64x.
     */
    function zoomToNear(): void {
      for (let i = 0; i < 10; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
    }

    it("opens the drawer with the exact label and the arXiv link on selecting a node, and passes the floating-control overflow check", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      expect(screen.queryByRole("dialog")).toBeNull();

      zoomToNear();
      const nodeButton = await screen.findByRole("button", { name: "A Tiny Paper About Testing" });
      fireEvent.click(nodeButton);

      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      const link = within(dialog).getByRole("link", { name: "Open on arXiv" });
      expect(link.getAttribute("href")).toBe("https://arxiv.org/abs/0000.00001");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(within(dialog).getByText("Published 2026")).not.toBeNull();
      expect(within(dialog).getByText("Artificial Intelligence")).not.toBeNull();

      // The drawer is floating UI like every other demo control — this is
      // the same style-based check the rest of the shell already passes,
      // now walking the drawer too because it carries `data-floating-control`.
      checkAllFloatingControls(container);
    });

    it("selecting a different node while open updates the drawer in place instead of closing it", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();

      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.click(screen.getByRole("button", { name: "Another Tiny Paper" }));
      await screen.findByRole("dialog", { name: "Another Tiny Paper" });
      expect(screen.queryByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeNull();
    });

    it("switching corpus while the drawer is open closes it — a stale selection from the corpus just left must never show", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Escape closes the drawer and returns focus to the map surface", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      const mapShell = container.querySelector("[data-map-shell]");
      expect(document.activeElement).toBe(mapShell);
    });

    describe("keeping the zoom controls reachable beside the drawer (fix round 1)", () => {
      const originalInnerWidth = window.innerWidth;

      /** `window.innerWidth` is read at mount by `ZoomControls`' lazy `useState` initializer — must be set before `renderApp`. */
      function setViewportWidth(width: number): void {
        Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      }

      afterEach(() => {
        setViewportWidth(originalInnerWidth);
      });

      async function openDrawer(): Promise<void> {
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        zoomToNear();
        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      }

      it("on a wide viewport, shifts the zoom controls' right edge left of the drawer's left edge while the drawer is open", async () => {
        setViewportWidth(1280);
        const { container } = await renderApp(SELECT_SPEC);
        await openDrawer();

        // Parsed the same way `checkNoOverflowAt375` reads inline values —
        // no layout engine in jsdom. The drawer's `right` is `0` and its
        // rendered width, at this viewport, is capped at `DRAWER_MAX_WIDTH`
        // by its own `maxWidth` (its `width: 90vw` would be far larger), so
        // its left edge sits at `right + DRAWER_MAX_WIDTH` from the
        // viewport's own right edge. The controls' right edge sits left of
        // that exactly when their own `right` offset is greater.
        const drawer = container.querySelector<HTMLElement>("[data-drawer]");
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        const drawerRight = Number.parseFloat(drawer?.style.right ?? "");
        const drawerLeftFromViewportRight = drawerRight + DRAWER_MAX_WIDTH;
        const zoomRight = Number.parseFloat(zoom?.style.right ?? "");
        expect(zoomRight).toBeGreaterThan(drawerLeftFromViewportRight);
      });

      it("at 375px, the drawer fits and the fallback holds — the zoom controls stay at their default offset, covered by the drawer", async () => {
        setViewportWidth(375);
        const { container } = await renderApp(SELECT_SPEC);
        await openDrawer();

        checkAllFloatingControls(container);
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        expect(zoom?.style.right).toBe("12px");
      });
    });
  });
});
