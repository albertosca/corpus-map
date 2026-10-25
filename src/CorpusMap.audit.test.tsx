import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { auditAccessibility, violationIds } from "../test/audit";
import { CorpusMap } from "./CorpusMap";
import { estimateText } from "./labels/placement";
import { buildScene } from "./shared/scene";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";
import { fitScene } from "./viewport/fitScene";
import { toScreen } from "./viewport/viewport";

const grid: MapSpec = {
  version: "1",
  territories: Array.from({ length: 10 }, (_, index) => ({
    id: `t${index}`,
    name: `Land ${index}`,
    centroid: [index * 5 + 1, 1] as [number, number],
    members: [`t${index}-a`],
    boundary: [
      [index * 5, 0],
      [index * 5 + 2, 0],
      [index * 5 + 2, 2],
      [index * 5, 2],
    ] as Array<[number, number]>,
  })),
  nodes: [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}-a`,
      label: `Item ${index}`,
      x: index * 5 + 1,
      y: 1,
      territory: `t${index}`,
    })),
    { id: "loose", label: "Loose", x: 25, y: 10, territory: null },
  ],
};

function renderMap(extra: Record<string, unknown> = {}) {
  return render(
    <CorpusMap spec={grid} renderCard={(node) => <div>{node.label}</div>} width={600} height={400} legend {...extra} />,
  );
}

async function expectClean(container: Element) {
  expect(violationIds(await auditAccessibility(container))).toEqual([]);
}

describe("accessibility audit (spec slice B §7)", () => {
  it("is clean at far, with groups, Unassigned and the legend", async () => {
    const { container } = renderMap();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    await expectClean(container);
  });

  it("is clean at mid and at near", async () => {
    const regimes: string[] = [];
    const { container } = renderMap({ onRegimeChange: (regime: string) => regimes.push(regime) });
    const root = container.querySelector("[data-map-surface]") as HTMLElement;
    for (let step = 0; step < 4; step += 1) fireEvent.keyDown(root, { key: "+" });
    expect(regimes[regimes.length - 1]).toBe("mid");
    await expectClean(container);
    act(() => screen.getByRole("button", { name: "Unassigned, 1 item" }).click());
    expect(regimes[regimes.length - 1]).toBe("near");
    await expectClean(container);
  });

  it("is clean with the legend filtered and a territory dimmed", async () => {
    const { container } = renderMap({ defaultHiddenTerritories: ["t1"] });
    fireEvent.change(screen.getByLabelText("Filter categories"), { target: { value: "Land 2" } });
    await expectClean(container);
  });

  it("is clean with the territory balloon open", async () => {
    // The hover resolves on the next animation frame: queue frames, flush them inside act().
    const frames: FrameRequestCallback[] = [];
    const animationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const { container } = renderMap();
    const root = container.querySelector("[data-map-surface]") as HTMLElement;
    const scene = buildScene(grid, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const [horizontal, vertical] = toScreen(fitScene(grid, scene, 600, 400, 24), 26, 1);
    const tap = {
      clientX: horizontal,
      clientY: vertical,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      pointerType: "touch",
    };
    fireEvent.pointerDown(root, tap);
    fireEvent.pointerUp(root, tap);
    act(() => {
      for (const callback of frames.splice(0)) callback(0);
    });
    animationFrame.mockRestore();
    // At fit the grid's derived families are what is painted, so the balloon names them (spec slice E §4).
    expect(container.querySelector("[data-hover-territories]")?.getAttribute("data-hover-territories")).toMatch(
      /^group:/,
    );
    await expectClean(container);
  });

  it("is clean at mid with a selected item's related list and edge markers", async () => {
    const linked: MapSpec = {
      ...grid,
      edges: [
        { source: "t0-a", target: "t9-a", weight: 2, reason: "far apart" },
        { source: "t0-a", target: "t1-a", weight: 1 },
      ],
    };
    const { container } = render(
      <CorpusMap
        spec={linked}
        renderCard={(node) => <div>{node.label}</div>}
        width={600}
        height={400}
        legend
        defaultViewport={{ centre: [1, 1], zoom: 6 }}
        defaultSelectedId="t0-a"
      />,
    );
    expect(screen.getByRole("list", { name: "Related to Item 0" })).toBeDefined();
    expect(container.querySelectorAll("[data-edge-marker]").length).toBeGreaterThan(0);
    await expectClean(container);
  });
});
