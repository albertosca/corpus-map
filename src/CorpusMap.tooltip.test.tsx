import { act, fireEvent, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapProps } from "./CorpusMap";
import { contrastRatio, over, parseColor, type Rgba } from "./labels/contrast";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import { type MapSpec, validateSpec } from "./shared/spec";
import { DARK_THEME, DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { GROUP_LINE_OPACITY } from "./territories/tooltipPosition";
import { fitScene } from "./viewport/fitScene";
import { toScreen } from "./viewport/viewport";

const square = (left: number, top: number, size: number): Array<[number, number]> => [
  [left, top],
  [left + size, top],
  [left + size, top + size],
  [left, top + size],
];

const spec = validateSpec({
  version: "1",
  territories: [
    {
      id: "north",
      name: "North",
      members: ["north0", "north1", "north2"],
      centroid: [5, 5],
      boundary: square(0, 0, 10),
    },
    { id: "south", name: "South", members: ["south0"], centroid: [25, 5], boundary: square(20, 0, 10) },
  ],
  nodes: [
    { id: "north0", label: "north0", x: 2, y: 2, territory: "north" },
    { id: "north1", label: "north1", x: 8, y: 2, territory: "north" },
    { id: "north2", label: "north2", x: 8, y: 8, territory: "north" },
    { id: "south0", label: "south0", x: 28, y: 8, territory: "south" },
  ],
});

/** Where a world point lands on the 400x300 map at the fit. */
function screenAt(mapSpec: MapSpec, world: [number, number]): { clientX: number; clientY: number } {
  const scene = buildScene(mapSpec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const [horizontal, vertical] = toScreen(fitScene(mapSpec, scene, 400, 300, 24), world[0], world[1]);
  return { clientX: horizontal, clientY: vertical };
}

let callbacks: FrameRequestCallback[] = [];
let raf: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  callbacks = [];
  raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
});
afterEach(() => raf.mockRestore());

function flush() {
  act(() => {
    for (const callback of callbacks.splice(0)) callback(0);
  });
}

function mount(extra: Partial<CorpusMapProps> = {}, mapSpec: MapSpec = spec) {
  const view = render(<CorpusMap spec={mapSpec} width={400} height={300} renderCard={() => null} {...extra} />);
  const surface = view.container.querySelector("[data-map-surface]") as HTMLElement;
  return { ...view, surface };
}

function hoverAt(surface: HTMLElement, point: { clientX: number; clientY: number }) {
  fireEvent.pointerMove(surface, { ...point, pointerId: 1, pointerType: "mouse" });
  flush();
}

// Inside North, 3 world units from every North point and far from South.
const insideNorth = (): { clientX: number; clientY: number } => screenAt(spec, [5, 5]);

