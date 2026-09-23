import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import * as sceneModule from "./shared/scene";
import { buildScene } from "./shared/scene";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitSpec } from "./viewport/fit";
import { toScreen } from "./viewport/viewport";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a"], centroid: [0, 0] }],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1", meta: { secret: 42 } }],
};

const width = 400;
const height = 300;

/** Two territories, one at the origin and one at (ex, ey). */
function twoTerritories(ex: number, ey: number): MapSpec {
  return {
    version: "1",
    territories: [
      { id: "t1", name: "North", members: ["a"], centroid: [0, 0] },
      { id: "t2", name: "South", members: ["b"], centroid: [ex, ey] },
    ],
    nodes: [
      { id: "a", label: "Alpha", x: 0, y: 0, territory: "t1" },
      { id: "b", label: "Beta", x: ex, y: ey, territory: "t2" },
    ],
  };
}

describe("CorpusMap", () => {
  it("renders a canvas that is hidden from assistive technology", () => {
    const { container } = render(<CorpusMap spec={spec} renderCard={() => null} width={width} height={height} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
  });

  it("passes meta to renderCard without reading it", () => {
    const renderCard = vi.fn(() => <div>card</div>);
    render(
      <CorpusMap
        spec={spec}
        renderCard={renderCard}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ meta: { secret: 42 } }));
  });

  it("never reads inside meta: a Proxy that throws on any property access still renders", () => {
    const meta = new Proxy(
      {},
      {
        get() {
          throw new Error("the renderer read inside meta");
        },
      },
    );
    const proxied: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null, meta }],
    };
    const renderCard = vi.fn(() => <div>card</div>);
    render(
      <CorpusMap
        spec={proxied}
        renderCard={renderCard}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    expect(renderCard).toHaveBeenCalledTimes(1);
    const received = (renderCard.mock.calls[0] as unknown as [{ meta: unknown }])[0];
    expect(Object.is(received.meta, meta)).toBe(true);
  });

  it("throws a SpecError for a malformed spec rather than rendering nonsense", () => {
    const bad = { version: "1", territories: [], nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "ghost" }] };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<CorpusMap spec={bad as MapSpec} renderCard={() => null} width={10} height={10} />)).toThrow(
      /ghost/,
    );
    spy.mockRestore();
  });

  it("renders an empty spec without crashing", () => {
    const empty: MapSpec = { version: "1", territories: [], nodes: [] };
    const { container } = render(<CorpusMap spec={empty} renderCard={() => null} width={width} height={height} />);
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("opens the far regime for a corpus with a large fitted scale, like the elements demo (default thresholds)", () => {
    // Extent 17x4 in 960x640 (24 px padding, usable 912x592) fits at
    // scale = min(912/17, 592/4) = 53.6, which is above the pre-migration
    // absolute nearAt (8) and rendered cards on mount before this task.
    // Thresholds are now ratios of the fitted scale, so mounting (vp = the
    // fitted viewport, ratio 1) is always "far".
    const wide: MapSpec = {
      version: "1",
      territories: [],
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, territory: null },
        { id: "b", label: "B", x: 17, y: 4, territory: null },
      ],
    };
    const { container } = render(
      <CorpusMap spec={wide} renderCard={(n) => <div>{n.label}</div>} width={960} height={640} />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });

  // Explicit timeout: a single userEvent.click already measured at 3.5s on a
  // loaded runner (load avg ~7-12), well above the 5000ms default budget.
  it("pans and zooms the canvas to a territory when it is focused in the tree (Ruling B)", async () => {
    const user = userEvent.setup();
    // Thresholds are ratios of the fitted scale, and mounting always starts
    // at ratio 1 (vp = the fitted viewport): midAt < 1 < nearAt starts the
    // map in "mid" (tree shows territories, not items) and it lands exactly
    // in "near" once the focus handler sets the scale to `fitScale * nearAt`.
    const thresholds = { midAt: 0.5, nearAt: 2 };

    render(
      <CorpusMap
        spec={twoTerritories(1000, 1000)}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={thresholds}
      />,
    );

    await user.click(screen.getByRole("button", { name: /South/ }));

    const card = document.querySelector('[data-card="b"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    const left = Number.parseFloat(card?.style.left ?? "");
    const top = Number.parseFloat(card?.style.top ?? "");
    expect(Math.abs(left - width / 2)).toBeLessThanOrEqual(5);
    expect(Math.abs(top - height / 2)).toBeLessThanOrEqual(5);
  }, 15_000);

  // Explicit timeout: ~48 full renders + userEvent clicks measured at ~5.2s
  // on a loaded runner (load avg ~7-12), over the 5000ms default budget.
  it("focusing a territory lands in the near regime for awkward corpus extents (C3 sweep)", async () => {
    const user = userEvent.setup();
    // Extents chosen so the fitted scale (an awkward double) makes
    // `fitScale * nearAt` round-trip through `regimeAt`'s ratio division
    // imprecisely for roughly one extent in sixteen. Since thresholds are
    // now ratios, the mount regime is always "far" (ratio 1 < any nearAt
    // swept here) regardless of extent — what varies with the extent is
    // only the magnitude of `fitScale`, and therefore the float ulp the
    // round trip can lose. Both `nearAt` ratios are swept.
    const ks = [
      1, 7, 20, 50, 86, 95, 113, 130, 162, 168, 175, 195, 200, 208, 238, 260, 300, 323, 331, 348, 362, 377, 389, 398,
    ];
    const failures: string[] = [];
    let swept = 0;
    for (const nearAt of [100, 12.5]) {
      for (const k of ks) {
        const ex = k * 1.37 + 0.11;
        const ey = ex * 0.73;
        swept += 1;
        const { unmount } = render(
          <CorpusMap
            spec={twoTerritories(ex, ey)}
            renderCard={(n) => <div>{n.label}</div>}
            width={width}
            height={height}
            thresholds={{ midAt: nearAt / 2, nearAt }}
          />,
        );
        await user.click(screen.getByRole("button", { name: /South/ }));
        if (document.querySelector('[data-card="b"]') === null) failures.push(`nearAt=${nearAt} k=${k} ex=${ex}`);
        unmount();
      }
    }
    expect(swept).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  }, 20_000);

  it("resets the hysteresis regime, not just the viewport, when the spec changes under a wide hysteresis band (I2)", () => {
    const specA: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "p1", label: "P1", x: 0, y: 0, territory: null }],
    };
    const specB: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "p2", label: "P2", x: 0, y: 0, territory: null }],
    };
    const onRegimeChange = vi.fn();
    const { container, rerender } = render(
      <CorpusMap
        spec={specA}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0.5, nearAt: 1.02 }}
        tuning={{ hysteresis: 0.3 }}
        onRegimeChange={onRegimeChange}
      />,
    );
    // Mount ratio is always 1, so this starts "mid" (>= midAt 0.5, < nearAt
    // 1.02); one full wheel notch (factor ~1.27) crosses nearAt into "near".
    fireEvent.wheel(container.querySelector("[data-map-surface]") as HTMLElement, {
      deltaY: -120,
      clientX: 200,
      clientY: 150,
    });
    expect(onRegimeChange.mock.calls[onRegimeChange.mock.calls.length - 1]).toEqual(["near"]);
    expect(container.querySelectorAll("[data-card]").length).toBeGreaterThan(0);

    // Swap to a same-shaped new spec. The refit sets the ratio straight
    // back to 1, which — with a 30% hysteresis band on a nearAt of 1.02
    // (exit bound 1.02 * 0.7 = 0.714) — is still above the exit bound, so a
    // regime that merely carried over would wrongly stay "near" on a
    // corpus it never actually zoomed into.
    rerender(
      <CorpusMap
        spec={specB}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0.5, nearAt: 1.02 }}
        tuning={{ hysteresis: 0.3 }}
        onRegimeChange={onRegimeChange}
      />,
    );
    expect(onRegimeChange.mock.calls[onRegimeChange.mock.calls.length - 1]).toEqual(["mid"]);
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });

  it("repositions cards when the width changes without a remount (I2)", () => {
    const { container, rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const before = (container.querySelector('[data-card="a"]') as HTMLElement).style.left;
    rerender(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={800}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const after = (container.querySelector('[data-card="a"]') as HTMLElement).style.left;
    expect(after).not.toBe(before);
    expect(Number.parseFloat(after)).toBeCloseTo(400, 6);
  });

  it("refits to a different spec without a key= remount (I2)", () => {
    const farAway: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "z", label: "Zed", x: 100_000, y: 100_000, territory: null }],
    };
    const { container, rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    expect(container.querySelector('[data-card="a"]')).not.toBeNull();
    rerender(
      <CorpusMap
        spec={farAway}
        renderCard={(n) => <div>{n.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const card = container.querySelector('[data-card="z"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(Number.parseFloat(card?.style.left ?? "")).toBeCloseTo(width / 2, 6);
  });

  it("marks the card overlay inert so consumer focusables inside cards leave the tab order (I5)", () => {
    // jsdom does not implement `inert` focus semantics (user.tab() still
    // lands on the button with the attribute set), so this asserts the
    // attribute on the wrapper that contains the consumer's button; the
    // browser is what turns it into "not focusable, not hit-testable".
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={() => <button type="button">inside card</button>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const button = container.querySelector('[data-card="a"] button') as HTMLElement;
    expect(button.textContent).toBe("inside card");
    const overlay = button.closest('[aria-hidden="true"]');
    expect(overlay?.hasAttribute("inert")).toBe(true);
  });

  it("sizes the canvas backing store by devicePixelRatio while the CSS box stays put", () => {
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    try {
      const { container } = render(<CorpusMap spec={spec} renderCard={() => null} width={width} height={height} />);
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      expect(canvas.width).toBe(2 * width);
      expect(canvas.height).toBe(2 * height);
      expect(canvas.style.width).toBe(`${width}px`);
      expect(canvas.style.height).toBe(`${height}px`);
    } finally {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
      else Reflect.deleteProperty(window, "devicePixelRatio");
    }
  });

  it("keys the scene memo on the primitive values buildScene reads, not on the tuning/theme object identity", () => {
    const spy = vi.spyOn(sceneModule, "buildScene");
    try {
      // A fresh object literal every call, exactly how spec 4's tuning panel
      // (and any consumer passing `tuning`/`theme` inline) would pass props.
      const renderAt = (hullPadding: number) =>
        render(
          <CorpusMap
            spec={spec}
            renderCard={() => null}
            width={width}
            height={height}
            tuning={{ pinchGain: 3, hullPadding }}
            theme={{ ...DEFAULT_THEME }}
          />,
        );
      const { rerender } = renderAt(2.5);
      const rerenderAt = (hullPadding: number) =>
        rerender(
          <CorpusMap
            spec={spec}
            renderCard={() => null}
            width={width}
            height={height}
            tuning={{ pinchGain: 3, hullPadding }}
            theme={{ ...DEFAULT_THEME }}
          />,
        );
      for (let i = 0; i < 5; i += 1) rerenderAt(2.5);
      expect(spy).toHaveBeenCalledTimes(1);

      rerenderAt(9);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});

function recordingContext(texts: Array<{ text: string; x: number; y: number }>): CanvasRenderingContext2D {
  const noop = () => {};
  const ctx = {
    canvas: { width: 0, height: 0 },
    clearRect: noop,
    setTransform: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    // `useMeasure` creates its own offscreen canvas; this override replaces
    // `HTMLCanvasElement.prototype.getContext` globally for the test, so
    // that canvas gets this fake context too and needs a `measureText`.
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillStyle: "",
    strokeStyle: "",
    font: "",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("spec swap", () => {
  it("never paints the new spec at the previous viewport", () => {
    const texts: Array<{ text: string; x: number; y: number }> = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => recordingContext(texts)) as unknown as typeof original;
    try {
      const small: MapSpec = {
        version: "1",
        territories: [{ id: "t", name: "Small", members: ["a", "b", "c"], centroid: [1, 1] }],
        nodes: [
          { id: "a", label: "A", x: 0, y: 0, territory: "t" },
          { id: "b", label: "B", x: 2, y: 0, territory: "t" },
          { id: "c", label: "C", x: 1, y: 2, territory: "t" },
        ],
      };
      const large: MapSpec = {
        version: "1",
        territories: [{ id: "u", name: "Large", members: ["d", "e", "f"], centroid: [500, 500] }],
        nodes: [
          { id: "d", label: "D", x: 0, y: 0, territory: "u" },
          { id: "e", label: "E", x: 1000, y: 0, territory: "u" },
          { id: "f", label: "F", x: 500, y: 1000, territory: "u" },
        ],
      };
      const { rerender } = render(
        <CorpusMap spec={small} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} />,
      );
      texts.length = 0;
      rerender(<CorpusMap spec={large} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} />);
      // The anchor is the pole of inaccessibility of the territory's shape
      // (Task 5/6), not its raw centroid, so the expectation is computed the
      // same way CorpusMap does: build the scene against the NEW spec's
      // fitted viewport, never the stale one from before the swap.
      const largeVp = fitSpec(large, 400, 300, 24);
      const largeScene = buildScene(large, DEFAULT_TUNING, DEFAULT_THEME, estimateText, largeVp.scale);
      const label = largeScene.labels.find((l) => l.id === "u");
      if (!label) throw new Error("expected a placed label for territory 'u'");
      const [ex, ey] = toScreen(largeVp, label.anchor[0], label.anchor[1]);
      const largeTexts = texts.filter((t) => t.text === "Large");
      expect(largeTexts.length).toBeGreaterThan(0);
      for (const t of largeTexts) {
        expect(t.x).toBeCloseTo(ex, 6);
        expect(t.y).toBeCloseTo(ey, 6);
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
