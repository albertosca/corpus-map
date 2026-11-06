import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer, footerClearance, footerPlacement } from "./Footer";
import { BOTTOM_ROW_HEIGHT, FOOTER_LIFT_ESTIMATE, FOOTER_MINIMUM_BAND_WIDTH, GUTTER } from "./floatingLayout";

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

  describe("footerClearance — how far up from the bottom edge the credit reaches, for the map's insets (2026-11-06)", () => {
    it("is the lifted footer's top edge: the bottom row, a gutter and the footer's three-line height", () => {
      expect(footerClearance("arxiv", 600, false)).toBe(BOTTOM_ROW_HEIGHT + GUTTER + FOOTER_LIFT_ESTIMATE);
      expect(footerClearance("synthetic", 700, false)).toBe(BOTTOM_ROW_HEIGHT + GUTTER + FOOTER_LIFT_ESTIMATE);
    });

    it("is nothing for a corpus without a credit, and nothing while the footer sits in the bottom row (the legend already clears the minimap)", () => {
      expect(footerClearance("elements", 600, false)).toBe(0);
      expect(footerClearance("constellations", 375, false)).toBe(0);
      expect(footerClearance("arxiv", 1440, false)).toBe(0);
    });
  });

  describe("footerPlacement — in the bottom row when the band is wide enough, else lifted above it (2026-09-25 review, B9)", () => {
    it("lifts the footer above the bottom row at 375, 480 and 600, and at 834 with the drawer open", () => {
      // The bottom-left run is the minimap plus the indicator beside it (394 px), so the band between it and the
      // zoom controls is `width - 406 - (zoomRight + 96)`: 86 px at 600, none at 834 once the controls shift left of
      // the drawer (the shift starts at 834).
      for (const [width, open] of [
        [375, false],
        [480, false],
        [600, false],
        [834, true],
      ] as const) {
        const placement = footerPlacement(width, open);
        expect(placement.lifted, `width ${width}, drawer ${open ? "open" : "closed"}`).toBe(true);
        expect(placement.bottom).toBe(BOTTOM_ROW_HEIGHT + GUTTER);
        expect(placement.left).toBe(GUTTER);
      }
      // Beside the shifted zoom controls: its right edge meets theirs, clear of the drawer.
      expect(footerPlacement(834, true).right).toBe(332);
    });

    it("sits in the bottom row, in a band at least FOOTER_MINIMUM_BAND_WIDTH wide, at 768 and 1440 with the drawer closed, at 768 with it open (the controls stay put under it) and at 1440 with it open", () => {
      for (const [width, open] of [
        [768, false],
        [1440, false],
        [768, true],
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