describe("territory tooltip", () => {
  it("names the territory under the cursor in the far regime, with its paper count", () => {
    const { container, surface } = mount();
    hoverAt(surface, insideNorth());
    const tooltip = container.querySelector("[data-hover-territories]");
    expect(tooltip?.getAttribute("data-hover-territories")).toBe("north");
    expect(tooltip?.textContent).toContain("North");
    expect(tooltip?.textContent).toContain("3 papers");
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows nothing over empty sea between territories", () => {
    const { container, surface } = mount();
    hoverAt(surface, screenAt(spec, [15, 5]));
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("lists every territory under the cursor when they overlap, most members first", () => {
    const overlapping = validateSpec({
      version: "1",
      territories: [
        { id: "inner", name: "Inner", members: ["i0"], centroid: [5, 5], boundary: square(4, 4, 2) },
        { id: "wide", name: "Wide", members: ["w0", "w1"], centroid: [5, 5], boundary: square(0, 0, 10) },
      ],
      nodes: [
        { id: "i0", label: "i0", x: 5.5, y: 4.5, territory: "inner" },
        { id: "w0", label: "w0", x: 1, y: 1, territory: "wide" },
        { id: "w1", label: "w1", x: 9, y: 9, territory: "wide" },
      ],
    });
    const { container, surface } = mount({}, overlapping);
    hoverAt(surface, screenAt(overlapping, [5, 5]));
    const tooltip = container.querySelector("[data-hover-territories]");
    expect(tooltip?.getAttribute("data-hover-territories")).toBe("wide inner");
    expect(tooltip?.textContent).not.toContain("papers");
  });

  it("does not name a dimmed territory", () => {
    const { container, surface } = mount({ hiddenTerritories: ["north"] });
    hoverAt(surface, insideNorth());
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("a point wins over its territory in mid and shows the territory's name beside the label", () => {
    const { container, surface } = mount({ thresholds: { midAt: 0, nearAt: 64 } });
    const point = screenAt(spec, [2, 2]);
    hoverAt(surface, { clientX: point.clientX + 4, clientY: point.clientY });
    const hover = container.querySelector('[data-hover="north0"]');
    expect(hover?.textContent).toContain("north0");
    expect(hover?.textContent).toContain("North");
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("names the territory in mid when no point is within the hover radius", () => {
    const { container, surface } = mount({ thresholds: { midAt: 0, nearAt: 64 } });
    hoverAt(surface, insideNorth());
    expect(container.querySelector("[data-hover-territories]")?.getAttribute("data-hover-territories")).toBe("north");
  });

  it("is suppressed over a card", () => {
    const { container, surface } = mount({
      thresholds: { midAt: 0, nearAt: 0 },
      renderCard: (node) => <div>{node.label}</div>,
    });
    const point = insideNorth();
    const cards = [...container.querySelectorAll<HTMLElement>("[data-card]")];
    expect(cards.length).toBeGreaterThan(0);
    const rects = vi.spyOn(cards[0] as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: point.clientX - 10,
      right: point.clientX + 10,
      top: point.clientY - 10,
      bottom: point.clientY + 10,
      width: 20,
      height: 20,
      x: point.clientX - 10,
      y: point.clientY - 10,
      toJSON: () => ({}),
    });
    try {
      hoverAt(surface, point);
      expect(container.querySelector("[data-hover-territories]")).toBeNull();
    } finally {
      rects.mockRestore();
    }
  });

  it("touch tap on a bare fill opens it and survives the pointerleave that follows", () => {
    const { container, surface } = mount();
    const point = insideNorth();
    const touch = { ...point, pointerId: 7, pointerType: "touch", button: 0, isPrimary: true };
    fireEvent.pointerDown(surface, touch);
    fireEvent.pointerUp(surface, touch);
    fireEvent.pointerLeave(surface, touch);
    flush();
    expect(container.querySelector("[data-hover-territories]")?.getAttribute("data-hover-territories")).toBe("north");
  });

  it("a later press closes it", () => {
    const { container, surface } = mount();
    const point = insideNorth();
    const touch = { ...point, pointerId: 7, pointerType: "touch", button: 0, isPrimary: true };
    fireEvent.pointerDown(surface, touch);
    fireEvent.pointerUp(surface, touch);
    flush();
    expect(container.querySelector("[data-hover-territories]")).not.toBeNull();
    fireEvent.pointerDown(surface, {
      ...screenAt(spec, [15, 5]),
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      isPrimary: true,
    });
    flush();
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("a mouse leaving the map closes it", () => {
    const { container, surface } = mount();
    hoverAt(surface, insideNorth());
    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    expect(container.querySelector("[data-hover-territories]")).toBeNull();
  });

  it("a steady cursor over the same territories costs no extra commit, but still moves the balloon", () => {
    let commits = 0;
    const onRender: ProfilerOnRenderCallback = () => {
      commits += 1;
    };
    const tree = (): ReactElement => (
      <Profiler id="tooltip-commits" onRender={onRender}>
        <CorpusMap spec={spec} width={400} height={300} renderCard={() => null} />
      </Profiler>
    );
    const { container } = render(tree());
    const surface = container.querySelector("[data-map-surface]") as HTMLElement;
    const point = insideNorth();
    hoverAt(surface, point);
    const tooltip = container.querySelector("[data-hover-territories]") as HTMLElement;
    const before = tooltip.style.left;
    commits = 0;
    hoverAt(surface, { clientX: point.clientX + 3, clientY: point.clientY });
    hoverAt(surface, { clientX: point.clientX + 6, clientY: point.clientY + 1 });
    expect(commits).toBe(0);
    expect(tooltip.style.left).not.toBe(before);
  });
});

describe("territory tooltip contrast", () => {
  it("the faded group line keeps 4.5:1 against the balloon in both themes", () => {
    // The balloon is translucent, so test it over both extremes of what the map can show beneath it.
    const backdrops: Rgba[] = [
      [255, 255, 255, 1],
      [0, 0, 0, 1],
    ];
    for (const theme of [DEFAULT_THEME, DARK_THEME]) {
      for (const backdrop of backdrops) {
        const balloon = over(parseColor(theme.hoverBackground), backdrop);
        const text = parseColor(theme.hoverText);
        const faded: Rgba = [text[0], text[1], text[2], text[3] * GROUP_LINE_OPACITY];
        expect(contrastRatio(over(faded, balloon), balloon)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
