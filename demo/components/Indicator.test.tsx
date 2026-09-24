import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Indicator } from "./Indicator";

describe("Indicator (showcase Task 5)", () => {
  it("renders nothing before the first onViewChange", () => {
    const { container } = render(<Indicator view={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders regime, ratio to one decimal, and the visible count", () => {
    render(<Indicator view={{ regime: "mid", ratio: 7.34, visibleCount: 42 }} />);
    expect(screen.getByText("mid · 7.3× · 42 items")).not.toBeNull();
  });

  it("rounds the ratio to one decimal even when it lands on a whole number", () => {
    render(<Indicator view={{ regime: "far", ratio: 1, visibleCount: 8000 }} />);
    expect(screen.getByText("far · 1.0× · 8000 items")).not.toBeNull();
  });
});
