import { act, fireEvent, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_TUNING } from "./shared/tuning";

/**
 * jsdom has no `ResizeObserver`. A fake that records every instance and lets
 * a test fire a `contentRect` report directly, standing in for the browser
 * actually resizing the observed element. Mocked globally in this file only
 * (never in test/setup.ts) and restored after every test.
 */
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
// collapses `layoutCards`'s first candidate to exactly `(anchorX + 6,
// anchorY)`, so a card's screen position is a direct, exact read of
// `toScreen(vp, node.x, node.y)` — the same arithmetic this whole file's
// assertions are built on.
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
// card offset, gives an exact, independent read of both `vp.scale` (from the
// pixel distance between the two cards) and of where the box's own centre
// world point (the midpoint, not either node) landed (from the cards'
// midpoint) — without needing to read `vp` off the component directly.
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
    const { container } = render(<CorpusMap spec={singleNodeSpec} renderCard={(n) => <div>{n.label}</div>} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-card]")).toBeNull();
  });

  it("fits the corpus to the first measured size", () => {
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
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
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    // Rendered immediately, with no ResizeObserver report at all.
    expect(cardLeft(container)).toBeCloseTo(200 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(150, 9);

    // A report through the (still-instantiated, but unused) observer must
    // not move the map: explicit props always win.
    act(() => {
      latestObserver().report(1000, 1000);
    });
    expect(cardLeft(container)).toBeCloseTo(200 + 6, 9);
    expect(cardTop(container)).toBeCloseTo(150, 9);
  });
});

