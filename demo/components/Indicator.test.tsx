import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Indicator } from "./Indicator";

describe("Indicator (showcase Task 5)", () => {
  it("renders nothing before the first onViewChange", () => {
    const { container } = render(<Indicator view={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders regime, ratio to one decimal, and the visible count", () => {
    render(<Indicator view={{ regime: "mid", ratio: 7.34, visibleCount: 42, presentation: "dense" }} />);
    expect(screen.getByText("mid · 7.3× · 42 items")).not.toBeNull();
  });

  it("says '1 item', not '1 items', for a single visible item (and '0 items' for none)", () => {
    const { rerender } = render(
      <Indicator view={{ regime: "near", ratio: 12, visibleCount: 1, presentation: "dense" }} />,
    );
    expect(screen.getByText("near · 12.0× · 1 item")).not.toBeNull();
    rerender(<Indicator view={{ regime: "near", ratio: 12, visibleCount: 0, presentation: "dense" }} />);
    expect(screen.getByText("near · 12.0× · 0 items")).not.toBeNull();
  });

  it("rounds the ratio to one decimal even when it lands on a whole number", () => {
    render(<Indicator view={{ regime: "far", ratio: 1, visibleCount: 8000, presentation: "guided" }} />);
    expect(screen.getByText("far · 1.0× · 8000 items")).not.toBeNull();
  });
});
