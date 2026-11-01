import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer, footerPlacement } from "./Footer";
import { BOTTOM_ROW_HEIGHT, FOOTER_MINIMUM_BAND_WIDTH, GUTTER } from "./floatingLayout";

describe("Footer (showcase Task 5)", () => {
  it("shows the exact arXiv attribution sentence for arxiv", () => {
    const { getByText } = render(<Footer corpusId="arxiv" />);
    expect(getByText("Thank you to arXiv for use of its open access interoperability.")).not.toBeNull();
  });

  it("shows the exact synthetic disclosure sentence for synthetic", () => {
    const { getByText } = render(<Footer corpusId="synthetic" />);
    expect(getByText("Synthetic corpus, generated for scale testing.")).not.toBeNull();
  });

  it("shows nothing for elements", () => {
    const { container } = render(<Footer corpusId="elements" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows nothing for constellations", () => {
    const { container } = render(<Footer corpusId="constellations" />);
    expect(container.firstChild).toBeNull();
  });

  describe("footerPlacement — in the bottom row when the band is wide enough, else lifted above it (2026-09-25 review, B9)", () => {
    it("lifts the footer above the bottom row at 375, 480 and at 768 with the drawer open", () => {
      for (const [width, open] of [
        [375, false],
        [480, false],
        [768, true],
      ] as const) {
        const placement = footerPlacement(width, open);
        expect(placement.lifted, `width ${width}, drawer ${open ? "open" : "closed"}`).toBe(true);
        expect(placement.bottom).toBe(BOTTOM_ROW_HEIGHT + GUTTER);
        expect(placement.left).toBe(GUTTER);
      }
      // Beside the shifted zoom controls: its right edge meets theirs, clear of the drawer.
      expect(footerPlacement(768, true).right).toBe(332);
    });

    it("sits in the bottom row, in a band at least FOOTER_MINIMUM_BAND_WIDTH wide, at 600, 768 and 1440 with the drawer closed and at 1440 with it open", () => {
      for (const [width, open] of [
        [600, false],
        [768, false],
        [1440, false],
        [1440, true],
      ] as const) {
        const placement = footerPlacement(width, open);
        expect(placement.lifted, `width ${width}, drawer ${open ? "open" : "closed"}`).toBe(false);
        expect(placement.bottom).toBe(GUTTER);
        expect(width - placement.left - placement.right).toBeGreaterThanOrEqual(FOOTER_MINIMUM_BAND_WIDTH);
      }
    });
  });

  it("inline: renders in flow, without data-floating-control, and wraps", () => {
    const { container } = render(<Footer corpusId="arxiv" inline />);
    const footer = container.querySelector<HTMLElement>("[data-footer]");
    expect(footer).not.toBeNull();
    expect(footer?.hasAttribute("data-floating-control")).toBe(false);
    expect(footer?.style.position).toBe("");
    expect(footer?.style.whiteSpace).toBe("normal");
  });
});
