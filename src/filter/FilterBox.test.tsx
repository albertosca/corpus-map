import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
import { FilterBox, type FilterBoxProps } from "./FilterBox";
import type { FilterAttribute } from "./facets";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "sparrow", label: "Sparrow", x: 0, y: 0, territory: null, meta: { kind: "bird" } },
    { id: "dog", label: "Dog", x: 1, y: 0, territory: null, meta: { kind: ["mammal", "pet"] } },
    { id: "cat", label: "Cat", x: 2, y: 0, territory: null, meta: { kind: ["mammal", "pet"] } },
    { id: "eagle", label: "Eagle", x: 3, y: 0, territory: null, meta: { kind: "bird" } },
    { id: "rock", label: "Rock", x: 4, y: 0, territory: null },
  ],
};
const otherSpec: MapSpec = { ...spec, nodes: spec.nodes.slice(0, 2) };
const kinds: FilterAttribute = (current) => (current.meta as { kind?: string | string[] } | undefined)?.kind;

const lastCall = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1]?.[0];
const disclosure = () => screen.getByRole("button", { name: /^Filter/ });
const openPanel = () => fireEvent.click(disclosure());
const box = (name: string) => screen.getByRole("checkbox", { name });

function mount(properties: Partial<FilterBoxProps> = {}) {
  const onMatches = vi.fn();
  const result = render(<FilterBox spec={spec} attribute={kinds} onMatches={onMatches} {...properties} />);
  return { onMatches, ...result };
}

