import { act, fireEvent, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapView } from "./CorpusMap";
import type { MapNode, MapSpec } from "./shared/spec";
import { DEFAULT_TUNING } from "./shared/tuning";

/**
 * jsdom has no `ResizeObserver`. A fake that records every instance and lets
 * a test fire a `contentRect` report directly, standing in for the browser
 * actually resizing the observed element. Mocked globally in this file only
 * (never in test/setup.ts) and restored after every test.
 *
 * Fix round 2: a real `ResizeObserver` delivers an initial callback with the
 * observed element's *current* size as soon as `observe()` starts, not only
 * on a later change — the original fake stayed silent until a test called
 * `.report()`, which let a mid-lifecycle test (rewritten below) assert a
 * "not ready" transition that cannot happen in a real browser. `observe()`
 * now fires that initial callback too, from whichever of two sources
 * actually determines the element's size in a given test:
 *   - explicit `width`/`height` props: `CorpusMap`'s root div's inline style
 *     is a deterministic, literal pixel box in that mode
 *     (`explicitBox ? width : "100%"`), so the initial size is read straight
 *     from `target`'s own `style.width`/`style.height` — no test setup
 *     needed, and it can never disagree with what the component itself just
 *     rendered.
 *   - auto-measured mode: the style is `100%`, whose real pixel size in a
 *     browser depends on the parent, which jsdom never lays out — a test
 *     that wants `observe()` to already know a size (simulating a parent
 *     that already has a size when the map mounts) sets `currentMeasuredSize`
 *     first; left `null` (the default, reset every test), the fake stays
 *     silent, same as the "genuinely not measured yet" case a real observer
 *     would also not be able to report before the browser lays anything out.
 * `observe()` is called exactly once per component instance (the hook's
 * effect has a stable `[ref]` dependency), so this fake does not — and a
 * real `ResizeObserver` watching a jsdom-less element could not either —
 * re-fire automatically on a later style change alone; a genuinely new size
 * after the first still needs an explicit `.report()` call.
 */
let currentMeasuredSize: { width: number; height: number } | null = null;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.target = target;
    const element = target as HTMLElement;
    const styleWidth = Number.parseFloat(element.style.width);
    const styleHeight = Number.parseFloat(element.style.height);
    const explicitStyle =
      element.style.width.endsWith("px") && element.style.height.endsWith("px")
        ? { width: styleWidth, height: styleHeight }
        : null;
    const initial = explicitStyle ?? currentMeasuredSize;
    if (initial) this.report(initial.width, initial.height);
  }

  unobserve(): void {
    this.target = null;
  }

  disconnect(): void {
    this.target = null;
  }

  report(width: number, height: number): void {
    const entry = { contentRect: { width, height } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

let original: typeof ResizeObserver | undefined;

beforeEach(() => {
  original = globalThis.ResizeObserver;
  FakeResizeObserver.instances = [];
  currentMeasuredSize = null;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  if (original) (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = original;
  else Reflect.deleteProperty(globalThis, "ResizeObserver");
});

function latestObserver(): FakeResizeObserver {
  const observer = FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1];
  if (!observer) throw new Error("expected a ResizeObserver instance");
  return observer;
}

// Zero-size cards (map-feel Task 8, and the reasoning in CorpusMap.test.tsx):
// collapses `placeSelectedCard`'s first candidate to exactly `(anchorX + 6,
// anchorY)`, so the selected card's screen position is a direct, exact read
// of `toScreen(viewport, node.x, node.y)` — the same arithmetic this whole
// file's assertions are built on. Only the selected item has a card (spec
// item labels §3), so every map here selects the node it reads.
const NO_GROUPING = { width: 0, height: 0 };

function cardLeft(container: HTMLElement, id = "a"): number {
  return Number.parseFloat((container.querySelector(`[data-card="${id}"]`) as HTMLElement).style.left);
}

function cardTop(container: HTMLElement, id = "a"): number {
  return Number.parseFloat((container.querySelector(`[data-card="${id}"]`) as HTMLElement).style.top);
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

const singleNodeSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null }],
};

