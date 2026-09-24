import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

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
});
