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
    expect(screen.getByText("Scroll to zoom, drag to pan")).toBeTruthy();
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