// A symmetric two-node spec: fitSpec centres the box on their midpoint (0,
// 0), so each node's own screen position, plus the constant `anchorX + 6`
// card offset, gives an exact, independent read of both `viewport.scale`
// (from the pixel distance between the two nodes) and of where the box's own
// centre world point (the midpoint, not either node) landed (from the nodes'
// midpoint) — without needing to read the viewport off the component. One
// card shows at a time, so a test runs the same deterministic sequence once
// selecting a and once selecting b, and reads each node from its own run.
const twoNodeSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: -5, y: 0, territory: null },
    { id: "b", label: "B", x: 5, y: 0, territory: null },
  ],
};

describe("CorpusMap fills its parent (showcase Task 2)", () => {
  it("renders nothing (no canvas, no cards) before the first measured size", () => {
    const { container } = render(<CorpusMap spec={singleNodeSpec} renderCard={(node) => <div>{node.label}</div>} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-card]")).toBeNull();
  });

  it("fits the corpus to the first measured size", () => {
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        defaultSelectedId="a"
      />,
    );
    act(() => {
      latestObserver().report(800, 600);
    });
    expect(container.querySelector("canvas")).not.toBeNull();
    // fitSpec of a single node into 800x600 (24px padding) centres it at the
    // box centre exactly.
    expect(cardLeft(container)).toBeCloseTo(400 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(300, 9);
  });

  it("bypasses the observer when explicit width/height props are given", () => {
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        defaultSelectedId="a"
      />,
    );
    // Rendered immediately: the observer does fire once, automatically, on
    // observe() (fix round 2 — matching a real ResizeObserver's initial
    // callback), reporting the same 400x300 straight from the root div's
    // own style — but it is `measured`, which the map ignores outright
    // while `explicitBox` is set, so nothing here waited on it.
    expect(cardLeft(container)).toBeCloseTo(200 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(150, 9);

    // A further, different report through the (still-instantiated, but
    // unused) observer must not move the map either: explicit props always
    // win over `measured`, no matter its value.
    act(() => {
      latestObserver().report(1000, 1000);
    });
    expect(cardLeft(container)).toBeCloseTo(200 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(150, 9);
  });
});

describe("CorpusMap resize keeps the view (showcase Task 2)", () => {
  it("keeps the world point formerly at the old box centre at the new box centre, and keeps scale, on a measured resize", () => {
    const run = (selected: "a" | "b") => {
      const { container, unmount } = render(
        <CorpusMap
          spec={twoNodeSpec}
          renderCard={(node) => <div>{node.label}</div>}
          cardSize={NO_GROUPING}
          thresholds={{ midAt: 0, nearAt: 0 }}
          defaultSelectedId={selected}
        />,
      );
      act(() => {
        latestObserver().report(800, 600);
      });
      const before = { left: cardLeft(container, selected), top: cardTop(container, selected) };
      act(() => {
        latestObserver().report(1000, 700);
      });
      const after = { left: cardLeft(container, selected), top: cardTop(container, selected) };
      unmount();
      return { before, after };
    };
    const leftNode = run("a");
    const rightNode = run("b");
    // worldBounds x: [-5, 5] (width 10), y widened to [-0.5, 0.5] (a flat
    // axis) — usable 752x552, scale = min(752/10, 552/1) = 75.2, bound by x.
    const FIT_SCALE = 75.2;
    expect(leftNode.before.left).toBeCloseTo(-5 * FIT_SCALE + 400 + 6, 6);
    expect(rightNode.before.left).toBeCloseTo(5 * FIT_SCALE + 400 + 6, 6);
    expect(leftNode.before.top).toBeCloseTo(300, 6);

    // Scale kept exactly; the old box centre's world point (0, 0), the
    // midpoint of the two nodes, lands exactly on the new box centre.
    expect(rightNode.after.left - leftNode.after.left).toBeCloseTo(rightNode.before.left - leftNode.before.left, 9); // scale kept
    expect((leftNode.after.left + rightNode.after.left) / 2).toBeCloseTo(500 + 6, 9); // old centre -> new centre
    expect(leftNode.after.top).toBeCloseTo(350, 9);
    expect(rightNode.after.top).toBeCloseTo(350, 9);
  });

  it("keeps the world point formerly at the old box centre at the new box centre, and keeps scale, on an explicit-props resize (fix round 1: unify with measured)", () => {
    // Controller's ruling (binding, fix round 1): every box change after the
    // first keeps the view, whether the size comes from explicit
    // width/height props or from the measurement — "behaviour as today"
    // with props means only "no observer, the props win" (the first-fit
    // still happens immediately, with no need to wait on a ResizeObserver
    // callback). A consumer who measures their own container and threads
    // the numbers through as props is exactly the "window being resized"
    // case the spec motivates (spec 4 §1's own parenthetical), so it gets
    // the same keep-view treatment a measured resize gets. Same numbers and
    // arithmetic as the measured-resize test above, so the two are directly
    // comparable.
    const run = (selected: "a" | "b") => {
      const { container, rerender, unmount } = render(
        <CorpusMap
          spec={twoNodeSpec}
          renderCard={(node) => <div>{node.label}</div>}
          cardSize={NO_GROUPING}
          thresholds={{ midAt: 0, nearAt: 0 }}
          defaultSelectedId={selected}
          width={800}
          height={600}
        />,
      );
      const before = { left: cardLeft(container, selected), top: cardTop(container, selected) };
      rerender(
        <CorpusMap
          spec={twoNodeSpec}
          renderCard={(node) => <div>{node.label}</div>}
          cardSize={NO_GROUPING}
          thresholds={{ midAt: 0, nearAt: 0 }}
          defaultSelectedId={selected}
          width={1000}
          height={700}
        />,
      );
      const after = { left: cardLeft(container, selected), top: cardTop(container, selected) };
      unmount();
      return { before, after };
    };
    const leftNode = run("a");
    const rightNode = run("b");
    const FIT_SCALE = 75.2;
    expect(leftNode.before.left).toBeCloseTo(-5 * FIT_SCALE + 400 + 6, 6);
    expect(rightNode.before.left).toBeCloseTo(5 * FIT_SCALE + 400 + 6, 6);
    expect(leftNode.before.top).toBeCloseTo(300, 6);

    expect(rightNode.after.left - leftNode.after.left).toBeCloseTo(rightNode.before.left - leftNode.before.left, 9); // scale kept
    expect((leftNode.after.left + rightNode.after.left) / 2).toBeCloseTo(500 + 6, 9); // old centre -> new centre
    expect(leftNode.after.top).toBeCloseTo(350, 9);
    expect(rightNode.after.top).toBeCloseTo(350, 9);
  });

  it("treats a lone width (no height) as not explicit — falls through to the measured box", () => {
    // The interface promise ("when both are given they win") means a lone
    // prop must be ignored entirely, not partially honoured — nothing in
    // the existing suite exercised this before fix round 1's review.
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        defaultSelectedId="a"
        width={400}
      />,
    );
    // Not explicit: nothing painted until the observer reports, exactly as
    // in the no-props case, even though `width` was given.
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-card]")).toBeNull();

    act(() => {
      latestObserver().report(800, 600);
    });
    // Fitted to the *measured* 800x600 box, not to `width=400` paired with
    // any guessed height.
    expect(cardLeft(container)).toBeCloseTo(400 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(300, 9);
  });

  it("treats a lone height (no width) as not explicit — falls through to the measured box", () => {
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        defaultSelectedId="a"
        height={300}
      />,
    );
    expect(container.querySelector("canvas")).toBeNull();
    act(() => {
      latestObserver().report(800, 600);
    });
    expect(cardLeft(container)).toBeCloseTo(400 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(300, 9);
  });

  it("keeps the current view (no stale-size frame, no silent refit) when a consumer switches from explicit props to auto-measured mid-lifecycle, and resumes keep-view correctly on the next real report", () => {
    // Fix round 2, realistic premise: a real ResizeObserver delivers an
    // initial callback with the observed element's *current* size as soon
    // as observe() starts. This file's FakeResizeObserver now does the same
    // (see its own comment) — while explicit props are active, the root
    // div's inline style already IS the literal 800x600 box, so `observe()`
    // reports it immediately and `measured` already equals {800, 600} by
    // the time this test's first `render()` returns. Dropping the props
    // therefore falls through to an *already-correct* `measured` value, not
    // a stale or absent one: `fitBasis` (still `{twoNodeSpec, 800, 600}`
    // from before the switch) matches the post-switch box exactly, so the
    // box-change branch's own `fitBasis.width !== width || ...` check is
    // false and nothing runs at all — a genuine no-op commit, not a blank
    // frame (fix round 1's version of this test wrongly assumed `measured`
    // was still `null` at the switch, which only held because the fake
    // stayed silent — that assumption is exactly what this round's realism
    // fix corrects; see the "Fix round 2" section of the report).
    //
    // A genuine no-op is not, by itself, distinguishable from a *silent
    // refit* to that same box: refitting `twoNodeSpec` into an unchanged
    // 800x600 box reproduces the exact same fitted numbers, so a test that
    // never moves the view away from the fit first cannot tell "kept" from
    // "quietly recomputed" — the same pitfall the regime-hysteresis test
    // above already had to design around. Zooming away from the fit before
    // switching closes that gap: a refit-in-disguise would snap back to the
    // fitted view; a true no-op keeps the zoomed one.
    //
    // Zoom OUT, anchored at the box's own centre (400, 300 in local/surface
    // coordinates — jsdom's default zero-rect `getBoundingClientRect`, same
    // as this file's other wheel-driven test). Zooming out, not in: the
    // fitted view already spans 752 of the 800px-wide box (24px padding
    // each side), so zooming in would immediately push a node outside the
    // box, where the selected card is not shown — zooming out leaves
    // headroom. `zoomTo`/`zoomAt` keep whatever world point is currently
    // under the anchor fixed at that screen position, and world (0, 0) — the
    // midpoint of the two nodes — is exactly what the fitted view already
    // puts at (400, 300), so it stays there through the zoom; only the scale
    // changes, giving a real, non-default state to prove is preserved (not
    // reproduced by coincidence).
    const run = (selected: "a" | "b") => {
      const observersBefore = FakeResizeObserver.instances.length;
      const { container, rerender, unmount } = render(
        <CorpusMap
          spec={twoNodeSpec}
          renderCard={(node) => <div>{node.label}</div>}
          cardSize={NO_GROUPING}
          thresholds={{ midAt: 0, nearAt: 0 }}
          defaultSelectedId={selected}
          width={800}
          height={600}
        />,
      );
      expect(FakeResizeObserver.instances).toHaveLength(observersBefore + 1);
      fireEvent.wheel(surface(container), { deltaY: 240, clientX: 400, clientY: 300 });
      const zoomed = { left: cardLeft(container, selected), top: cardTop(container, selected) };

      // Drop the props: falls through to `measured`, which this fake already
      // reported as {800, 600} on `observe()` — the same value `fitBasis`
      // already holds — so this must be a true no-op commit.
      rerender(
        <CorpusMap
          spec={twoNodeSpec}
          renderCard={(node) => <div>{node.label}</div>}
          cardSize={NO_GROUPING}
          thresholds={{ midAt: 0, nearAt: 0 }}
          defaultSelectedId={selected}
        />,
      );
      // No new observer: the hook's effect has a stable `[ref]` dependency
      // and never re-subscribes just because the box's source changed.
      expect(FakeResizeObserver.instances).toHaveLength(observersBefore + 1);
      const switched = { left: cardLeft(container, selected), top: cardTop(container, selected) };

      // The true parent size arrives later, as a genuinely new report on the
      // same (persisting) observer — handled by the ordinary, unified
      // keep-view box-change path, same as any other measured resize, and
      // relative to the *zoomed* state just proven kept, not the original fit.
      act(() => {
        latestObserver().report(1000, 700);
      });
      const after = { left: cardLeft(container, selected), top: cardTop(container, selected) };
      unmount();
      return { zoomed, switched, after };
    };
    const leftNode = run("a");
    const rightNode = run("b");
    const FIT_SPAN = 10 * 75.2; // the un-zoomed span between the two nodes, for comparison
    expect(rightNode.zoomed.left - leftNode.zoomed.left).toBeLessThan(FIT_SPAN * 0.9); // actually zoomed out

    expect(leftNode.switched.left).toBeCloseTo(leftNode.zoomed.left, 9);
    expect(rightNode.switched.left).toBeCloseTo(rightNode.zoomed.left, 9);
    expect(leftNode.switched.top).toBeCloseTo(leftNode.zoomed.top, 9);

    expect(rightNode.after.left - leftNode.after.left).toBeCloseTo(rightNode.zoomed.left - leftNode.zoomed.left, 9); // scale kept
    expect((leftNode.after.left + rightNode.after.left) / 2).toBeCloseTo(500 + 6, 9); // old centre -> new centre
    expect(leftNode.after.top).toBeCloseTo(350, 9);
  });

  it("does not reset the regime hysteresis on a box-only change", () => {
    // The naive bug this guards against is resetting `regime` on every box
    // change the same way a spec change does — `regimeAt(1, thresholds,
    // "far", hysteresis)`, a value that depends only on `thresholds`, not on
    // history. That reset value coincides with whatever regime a fresh
    // mount already computes, so a test that never moves the regime away
    // from its just-mounted value cannot tell a reset from no reset — both
    // read identically. This test first zooms (with the exact, proven
    // wheelToRatio technique from CorpusMap.interaction.test.tsx's
    // hysteresis test) to land the ratio exactly on `nearAt` (6), reaching
    // "near" — away from the mount-time "far" — and only then resizes.
    //
    // The resize is sized so the post-resize ratio (vp.scale kept, fitScale
    // recomputed for the new box) lands inside the hysteresis retention band
    // just below nearAt (`[nearAt * 0.95, nearAt)`): with the true previous
    // regime "near" carried through, `regimeAt` stays "near" (sticky,
    // hysteresis); with the bug, `regime` collapses to "far" first, which
    // sits at the hysteresis engine's own floor (`ORDER["far"] === 0`), so
    // its stickiness never applies and the same ratio instead lands on the
    // plain, unstuck "mid" — a different, observable regime.
    const thresholds = { midAt: 2, nearAt: 6 };
    const regimes: string[] = [];
    const { container } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={thresholds}
        onRegimeChange={(regime) => regimes.push(regime)}
      />,
    );
    // 800x2000: X stays the binding dimension of fitSpec (as in
    // CorpusMap.test.tsx's own tall-box technique), so the plain width
    // change below moves `fitScale` by a small, exactly known factor.
    act(() => {
      latestObserver().report(800, 2000);
    });
    const element = surface(container);
    let ratio = 1;
    const wheelToRatio = (target: number) => {
      const factor = target / ratio;
      const wheelDelta = -Math.log(factor) / DEFAULT_TUNING.wheelSensitivity;
      fireEvent.wheel(element, { deltaY: wheelDelta, clientX: 0, clientY: 0 });
      ratio = target;
    };
    wheelToRatio(6 ** (1 / 3));
    wheelToRatio(6 ** (2 / 3));
    wheelToRatio(6);
    expect(regimes).toEqual(["far", "mid", "near"]);
    regimes.length = 0;

    // fitScale: 800 -> (800 - 48) / 10 = 75.2; 820 -> (820 - 48) / 10 = 77.2.
    // vp.scale was fixed at 75.2 * 6 by the zoom above and is kept exactly
    // by a box-only change, so the new ratio is 6 * (75.2 / 77.2) ≈
    // 5.8446 — inside [5.7, 6).
    act(() => {
      latestObserver().report(820, 2000);
    });
    // No onRegimeChange call at all is the "stayed near" signature: `next`
    // never differs from the already-committed `regime`, so the `if (next
    // !== regime) setRegime(next)` below never fires.
    expect(regimes).toEqual([]);
  });

  it("a spec swap after a resize refits (and does reset the regime)", () => {
    // The selection is controlled so it can name each spec's item.
    const { container, rerender } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        selectedId="a"
      />,
    );
    act(() => {
      latestObserver().report(800, 600);
    });
    act(() => {
      latestObserver().report(1000, 700);
    });
    const farAway: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "z", label: "Zed", x: 100_000, y: 100_000, territory: null }],
    };
    rerender(
      <CorpusMap
        spec={farAway}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        selectedId="z"
      />,
    );
    const card = container.querySelector('[data-card="z"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    // Refit to the new spec, in the current (post-resize) 1000x700 box: the
    // single node lands exactly at the box centre, same as any other refit.
    expect(Number.parseFloat(card?.style.left ?? "")).toBeCloseTo(500 + 6, 6);
    expect(Number.parseFloat(card?.style.top ?? "")).toBeCloseTo(350, 6);
  });

  it("causes no commit for a report of the same size (Profiler count)", () => {
    let commits = 0;
    const onRenderProfile: ProfilerOnRenderCallback = () => {
      commits += 1;
    };
    render(
      <Profiler id="resize-probe" onRender={onRenderProfile}>
        <CorpusMap spec={singleNodeSpec} renderCard={(node) => <div>{node.label}</div>} cardSize={NO_GROUPING} />
      </Profiler>,
    );
    act(() => {
      latestObserver().report(800, 600);
    });
    commits = 0;
    act(() => {
      latestObserver().report(800, 600);
    });
    expect(commits).toBe(0);
  });
});

