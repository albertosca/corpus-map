import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import * as sceneModule from "./shared/scene";
import { buildScene } from "./shared/scene";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import { toScreen } from "./viewport/viewport";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a"], centroid: [0, 0] }],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1", meta: { secret: 42 } }],
};

const width = 400;
const height = 300;

/** Two territories, one at the origin and one at (horizontal, vertical). */
function twoTerritories(horizontal: number, vertical: number): MapSpec {
  return {
    version: "1",
    territories: [
      { id: "t1", name: "North", members: ["a"], centroid: [0, 0] },
      { id: "t2", name: "South", members: ["b"], centroid: [horizontal, vertical] },
    ],
    nodes: [
      { id: "a", label: "Alpha", x: 0, y: 0, territory: "t1" },
      { id: "b", label: "Beta", x: horizontal, y: vertical, territory: "t2" },
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
        defaultSelectedId="a"
      />,
    );
    expect(renderCard).toHaveBeenCalledWith(expect.objectContaining({ meta: { secret: 42 } }));
    // One argument: the node alone (`CardContext` and its badge count are gone).
    expect(renderCard.mock.calls[0]).toHaveLength(1);
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
        defaultSelectedId="a"
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
      <CorpusMap spec={wide} renderCard={(node) => <div>{node.label}</div>} width={960} height={640} />,
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
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={thresholds}
        // Zero-size cards (map-feel Task 8): the card frame then collapses
        // to a point offset from its anchor by exactly the 6 px gap
        // (`left = anchorX + 6, top = anchorY`), so the assertions below —
        // which are about where the focus handler centres the anchor, not
        // about card placement — only need that constant +6 added back in.
        // b is selected so its one card exists (no card without a selection).
        cardSize={{ width: 0, height: 0 }}
        defaultSelectedId="b"
      />,
    );

    await user.click(screen.getByRole("button", { name: /South/ }));

    const card = document.querySelector('[data-card="b"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    const left = Number.parseFloat(card?.style.left ?? "");
    const top = Number.parseFloat(card?.style.top ?? "");
    expect(Math.abs(left - (width / 2 + 6))).toBeLessThanOrEqual(5);
    expect(Math.abs(top - height / 2)).toBeLessThanOrEqual(5);
  }, 15_000);

  // Explicit timeout: same budget as the test above, for the same reason.
  it("lands with the item labels fully faded in when a territory is focused from the tree (I1)", async () => {
    const user = userEvent.setup();
    // Landing exactly on `nearAt` (the pre-fix behaviour) puts the item
    // labels' fade (`cardOpacity`) at exactly 0 — labels painted but
    // invisible right after the one keyboard/AT action meant to show them.
    // The fade reaches 1 at nearAt * (1 + fadeBand). Any `nearAt` reproduces
    // it; this one is picked only to keep well clear of the wheel clamp
    // (nearAt * (1 + fadeBand) = 5, far under fitScale * 64).
    const thresholds = { midAt: 0.5, nearAt: 4 };
    const onViewChange = vi.fn();

    render(
      <CorpusMap
        spec={twoTerritories(1000, 1000)}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={thresholds}
        onViewChange={onViewChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /South/ }));

    const landed = onViewChange.mock.calls[onViewChange.mock.calls.length - 1]?.[0];
    expect(landed?.regime).toBe("near");
    expect(landed?.ratio).toBeGreaterThanOrEqual(thresholds.nearAt * (1 + DEFAULT_TUNING.fadeBand) - 1e-9);
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
    const multipliers = [
      1, 7, 20, 50, 86, 95, 113, 130, 162, 168, 175, 195, 200, 208, 238, 260, 300, 323, 331, 348, 362, 377, 389, 398,
    ];
    const failures: string[] = [];
    let swept = 0;
    // 64 is thresholds' own valid ceiling (resolveThresholds, I4: the wheel
    // zoom clamp makes anything above it unreachable), swapped in for the
    // pre-I4 sweep's 100.
    for (const nearAt of [64, 12.5]) {
      for (const multiplier of multipliers) {
        const horizontal = multiplier * 1.37 + 0.11;
        const vertical = horizontal * 0.73;
        swept += 1;
        const onRegimeChange = vi.fn();
        const { unmount } = render(
          <CorpusMap
            spec={twoTerritories(horizontal, vertical)}
            renderCard={(node) => <div>{node.label}</div>}
            width={width}
            height={height}
            thresholds={{ midAt: nearAt / 2, nearAt }}
            onRegimeChange={onRegimeChange}
          />,
        );
        await user.click(screen.getByRole("button", { name: /South/ }));
        if (onRegimeChange.mock.calls[onRegimeChange.mock.calls.length - 1]?.[0] !== "near")
          failures.push(`nearAt=${nearAt} multiplier=${multiplier} horizontal=${horizontal}`);
        unmount();
      }
    }
    expect(swept).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  }, 20_000);

  it("resets the hysteresis regime, not just the viewport, when the spec changes under a wide hysteresis band (I2)", () => {
    const firstSpec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "p1", label: "P1", x: 0, y: 0, territory: null }],
    };
    const secondSpec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "p2", label: "P2", x: 0, y: 0, territory: null }],
    };
    const onRegimeChange = vi.fn();
    const { container, rerender } = render(
      <CorpusMap
        spec={firstSpec}
        renderCard={(node) => <div>{node.label}</div>}
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

    // Swap to a same-shaped new spec. The refit sets the ratio straight
    // back to 1, which — with a 30% hysteresis band on a nearAt of 1.02
    // (exit bound 1.02 * 0.7 = 0.714) — is still above the exit bound, so a
    // regime that merely carried over would wrongly stay "near" on a
    // corpus it never actually zoomed into.
    rerender(
      <CorpusMap
        spec={secondSpec}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0.5, nearAt: 1.02 }}
        tuning={{ hysteresis: 0.3 }}
        onRegimeChange={onRegimeChange}
      />,
    );
    expect(onRegimeChange.mock.calls[onRegimeChange.mock.calls.length - 1]).toEqual(["mid"]);
  });

  it("repositions cards when the width changes without a remount (I2)", () => {
    // Zero-size cards (map-feel Task 8): keeps `left = anchorX + 6` exact
    // and predictable across the resize, rather than depending on which of
    // `placeSelectedCard`'s candidates a 160x56 default frame would land on
    // at each width — this test is about reactivity to the width prop, not
    // about card placement. a is selected so its one card exists.
    const cardSize = { width: 0, height: 0 };
    const { container, rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardSize={cardSize}
        defaultSelectedId="a"
      />,
    );
    const before = (container.querySelector('[data-card="a"]') as HTMLElement).style.left;
    rerender(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={800}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardSize={cardSize}
        defaultSelectedId="a"
      />,
    );
    const after = (container.querySelector('[data-card="a"]') as HTMLElement).style.left;
    expect(after).not.toBe(before);
    expect(Number.parseFloat(after)).toBeCloseTo(400 + 6, 6);
  });

  it("refits to a different spec without a key= remount (I2)", () => {
    const farAway: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "z", label: "Zed", x: 100_000, y: 100_000, territory: null }],
    };
    // Zero-size cards, same reason as above: `left = anchorX + 6` exactly.
    // The selection is controlled so it can name each spec's one item.
    const cardSize = { width: 0, height: 0 };
    const { container, rerender } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardSize={cardSize}
        selectedId="a"
      />,
    );
    expect(container.querySelector('[data-card="a"]')).not.toBeNull();
    rerender(
      <CorpusMap
        spec={farAway}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardSize={cardSize}
        selectedId="z"
      />,
    );
    const card = container.querySelector('[data-card="z"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(Number.parseFloat(card?.style.left ?? "")).toBeCloseTo(width / 2 + 6, 6);
  });

  it("defaults cardSize to 160x56 and threads a custom cardSize through to the card frame", () => {
    const { container: defaultContainer } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        defaultSelectedId="a"
      />,
    );
    const defaultCard = defaultContainer.querySelector('[data-card="a"]') as HTMLElement;
    expect(defaultCard.style.width).toBe("160px");
    expect(defaultCard.style.height).toBe("56px");

    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={width}
        height={height}
        thresholds={{ midAt: 0, nearAt: 0 }}
        cardSize={{ width: 90, height: 30 }}
        defaultSelectedId="a"
      />,
    );
    const card = container.querySelector('[data-card="a"]') as HTMLElement;
    expect(card.style.width).toBe("90px");
    expect(card.style.height).toBe("30px");
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
        defaultSelectedId="a"
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

  it("scales both canvases' drawing by devicePixelRatio, so a world unit lands on the same CSS pixel", () => {
    const originalRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const transforms = new Map<HTMLCanvasElement, unknown[][]>();
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return {
        ...recordingContext([]),
        setTransform: (...values: unknown[]) => transforms.set(this, [...(transforms.get(this) ?? []), values]),
      };
    } as unknown as typeof originalGetContext;
    try {
      const { container } = render(
        <CorpusMap spec={spec} renderCard={() => null} width={width} height={height} minimap />,
      );
      const canvases = [...container.querySelectorAll("canvas")];
      expect(canvases).toHaveLength(2);
      for (const canvas of canvases) expect(transforms.get(canvas)?.[0]).toEqual([2, 0, 0, 2, 0, 0]);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      if (originalRatio) Object.defineProperty(window, "devicePixelRatio", originalRatio);
      else Reflect.deleteProperty(window, "devicePixelRatio");
    }
  });

  it("keys the scene memo on the primitive values buildingScene reads, not on the tuning/theme object identity", () => {
    const spy = vi.spyOn(sceneModule, "buildingScene");
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
      for (let index = 0; index < 5; index += 1) rerenderAt(2.5);
      expect(spy).toHaveBeenCalledTimes(1);

      rerenderAt(9);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("keys the scene memo on the name style's primitive values: new values rebuild, the same values in a new object do not", () => {
    const spy = vi.spyOn(sceneModule, "buildingScene");
    try {
      const element = (territoryNameStyle: { uppercase?: boolean; spacing?: number }) => (
        <CorpusMap
          spec={spec}
          renderCard={() => null}
          width={width}
          height={height}
          theme={{ ...DEFAULT_THEME, territoryNameStyle }}
        />
      );
      const { rerender } = render(element({ uppercase: true, spacing: 0.6 }));
      for (let index = 0; index < 3; index += 1) rerender(element({ uppercase: true, spacing: 0.6 }));
      expect(spy).toHaveBeenCalledTimes(1);
      rerender(element({ uppercase: false, spacing: 0.6 }));
      expect(spy).toHaveBeenCalledTimes(2);
      rerender(element({ uppercase: false, spacing: 1 }));
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  });

  it("does not rebuild the scene on a resize (activeFromScale is absolute, so fitScale is out of the memo key)", () => {
    const spy = vi.spyOn(sceneModule, "buildingScene");
    try {
      // A tall box (height 2000 fixed) makes width the binding dimension of
      // `fitSpec` throughout 400-700, so `fitScale` genuinely changes on
      // every resize below — a fixture where it happened to stay constant
      // (e.g. a square box) would pass this test whether or not `fitScale`
      // is still part of the scene's memo key, proving nothing.
      const tallHeight = 2000;
      const { rerender } = render(<CorpusMap spec={spec} renderCard={() => null} width={400} height={tallHeight} />);
      expect(spy).toHaveBeenCalledTimes(1);
      for (const boxWidth of [500, 600, 700]) {
        rerender(<CorpusMap spec={spec} renderCard={() => null} width={boxWidth} height={tallHeight} />);
      }
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("map events under StrictMode, remount and a collapsing box", () => {
  it("fires onRegimeChange once on mount under StrictMode, whose effects run twice in dev", () => {
    const onRegimeChange = vi.fn();
    render(
      <StrictMode>
        <CorpusMap spec={spec} renderCard={() => null} width={width} height={height} onRegimeChange={onRegimeChange} />
      </StrictMode>,
    );
    expect(onRegimeChange.mock.calls).toEqual([["far"]]);
  });

  it("fires onViewChange once on mount under StrictMode", () => {
    const onViewChange = vi.fn();
    render(
      <StrictMode>
        <CorpusMap spec={spec} renderCard={() => null} width={width} height={height} onViewChange={onViewChange} />
      </StrictMode>,
    );
    expect(onViewChange).toHaveBeenCalledTimes(1);
  });

  it("fires the initial regime again after a remount by key", () => {
    const onRegimeChange = vi.fn();
    const { rerender } = render(
      <CorpusMap
        key="first"
        spec={spec}
        renderCard={() => null}
        width={width}
        height={height}
        onRegimeChange={onRegimeChange}
      />,
    );
    rerender(
      <CorpusMap
        key="second"
        spec={spec}
        renderCard={() => null}
        width={width}
        height={height}
        onRegimeChange={onRegimeChange}
      />,
    );
    expect(onRegimeChange.mock.calls).toEqual([["far"], ["far"]]);
  });

  it("hands a regime change to the callback passed in the same render, not the previous one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const properties = { spec, renderCard: () => null, width, height };
    const { rerender } = render(
      <CorpusMap {...properties} thresholds={{ midAt: 2, nearAt: 6 }} onRegimeChange={first} />,
    );
    rerender(<CorpusMap {...properties} thresholds={{ midAt: 0.5, nearAt: 6 }} onRegimeChange={second} />);
    expect(first.mock.calls).toEqual([["far"]]);
    expect(second.mock.calls).toEqual([["mid"]]);
  });

  it("does not fire onRegimeChange again when the box collapses and returns with the same regime", () => {
    const onRegimeChange = vi.fn();
    const properties = { spec, renderCard: () => null, onRegimeChange };
    const { rerender } = render(<CorpusMap {...properties} width={width} height={height} />);
    rerender(<CorpusMap {...properties} width={0} height={0} />);
    rerender(<CorpusMap {...properties} width={width} height={height} />);
    expect(onRegimeChange.mock.calls).toEqual([["far"]]);
  });
});

function recordingContext(texts: Array<{ text: string; x: number; y: number }>): CanvasRenderingContext2D {
  const noop = () => {};
  const context = {
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
    arcTo: noop,
    // Every territory is outlined since slice D, and `outline` brackets its
    // stroke in save/restore.
    save: noop,
    restore: noop,
    fillText: (text: string, left: number, top: number) => texts.push({ text, x: left, y: top }),
    // `useMeasure` creates its own offscreen canvas; this override replaces
    // `HTMLCanvasElement.prototype.getContext` globally for the test, so
    // that canvas gets this fake context too and needs a `measureText`.
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillStyle: "",
    strokeStyle: "",
    font: "",
  };
  return context as unknown as CanvasRenderingContext2D;
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
        <CorpusMap spec={small} renderCard={(node) => <div>{node.label}</div>} width={400} height={300} />,
      );
      texts.length = 0;
      rerender(<CorpusMap spec={large} renderCard={(node) => <div>{node.label}</div>} width={400} height={300} />);
      // The anchor is the pole of inaccessibility of the territory's shape
      // (Task 5/6), not its raw centroid, so the expectation is computed the
      // same way CorpusMap does: build the scene against the NEW spec, then
      // project through the NEW spec's fitted viewport, never the stale one
      // from before the swap.
      const largeScene = buildScene(large, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
      const largeVp = fitScene(large, largeScene, 400, 300, 24);
      const label = largeScene.labels.find((placed) => placed.id === "u");
      if (!label) throw new Error("expected a placed label for territory 'u'");
      const [expectedLeft, expectedTop] = toScreen(largeVp, label.anchor[0], label.anchor[1]);
      const largeTexts = texts.filter((drawn) => drawn.text === "Large");
      expect(largeTexts.length).toBeGreaterThan(0);
      for (const drawn of largeTexts) {
        expect(drawn.x).toBeCloseTo(expectedLeft, 6);
        expect(drawn.y).toBeCloseTo(expectedTop, 6);
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});

describe("fit with a first view that is not far", () => {
  it("fits the territory names it paints, not the group names it does not", () => {
    const texts: Array<{ text: string; x: number; y: number }> = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => recordingContext(texts)) as unknown as typeof original;
    try {
      const longGroup = "A group name wide enough to widen";
      const grouped: MapSpec = {
        version: "1",
        territories: [
          { id: "t", name: "West", members: ["a", "b", "c"], centroid: [1, 1], group: longGroup },
          { id: "u", name: "East", members: ["d", "e", "f"], centroid: [21, 1], group: longGroup },
        ],
        nodes: [
          { id: "a", label: "A", x: 0, y: 0, territory: "t" },
          { id: "b", label: "B", x: 2, y: 0, territory: "t" },
          { id: "c", label: "C", x: 1, y: 2, territory: "t" },
          { id: "d", label: "D", x: 20, y: 0, territory: "u" },
          { id: "e", label: "E", x: 22, y: 0, territory: "u" },
          { id: "f", label: "F", x: 21, y: 2, territory: "u" },
        ],
      };
      render(
        <CorpusMap
          spec={grouped}
          renderCard={(node) => <div>{node.label}</div>}
          width={400}
          height={300}
          thresholds={{ midAt: 0.9, nearAt: 6 }}
        />,
      );
      // The same ruler `useMeasure` builds on the recording context's `measureText`.
      const recordingMeasure = (label: string, font: string) => ({
        width: label.length * 6,
        height: estimateText(label, font).height,
      });
      const scene = buildScene(grouped, DEFAULT_TUNING, DEFAULT_THEME, recordingMeasure);
      const territoryFit = fitScene(grouped, scene, 400, 300, 24, { groupNames: false });
      const groupFit = fitScene(grouped, scene, 400, 300, 24);
      // The case only proves something if the two fits differ.
      expect(groupFit.scale).not.toBeCloseTo(territoryFit.scale, 3);
      const label = scene.labels.find((placed) => placed.id === "t");
      if (!label) throw new Error("expected a placed label for territory 't'");
      const [expectedLeft, expectedTop] = toScreen(territoryFit, label.anchor[0], label.anchor[1]);
      const drawn = texts.filter((text) => text.text === "West");
      expect(drawn.length).toBeGreaterThan(0);
      for (const text of drawn) {
        expect(text.x).toBeCloseTo(expectedLeft, 6);
        expect(text.y).toBeCloseTo(expectedTop, 6);
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
