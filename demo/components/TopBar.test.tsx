import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { gallery } from "../corpora";
import { TopBar } from "./TopBar";

describe("TopBar (showcase Task 5)", () => {
  it("shows the library name and a Corpus select with the exact four option labels", () => {
    render(
      <TopBar corpora={gallery} activeId="arxiv" onChange={() => {}} tuningOpen={false} onToggleTuning={() => {}} />,
    );

    expect(screen.getByText("corpus-map")).not.toBeNull();
    const select = screen.getByLabelText("Corpus") as HTMLSelectElement;
    expect(select.value).toBe("arxiv");
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "Computer-science papers (arXiv metadata)",
      "Chemical elements",
      "Constellations",
      "Synthetic (5,000 items)",
    ]);
  });

  it("names the page with the only level-1 heading, so the map's h2 sections sit under it", () => {
    render(
      <TopBar corpora={gallery} activeId="arxiv" onChange={() => {}} tuningOpen={false} onToggleTuning={() => {}} />,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("corpus-map");
  });

  it("calls onChange with the newly selected corpus id", () => {
    const onChange = vi.fn();
    render(
      <TopBar corpora={gallery} activeId="arxiv" onChange={onChange} tuningOpen={false} onToggleTuning={() => {}} />,
    );

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("elements");
  });

  it("reflects a different activeId in the select's value", () => {
    render(
      <TopBar
        corpora={gallery}
        activeId="synthetic"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
      />,
    );
    expect((screen.getByLabelText("Corpus") as HTMLSelectElement).value).toBe("synthetic");
  });

  describe("the Tuning gear button (showcase Task 7)", () => {
    it("calls onToggleTuning when clicked", () => {
      const onToggleTuning = vi.fn();
      render(
        <TopBar
          corpora={gallery}
          activeId="arxiv"
          onChange={() => {}}
          tuningOpen={false}
          onToggleTuning={onToggleTuning}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(onToggleTuning).toHaveBeenCalledTimes(1);
    });

    it("reflects tuningOpen through aria-pressed", () => {
      const { rerender } = render(
        <TopBar corpora={gallery} activeId="arxiv" onChange={() => {}} tuningOpen={false} onToggleTuning={() => {}} />,
      );
      expect(screen.getByRole("button", { name: "Tuning" }).getAttribute("aria-pressed")).toBe("false");

      rerender(<TopBar corpora={gallery} activeId="arxiv" onChange={() => {}} tuningOpen onToggleTuning={() => {}} />);
      expect(screen.getByRole("button", { name: "Tuning" }).getAttribute("aria-pressed")).toBe("true");
    });
  });
});
