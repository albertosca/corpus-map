import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { gallery } from "../corpora";
import { TopBar } from "./TopBar";

describe("TopBar (showcase Task 5)", () => {
  it("shows the library name and a Corpus select with the exact four option labels", () => {
    render(<TopBar corpora={gallery} activeId="arxiv" onChange={() => {}} />);

    expect(screen.getByText("corpus-map")).not.toBeNull();
    const select = screen.getByLabelText("Corpus") as HTMLSelectElement;
    expect(select.value).toBe("arxiv");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Computer-science papers (arXiv metadata)",
      "Chemical elements",
      "Constellations",
      "Synthetic (5,000 items)",
    ]);
  });

  it("calls onChange with the newly selected corpus id", () => {
    const onChange = vi.fn();
    render(<TopBar corpora={gallery} activeId="arxiv" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("elements");
  });

  it("reflects a different activeId in the select's value", () => {
    render(<TopBar corpora={gallery} activeId="synthetic" onChange={() => {}} />);
    expect((screen.getByLabelText("Corpus") as HTMLSelectElement).value).toBe("synthetic");
  });
});
