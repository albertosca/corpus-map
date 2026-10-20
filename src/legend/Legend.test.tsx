import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME } from "../shared/theme";
import { Legend, type LegendProps } from "./Legend";

const entries = [
  { id: "north", name: "North", colour: "#003c96", members: 3 },
  { id: "south", name: "South", colour: "#960000", members: 2 },
];

function props(overrides: Partial<LegendProps> = {}): LegendProps {
  return {
    entries,
    more: 0,
    presentation: "guided",
    corner: "top-left",
    theme: DEFAULT_THEME,
    onEntry: () => {},
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

  it("reports the pressed territory and says how many were left out", () => {
    const onEntry = vi.fn();
    render(<Legend {...props({ onEntry, more: 4 })} />);
    fireEvent.click(screen.getByRole("button", { name: "South" }));
    expect(onEntry).toHaveBeenCalledWith("south");
    expect(screen.getByText("+4 more")).toBeTruthy();
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
