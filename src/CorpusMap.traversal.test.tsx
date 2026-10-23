import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

const territory = (id: string, name: string, offset: number) => ({
  id,
  name,
  centroid: [offset + 1, 1] as [number, number],
  members: [`${id}-a`, `${id}-b`],
  boundary: [
    [offset, 0],
    [offset + 2, 0],
    [offset + 2, 2],
    [offset, 2],
  ] as Array<[number, number]>,
});

const spec: MapSpec = {
  version: "1",
  territories: [territory("ta", "Alpha land", 0), territory("tb", "Beta land", 20)],
  nodes: [
    { id: "ta-a", label: "Alpha one", x: 0.5, y: 1, territory: "ta" },
    { id: "ta-b", label: "Alpha two", x: 1.5, y: 1, territory: "ta" },
    { id: "tb-a", label: "Beta one", x: 20.5, y: 1, territory: "tb" },
    { id: "tb-b", label: "Beta two", x: 21.5, y: 1, territory: "tb" },
    { id: "loose", label: "Loose one", x: 10, y: 30, territory: null },
  ],
};

describe("keyboard-only traversal (spec slice B §9)", () => {
  it("opens a territory, selects an item, goes back, opens another, then Unassigned, never dropping focus", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const regimes: string[] = [];
    render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => <div>{node.label}</div>}
        width={400}
        height={300}
        onSelect={onSelect}
        onRegimeChange={(regime) => regimes.push(regime)}
      />,
    );
    const neverBody = () => expect(document.activeElement).not.toBe(document.body);

    await user.tab(); // the surface
    await user.tab(); // first tree control
    expect(document.activeElement?.textContent).toBe("Alpha land, 2 items");
    await user.keyboard("{Enter}");
    neverBody();
    expect(document.activeElement?.textContent).toBe("Back to overview");

    await user.tab();
    expect(document.activeElement?.textContent).toBe("Alpha one");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "ta-a" }));

    await user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("Back to overview");
    await user.keyboard("{Enter}");
    neverBody();
    expect(document.activeElement?.textContent).toBe("Alpha land, 2 items");

    await user.tab();
    expect(document.activeElement?.textContent).toBe("Beta land, 2 items");
    await user.keyboard("{Enter}");
    neverBody();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Beta one");

    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    neverBody();
    expect(document.activeElement?.textContent).toBe("Beta land, 2 items");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Unassigned, 1 item");
    await user.keyboard("{Enter}");
    neverBody();
    expect(document.activeElement?.textContent).toBe("Back to overview");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Loose one");
    expect(regimes[regimes.length - 1]).toBe("near");
  });

  it("returns focus to Unassigned, not to the territory opened before it, after Back to overview", async () => {
    const user = userEvent.setup();
    render(<CorpusMap spec={spec} renderCard={() => null} width={400} height={300} />);
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Alpha land, 2 items");
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}"); // Back to overview
    expect(document.activeElement?.textContent).toBe("Alpha land, 2 items");
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Unassigned, 1 item");
    await user.keyboard("{Enter}");
    expect(document.activeElement?.textContent).toBe("Back to overview");
    await user.keyboard("{Enter}");
    expect(document.activeElement?.textContent).toBe("Unassigned, 1 item");
  });

  it("lands Unassigned on a loose item when the loose items are too far apart for one near view", () => {
    const spread: MapSpec = {
      ...spec,
      nodes: [
        ...spec.nodes.filter((node) => node.territory !== null),
        { id: "west", label: "Far west", x: -200, y: 200, territory: null },
        { id: "east", label: "Far east", x: 220, y: 200, territory: null },
      ],
    };
    const views: Array<{ regime: string; visibleCount: number }> = [];
    render(
      <CorpusMap
        spec={spread}
        renderCard={() => null}
        width={400}
        height={300}
        onViewChange={(view) => views.push(view)}
      />,
    );
    act(() => screen.getByRole("button", { name: "Unassigned, 2 items" }).click());
    const last = views[views.length - 1];
    expect(last?.regime).toBe("near");
    expect(last?.visibleCount).toBeGreaterThan(0);
  });

  it("sends focus to the surface when every territory is dimmed under a focused button", () => {
    const territoriesOnly: MapSpec = { ...spec, nodes: spec.nodes.filter((node) => node.territory !== null) };
    const properties = { spec: territoriesOnly, renderCard: () => null, width: 400, height: 300 };
    const { container, rerender } = render(<CorpusMap {...properties} hiddenTerritories={[]} />);
    act(() => screen.getByRole("button", { name: "Alpha land, 2 items" }).focus());
    rerender(<CorpusMap {...properties} hiddenTerritories={["ta", "tb"]} />);
    expect(document.activeElement).toBe(container.querySelector("[data-map-surface]"));
  });

  it("renders tree headings at headingLevel and rejects an invalid one", () => {
    const many: MapSpec = {
      version: "1",
      territories: Array.from({ length: 10 }, (_, index) => ({
        ...territory(`t${index}`, `Land ${index}`, index * 5),
        members: [`t${index}-a`],
      })),
      nodes: Array.from({ length: 10 }, (_, index) => ({
        id: `t${index}-a`,
        label: `Item ${index}`,
        x: index * 5 + 1,
        y: 1,
        territory: `t${index}`,
      })),
    };
    render(<CorpusMap spec={many} renderCard={() => null} width={400} height={300} headingLevel={5} />);
    expect(screen.getAllByRole("heading", { level: 5 }).length).toBeGreaterThan(0);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<CorpusMap spec={many} renderCard={() => null} width={400} height={300} headingLevel={7 as 2} />),
    ).toThrow(RangeError);
    consoleError.mockRestore();
  });
});
