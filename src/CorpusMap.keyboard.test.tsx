import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

const lineSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: Array.from({ length: 11 }, (_, index) => ({
    id: `n${index}`,
    label: `Item ${index}`,
    x: index * 10,
    y: 0,
    territory: null,
  })),
};

function renderMap(properties: Partial<Parameters<typeof CorpusMap>[0]> = {}) {
  return render(
    <CorpusMap
      spec={lineSpec}
      renderCard={(node) => <div>{node.label}</div>}
      width={400}
      height={300}
      {...properties}
    />,
  );
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

describe("CorpusMap surface focus (spec slice B §4)", () => {
  it("is a focusable map region named after the corpus size", () => {
    const { container } = renderMap();
    const root = surface(container);
    expect(root.tabIndex).toBe(0);
    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-roledescription")).toBe("map");
    expect(screen.getByRole("region", { name: "Map of 11 items" })).toBe(root);
  });

  it("says item, singular, for a corpus of one", () => {
    renderMap({ spec: { ...lineSpec, nodes: lineSpec.nodes.slice(0, 1) } });
    expect(screen.getByRole("region", { name: "Map of 1 item" })).toBeDefined();
  });

  it("takes its name from the label prop", () => {
    renderMap({ label: "Papers on computer science" });
    expect(screen.getByRole("region", { name: "Papers on computer science" })).toBeDefined();
  });

  it("is the first tab stop", async () => {
    const { container } = renderMap();
    await userEvent.tab();
    expect(document.activeElement).toBe(surface(container));
  });

  it("focuses the surface through the handle", () => {
    const handle = createRef<CorpusMapHandle>();
    const { container } = renderMap({ ref: handle });
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(surface(container));
  });

  it("shows its focus ring on keyboard focus, not on a press", async () => {
    const { container } = renderMap();
    const root = surface(container);
    fireEvent.pointerDown(root, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    act(() => root.focus());
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
    act(() => root.blur());
    await userEvent.tab();
    expect(root.hasAttribute("data-focus-visible")).toBe(true);
    expect(root.style.outline).toContain("3px solid");
  });
});
