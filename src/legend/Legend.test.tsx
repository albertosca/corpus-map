import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { contrastRatio, over, parseColor, type Rgba } from "../labels/contrast";
import { DARK_THEME, DEFAULT_THEME } from "../shared/theme";
import { Legend, type LegendProps, OFF_SCREEN_OPACITY } from "./Legend";

const entries = [
  { id: "north", name: "North", colour: "#003c96", members: 3 },
  { id: "south", name: "South", colour: "#960000", members: 2 },
  { id: "east", name: "East", colour: "#008000", members: 1 },
];
const groups = [
  { id: "group:north", name: "Upper", members: ["north", "east"] },
  { id: "group:south", name: "Lower", members: ["south"] },
];

function props(overrides: Partial<LegendProps> = {}): LegendProps {
  return {
    entries,
    groups: [],
    onScreen: new Set(["north", "south", "east"]),
    hidden: new Set(),
    presentation: "guided",
    corner: "top-left",
    maximumHeight: "calc(100% - 24px)",
    theme: DEFAULT_THEME,
    narrow: false,
    onEntry: () => {},
    onHiddenChange: () => {},
    ...overrides,
  };
}

describe("Legend", () => {
  it("is a region named Map legend, expanded in guided, with one button per territory", () => {
    render(<Legend {...props()} />);
    expect(screen.getByRole("region", { name: "Map legend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "North" })).toBeTruthy();
    expect(screen.getByText("Visited")).toBeTruthy();
    expect(screen.getByText("Not visited")).toBeTruthy();
    expect(screen.getByText("Pinch or scroll to zoom, drag to pan")).toBeTruthy();
  });

  it("starts collapsed in dense, opens on the toggle, and follows the next presentation change", () => {
    const { rerender } = render(<Legend {...props({ presentation: "dense" })} />);
    const toggle = screen.getByRole("button", { name: "Legend" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "North" })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "North" })).toBeTruthy();
    rerender(<Legend {...props({ presentation: "guided" })} />);
    rerender(<Legend {...props({ presentation: "dense" })} />);
    expect(screen.queryByRole("button", { name: "North" })).toBeNull();
  });

  it.each([
    ["top-left", { top: 40, right: 0, bottom: 0, left: 340 }, { top: "52px", left: "352px" }],
    ["top-right", { top: 0, right: 200, bottom: 0, left: 340 }, { top: "12px", right: "212px" }],
    ["bottom-left", { top: 40, right: 0, bottom: 90, left: 0 }, { bottom: "102px", left: "12px" }],
  ] as const)("sits clear of an overlay's insets at %s", (corner, insets, expected) => {
    render(<Legend {...props({ corner, insets })} />);
    const style = screen.getByRole("region", { name: "Map legend" }).style;
    for (const [side, value] of Object.entries(expected)) expect(style.getPropertyValue(side)).toBe(value);
  });

  it("keeps its corner margin when no inset is given", () => {
    render(<Legend {...props()} />);
    const style = screen.getByRole("region", { name: "Map legend" }).style;
    expect([style.top, style.left]).toEqual(["12px", "12px"]);
  });

  it("reports the pressed territory", () => {
    const onEntry = vi.fn();
    render(<Legend {...props({ onEntry })} />);
    fireEvent.click(screen.getByRole("button", { name: "South" }));
    expect(onEntry).toHaveBeenCalledWith("south");
  });

  it("keeps pointer presses from reaching the map underneath", () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <Legend {...props()} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "North" }));
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("gives every entry a touch target at least 24 px tall", () => {
    render(<Legend {...props()} />);
    expect(screen.getByRole("button", { name: "North" }).style.minHeight).toBe("24px");
  });

  it("gives every checkbox a 24 px hit area through its label, not just the native 13 px box", () => {
    render(<Legend {...props()} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const label = box.closest("label");
      expect(label?.style.minWidth).toBe("24px");
      expect(label?.style.minHeight).toBe("24px");
    }
  });

  it("names every form field, so Chrome does not flag it for autofill (a name, never an id: two maps may share a page)", () => {
    const { container } = render(<Legend {...props({ groups })} />);
    const fields = [...container.querySelectorAll("input")];
    expect(fields.length).toBeGreaterThan(3);
    for (const field of fields) {
      expect(field.name).not.toBe("");
      expect(field.id).toBe("");
    }
  });
});

