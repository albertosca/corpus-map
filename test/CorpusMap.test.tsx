import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "../src/react/CorpusMap";
import type { MapSpec } from "../src/spec";

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

  it("pans and zooms the canvas to a territory when it is focused in the tree (Ruling B)", async () => {
    const user = userEvent.setup();
    // fitSpec puts the initial scale around 0.25 for this bounding box at
    // this viewport size, so these thresholds start the map in "mid" (tree
    // shows territories, not items) and land exactly in "near" once the
    // focus handler sets the scale to `nearAt`.
    const thresholds = { midAt: 0.1, nearAt: 1 };

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
  });

  it("focusing a territory lands in the near regime for awkward corpus extents (C3 sweep)", async () => {
    const user = userEvent.setup();
    // Extents chosen so the fitted scale is an awkward double. Multiplying
    // such a scale by `nearAt / scale` lands a float ulp below `nearAt` for
    // roughly one extent in sixteen; building the viewport from `nearAt`
    // directly cannot. Both `nearAt` values are swept; extents whose fitted
    // scale is already at or past `nearAt` start in "near" and are skipped.
    const ks = [
      1, 7, 20, 50, 86, 95, 113, 130, 162, 168, 175, 195, 200, 208, 238, 260, 300, 323, 331, 348, 362, 377, 389, 398,
    ];
    const failures: string[] = [];
    let swept = 0;
    for (const nearAt of [100, 12.5]) {
      for (const k of ks) {
        const ex = k * 1.37 + 0.11;
        const ey = ex * 0.73;
        const fitted = Math.min((width - 48) / ex, (height - 48) / ey);
        if (fitted >= nearAt) continue;
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
        if (document.querySelector('[data-card="b"]') === null) failures.push(`nearAt=${nearAt} k=${k} fit=${fitted}`);
        unmount();
      }
    }
    expect(swept).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
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
});