describe("FilterBox (spec filter §3, §5)", () => {
  it("starts closed, says nothing and reports nothing on mount", () => {
    const { onMatches } = mount();
    expect(disclosure().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(onMatches).not.toHaveBeenCalled();
  });

  it("opens a group of labelled checkboxes with their counts, sorted by label", () => {
    mount();
    openPanel();
    expect(disclosure().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "Filter" })).toBeTruthy();
    expect(screen.getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.textContent)).toEqual([
      "bird (2)",
      "mammal (2)",
      "pet (2)",
    ]);
  });

  it("reports the ids having any checked value, and null once all are unchecked", () => {
    const { onMatches } = mount();
    openPanel();
    fireEvent.click(box("bird (2)"));
    expect(lastCall(onMatches)).toEqual(["sparrow", "eagle"]);
    fireEvent.click(box("pet (2)"));
    expect(lastCall(onMatches)).toEqual(["sparrow", "dog", "cat", "eagle"]);
    fireEvent.click(box("bird (2)"));
    fireEvent.click(box("pet (2)"));
    expect(lastCall(onMatches)).toBeNull();
  });

  it("shows how many values are selected on the button, whose name is its visible text", () => {
    mount({ label: "Category" });
    const button = () => screen.getByRole("button", { name: /^Category/ });
    expect(button().textContent).toBe("Category");
    fireEvent.click(button());
    fireEvent.click(box("bird (2)"));
    fireEvent.click(box("pet (2)"));
    expect(button().textContent).toBe("Category (2)");
    expect(screen.getByRole("group", { name: "Category" })).toBeTruthy();
  });

  it("announces N of M items, and speaks a repeat again by alternating a trailing no-break space", () => {
    mount();
    openPanel();
    fireEvent.click(box("mammal (2)"));
    expect(screen.getByRole("status").textContent).toBe("2 of 5 items");
    fireEvent.click(box("pet (2)"));
    expect(screen.getByRole("status").textContent).toBe("2 of 5 items ");
    fireEvent.click(box("mammal (2)"));
    fireEvent.click(box("pet (2)"));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("offers Clear filter only while something is selected, and puts focus back on the button", () => {
    const { onMatches } = mount();
    openPanel();
    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
    fireEvent.click(box("bird (2)"));
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(lastCall(onMatches)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();
    expect(document.activeElement).toBe(disclosure());
  });

  it("closes on Escape and returns focus to the button", () => {
    mount();
    openPanel();
    box("bird (2)").focus();
    fireEvent.keyDown(box("bird (2)"), { key: "Escape" });
    expect(disclosure().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(document.activeElement).toBe(disclosure());
  });

  it("keeps the selection while closed", () => {
    mount();
    openPanel();
    fireEvent.click(box("bird (2)"));
    fireEvent.click(disclosure());
    expect(disclosure().textContent).toBe("Filter (1)");
    fireEvent.click(disclosure());
    expect((box("bird (2)") as HTMLInputElement).checked).toBe(true);
  });

  it("clears and reports null when the spec changes with something selected", () => {
    const { onMatches, rerender } = mount();
    openPanel();
    fireEvent.click(box("bird (2)"));
    rerender(<FilterBox spec={otherSpec} attribute={kinds} onMatches={onMatches} />);
    expect(lastCall(onMatches)).toBeNull();
    expect(disclosure().textContent).toBe("Filter");
    expect(disclosure().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says nothing when the spec changes with nothing selected", () => {
    const { onMatches, rerender } = mount();
    rerender(<FilterBox spec={otherSpec} attribute={kinds} onMatches={onMatches} />);
    expect(onMatches).not.toHaveBeenCalled();
  });

  it("does not report again when only the attribute function changes identity", () => {
    const onMatches = vi.fn();
    const { rerender } = render(
      <FilterBox spec={spec} attribute={(current) => kinds(current)} onMatches={onMatches} />,
    );
    openPanel();
    fireEvent.click(box("bird (2)"));
    const calls = onMatches.mock.calls.length;
    rerender(<FilterBox spec={spec} attribute={(current) => kinds(current)} onMatches={onMatches} />);
    expect(onMatches.mock.calls.length).toBe(calls);
  });

  it("disables itself, described, when no item has the attribute", () => {
    mount({ spec: { ...spec, nodes: [spec.nodes[4] as MapSpec["nodes"][number]] } });
    const button = disclosure() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const description = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("No values to filter by");
  });

  it("gives every control a 44 px target with touchTargets", () => {
    mount({ touchTargets: true });
    expect(disclosure().style.minHeight).toBe("44px");
    openPanel();
    expect(box("bird (2)").closest("label")?.style.minHeight).toBe("44px");
    fireEvent.click(box("bird (2)"));
    expect(screen.getByRole("button", { name: "Clear filter" }).style.minHeight).toBe("44px");
  });

  it("keeps every button inside its container (the floating-box sweep reads maxWidth)", () => {
    mount();
    openPanel();
    fireEvent.click(box("bird (2)"));
    for (const button of screen.getAllByRole("button")) expect(button.style.maxWidth).toBe("100%");
  });

  describe("keeping the panel inside the window", () => {
    const stubBox = (left: number, right: number) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const shifted = Number.parseFloat(this.style.left || "0");
        return this.tagName === "FIELDSET"
          ? ({
              left: left + shifted,
              right: right + shifted,
              top: 0,
              bottom: 0,
              width: right - left,
              height: 0,
            } as DOMRect)
          : ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect);
      });

    it("shifts a panel that would run past the right edge back inside, with a margin", () => {
      const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
      const rect = stubBox(900, 1300);
      mount();
      openPanel();
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("-312px");
      rect.mockRestore();
      clientWidth.mockRestore();
    });

    it("shifts a panel that sits too far left back to the margin (the left-edge branch)", () => {
      const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
      const rect = stubBox(-50, 350);
      mount();
      openPanel();
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("62px");
      rect.mockRestore();
      clientWidth.mockRestore();
    });

    it("moves the panel again when the window changes while it was hidden, on the next render (whole-branch review, minor 3)", () => {
      const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
      const rect = stubBox(900, 1300);
      const { onMatches, rerender } = mount();
      openPanel();
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("-312px");
      // A resize while the Menu was closed reached no listener (the panel had no box); showing the Menu renders the box again.
      clientWidth.mockReturnValue(800);
      rerender(<FilterBox spec={spec} attribute={kinds} onMatches={onMatches} />);
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("-512px");
      rect.mockRestore();
      clientWidth.mockRestore();
    });

    it("re-places the open panel when the window is resized", () => {
      const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
      const rect = stubBox(900, 1300);
      mount();
      openPanel();
      clientWidth.mockReturnValue(800);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("-512px");
      rect.mockRestore();
      clientWidth.mockRestore();
    });

    it("lets a long label wrap instead of widening the panel past the window", () => {
      mount();
      openPanel();
      const panelStyle = screen.getByRole("group", { name: "Filter" }).style;
      expect([
        panelStyle.getPropertyValue("min-width"),
        panelStyle.width,
        panelStyle.getPropertyValue("max-width"),
      ]).toEqual(["", "max-content", "calc(100vw - 24px)"]);
    });

    it("gives every checkbox a 24 px target even without touchTargets (WCAG 2.2 target size)", () => {
      mount();
      openPanel();
      for (const checkbox of screen.getAllByRole("checkbox")) {
        expect([checkbox.style.width, checkbox.style.height]).toEqual(["24px", "24px"]);
      }
    });

    it("leaves a panel that already fits where it is", () => {
      const clientWidth = vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
      const rect = stubBox(100, 500);
      mount();
      openPanel();
      expect(screen.getByRole("group", { name: "Filter" }).style.left).toBe("0px");
      rect.mockRestore();
      clientWidth.mockRestore();
    });
  });
});