describe("CorpusMap resize keeps the view (showcase Task 2)", () => {
  it("keeps the world point formerly at the old box centre at the new box centre, and keeps scale, on a measured resize", () => {
    const { container } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    act(() => {
      latestObserver().report(800, 600);
    });
    // worldBounds x: [-5, 5] (width 10), y widened to [-0.5, 0.5] (a flat
    // axis) — usable 752x552, scale = min(752/10, 552/1) = 75.2, bound by x.
    const FIT_SCALE = 75.2;
    const beforeLeftA = cardLeft(container, "a");
    const beforeLeftB = cardLeft(container, "b");
    expect(beforeLeftA).toBeCloseTo(-5 * FIT_SCALE + 400 + 6, 6);
    expect(beforeLeftB).toBeCloseTo(5 * FIT_SCALE + 400 + 6, 6);
    expect(cardTop(container, "a")).toBeCloseTo(300, 6);

    act(() => {
      latestObserver().report(1000, 700);
    });
    // Scale kept exactly; the old box centre's world point (0, 0), the
    // midpoint of the two nodes, lands exactly on the new box centre.
    const afterLeftA = cardLeft(container, "a");
    const afterLeftB = cardLeft(container, "b");
    expect(afterLeftB - afterLeftA).toBeCloseTo(beforeLeftB - beforeLeftA, 9); // scale kept
    expect((afterLeftA + afterLeftB) / 2).toBeCloseTo(500 + 6, 9); // old centre -> new centre
    expect(cardTop(container, "a")).toBeCloseTo(350, 9);
    expect(cardTop(container, "b")).toBeCloseTo(350, 9);
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
    const { container, rerender } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        width={800}
        height={600}
      />,
    );
    const FIT_SCALE = 75.2;
    const beforeLeftA = cardLeft(container, "a");
    const beforeLeftB = cardLeft(container, "b");
    expect(beforeLeftA).toBeCloseTo(-5 * FIT_SCALE + 400 + 6, 6);
    expect(beforeLeftB).toBeCloseTo(5 * FIT_SCALE + 400 + 6, 6);
    expect(cardTop(container, "a")).toBeCloseTo(300, 6);

    rerender(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        width={1000}
        height={700}
      />,
    );
    const afterLeftA = cardLeft(container, "a");
    const afterLeftB = cardLeft(container, "b");
    expect(afterLeftB - afterLeftA).toBeCloseTo(beforeLeftB - beforeLeftA, 9); // scale kept
    expect((afterLeftA + afterLeftB) / 2).toBeCloseTo(500 + 6, 9); // old centre -> new centre
    expect(cardTop(container, "a")).toBeCloseTo(350, 9);
    expect(cardTop(container, "b")).toBeCloseTo(350, 9);
  });

  it("treats a lone width (no height) as not explicit — falls through to the measured box", () => {
    // The interface promise ("when both are given they win") means a lone
    // prop must be ignored entirely, not partially honoured — nothing in
    // the existing suite exercised this before fix round 1's review.
    const { container } = render(
      <CorpusMap
        spec={singleNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
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
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
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

  it("keeps the view (no stale-size frame) when a consumer switches from explicit props to auto-measured mid-lifecycle, and resumes keep-view correctly on the next real report", () => {
    // While explicit props are active, `useElementSize` is still attached
    // (rules of hooks) but is ignored — `box = explicitBox ?? measured`.
    // The moment the consumer drops the props, `box` falls through to
    // whatever `measured` currently holds. In a real browser the root
    // div's CSS was pinned to the literal explicit size the whole time (see
    // the render below), so the div's own box never moved and there is
    // nothing new for the ResizeObserver to report until the CSS itself
    // switches to `100%` on this same commit — so, for at least one commit,
    // `measured` is exactly the *old* explicit size, not yet the true
    // parent size. This test proves that transition paints the *same*
    // frame (not a wrong-size one) — an exact rendered no-op — and that the
    // very next real report is then handled by the ordinary (now-unified)
    // keep-view path, self-correcting to the true size.
    const { container, rerender } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
        width={800}
        height={600}
      />,
    );
    const beforeLeftA = cardLeft(container, "a");
    const beforeLeftB = cardLeft(container, "b");
    const beforeTop = cardTop(container, "a");

    // Drop the props: falls through to `measured`, which is still `null`
    // (this file's FakeResizeObserver only reports when a test calls
    // `.report()` — nothing has, while explicit props were active) — so the
    // map goes back to "not ready" for exactly this one commit, painting
    // nothing rather than a wrong-size frame.
    rerender(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-card]")).toBeNull();

    // The next real report (the true parent size) arrives: treated as the
    // *first* known size for the measured mode (fitBasis was cleared by the
    // "not ready" commit above), so it fits fresh rather than keeping the
    // stale 800x600 view — there is no old *measured* box to keep the view
    // relative to, only an old *explicit* one, and the ruling's unification
    // is about box changes within a continuously-ready lifetime, not about
    // carrying a view across a ready -> not-ready -> ready gap.
    act(() => {
      latestObserver().report(800, 600);
    });
    expect(cardLeft(container, "a")).toBeCloseTo(beforeLeftA, 6);
    expect(cardLeft(container, "b")).toBeCloseTo(beforeLeftB, 6);
    expect(cardTop(container, "a")).toBeCloseTo(beforeTop, 6);

    // And a further resize from there keeps the view exactly like any other
    // measured box change.
    act(() => {
      latestObserver().report(1000, 700);
    });
    const afterLeftA = cardLeft(container, "a");
    const afterLeftB = cardLeft(container, "b");
    expect(afterLeftB - afterLeftA).toBeCloseTo(beforeLeftB - beforeLeftA, 9);
    expect((afterLeftA + afterLeftB) / 2).toBeCloseTo(500 + 6, 9);
    expect(cardTop(container, "a")).toBeCloseTo(350, 9);
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
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={thresholds}
        onRegimeChange={(r) => regimes.push(r)}
      />,
    );
    // 800x2000: X stays the binding dimension of fitSpec (as in
    // CorpusMap.test.tsx's own tall-box technique), so the plain width
    // change below moves `fitScale` by a small, exactly known factor.
    act(() => {
      latestObserver().report(800, 2000);
    });
    const el = surface(container);
    let ratio = 1;
    const wheelToRatio = (target: number) => {
      const factor = target / ratio;
      const deltaY = -Math.log(factor) / DEFAULT_TUNING.wheelSensitivity;
      fireEvent.wheel(el, { deltaY, clientX: 0, clientY: 0 });
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
    const { container, rerender } = render(
      <CorpusMap
        spec={twoNodeSpec}
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
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
        renderCard={(n) => <div>{n.label}</div>}
        cardSize={NO_GROUPING}
        thresholds={{ midAt: 0, nearAt: 0 }}
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
        <CorpusMap spec={singleNodeSpec} renderCard={(n) => <div>{n.label}</div>} cardSize={NO_GROUPING} />
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