describe("full legend", () => {
  it("is memoised", () => {
    expect((Legend as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("starts collapsed in a narrow box, even in guided", () => {
    render(<Legend {...props({ narrow: true })} />);
    expect(screen.getByRole("button", { name: "Legend" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("ticks a category off and on, reporting the sorted list", () => {
    const onHiddenChange = vi.fn();
    const { rerender } = render(<Legend {...props({ onHiddenChange })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show South" }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(["south"]);
    rerender(<Legend {...props({ onHiddenChange, hidden: new Set(["south", "east"]) })} />);
    expect((screen.getByRole("checkbox", { name: "Show South" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show South" }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(["east"]);
  });

  it("offers Show all only while something is hidden, and it clears the list", () => {
    const onHiddenChange = vi.fn();
    const { rerender } = render(<Legend {...props({ onHiddenChange })} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    rerender(<Legend {...props({ onHiddenChange, hidden: new Set(["south", "east"]) })} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all (2 hidden)" }));
    expect(onHiddenChange).toHaveBeenLastCalledWith([]);
  });

  it("gives a one-member group a single Show checkbox, on its header, not a second one on the row", () => {
    const onHiddenChange = vi.fn();
    const single = [
      groups[0] as LegendProps["groups"][number],
      { id: "group:South", name: "South", members: ["south"] },
    ];
    render(<Legend {...props({ groups: single, onHiddenChange })} />);
    const boxes = screen.getAllByRole("checkbox", { name: "Show South" });
    expect(boxes).toHaveLength(1);
    fireEvent.click(boxes[0] as HTMLElement);
    expect(onHiddenChange).toHaveBeenLastCalledWith(["south"]);
  });

  it("group checkbox: mixed is indeterminate; pressing shows all; pressing when all shown hides all", () => {
    const onHiddenChange = vi.fn();
    const { rerender } = render(<Legend {...props({ groups, onHiddenChange, hidden: new Set(["east"]) })} />);
    const upper = screen.getByRole("checkbox", { name: "Show Upper" }) as HTMLInputElement;
    expect(upper.indeterminate).toBe(true);
    fireEvent.click(upper);
    expect(onHiddenChange).toHaveBeenLastCalledWith([]);
    rerender(<Legend {...props({ groups, onHiddenChange, hidden: new Set() })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Upper" }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(["east", "north"]);
  });

  it("collapses a group with nothing on screen and keeps the reader's choice until the filter changes", () => {
    render(<Legend {...props({ groups, onScreen: new Set(["north"]) })} />);
    const lower = screen.getByRole("button", { name: /Lower/ });
    expect(lower.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(lower);
    expect(lower.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter categories" }), { target: { value: "x" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter categories" }), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Lower/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows N on screen per group and the paper count per row", () => {
    render(<Legend {...props({ groups, onScreen: new Set(["north"]) })} />);
    expect(screen.getByRole("button", { name: /Upper/ }).textContent).toContain("1 on screen");
  });

  it("says No category matches when the filter keeps nothing", () => {
    render(<Legend {...props()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter categories" }), { target: { value: "zzz" } });
    expect(screen.getByText("No category matches")).toBeTruthy();
  });

  it("an off-screen row keeps 4.5:1 text contrast in both themes", () => {
    for (const theme of [DEFAULT_THEME, DARK_THEME]) {
      const background = parseColor(theme.cardBackground);
      const text = parseColor(theme.territoryLabel);
      const faded: Rgba = [text[0], text[1], text[2], text[3] * OFF_SCREEN_OPACITY];
      expect(contrastRatio(over(faded, background), background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("legend headings", () => {
  it("wraps each group's disclosure in a heading at the given level, checkbox outside it", () => {
    render(<Legend {...props({ groups, heading: "h4" })} />);
    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.length).toBe(2);
    for (const heading of headings) {
      expect(heading.querySelector("button[aria-expanded]")).not.toBeNull();
      expect(heading.querySelector("input[type=checkbox]")).toBeNull();
    }
  });

  it("defaults the group headings to h3", () => {
    render(<Legend {...props({ groups })} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("renders no headings for a flat legend", () => {
    render(<Legend {...props()} />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });
});

describe("legend touch targets (spec mobile §5)", () => {
  /** Every control a finger presses: buttons, checkbox labels (and the spacer that aligns with them), the filter. */
  function targets(container: HTMLElement): HTMLElement[] {
    const labels = [...container.querySelectorAll("input[type=checkbox]")].map(
      (box) => box.closest("label") as HTMLElement,
    );
    const spacers = [...container.querySelectorAll<HTMLElement>("li > span[aria-hidden=true]")];
    return [
      ...container.querySelectorAll<HTMLElement>("button"),
      ...labels,
      ...spacers,
      container.querySelector("input[type=search]") as HTMLElement,
    ];
  }
  const full = { groups, hidden: new Set(["south"]) };

  it("with touchTargets gives every control a 44 px height, centred where it lays out its content", () => {
    const { container } = render(<Legend {...props({ ...full, touchTargets: true })} />);
    const all = targets(container);
    // The toggle, Show all, two group headers, three rows; three checkbox labels and a spacer; the filter.
    expect(all.length).toBeGreaterThanOrEqual(11);
    for (const target of all) {
      expect(target.style.minHeight).toBe("44px");
      if (target.style.display.includes("flex")) expect(target.style.alignItems).toBe("center");
    }
  });

  it("without touchTargets keeps today's styles", () => {
    const { container } = render(<Legend {...props({ ...full, touchTargets: false })} />);
    const styles = [...new Set(targets(container).map((target) => target.getAttribute("style")))].sort();
    expect(styles).toMatchInlineSnapshot(`
      [
        "color: rgb(35, 35, 45); font: 500 13px system-ui, sans-serif; min-height: 24px; background: none; border: medium; padding: 0px; cursor: pointer;",
        "color: rgb(35, 35, 45); font: 500 13px system-ui, sans-serif; min-height: 24px; background: none; border: medium; padding: 0px; cursor: pointer; display: flex; align-items: center; gap: 6px; flex: 1 1 0%; text-align: left;",
        "color: rgb(35, 35, 45); font: 500 13px system-ui, sans-serif; min-height: 24px; background: none; border: medium; padding: 0px; cursor: pointer; flex: 1 1 0%; text-align: left;",
        "color: rgb(35, 35, 45); font: 500 13px system-ui, sans-serif; width: 100%; box-sizing: border-box; min-height: 24px; margin: 4px 0px;",
        "display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: 24px; min-height: 24px; cursor: pointer;",
      ]
    `);
  });
});