describe("CorpusMap ignores a zero-area box (whole-branch review I3)", () => {
  it("a zero-height first box is not a fit basis: the first real size fits (explicit props)", () => {
    const views: CorpusMapView[] = [];
    const properties = {
      spec: twoNodeSpec,
      renderCard: (node: MapNode) => <div>{node.label}</div>,
      cardSize: NO_GROUPING,
      onViewChange: (view: CorpusMapView) => views.push(view),
    };
    const { container, rerender } = render(<CorpusMap {...properties} width={1280} height={0} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(views).toEqual([]);

    rerender(<CorpusMap {...properties} width={1280} height={800} />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(views[views.length - 1]?.ratio).toBeCloseTo(1, 9);
  });

  it("a zero-width first measurement is not a fit basis: the first real measurement fits (measured)", () => {
    const views: CorpusMapView[] = [];
    const { container } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(node) => <div>{node.label}</div>}
        cardSize={NO_GROUPING}
        onViewChange={(view) => views.push(view)}
      />,
    );
    act(() => {
      latestObserver().report(0, 800);
    });
    expect(container.querySelector("canvas")).toBeNull();
    expect(views).toEqual([]);

    act(() => {
      latestObserver().report(1280, 800);
    });
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(views[views.length - 1]?.ratio).toBeCloseTo(1, 9);
  });

  it("a box that collapses to zero height and comes back keeps the view it had", () => {
    const views: CorpusMapView[] = [];
    const properties = {
      spec: twoNodeSpec,
      renderCard: (node: MapNode) => <div>{node.label}</div>,
      cardSize: NO_GROUPING,
      onViewChange: (view: CorpusMapView) => views.push(view),
    };
    const { rerender } = render(<CorpusMap {...properties} width={1280} height={800} />);
    rerender(<CorpusMap {...properties} width={1280} height={0} />);
    rerender(<CorpusMap {...properties} width={1280} height={800} />);
    expect(views[views.length - 1]?.ratio).toBeCloseTo(1, 9);
  });
});
