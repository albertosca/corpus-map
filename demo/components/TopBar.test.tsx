import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { gallery } from "../corpora";
import { TopBar } from "./TopBar";

describe("TopBar (showcase Task 5)", () => {
  it("shows the library name and a Corpus select with the exact four option labels", () => {
    render(
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={() => {}}
        linkCopied={false}
      />,
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
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={() => {}}
        linkCopied={false}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("corpus-map");
  });

  it("calls onChange with the newly selected corpus id", () => {
    const onChange = vi.fn();
    render(
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={onChange}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={() => {}}
        linkCopied={false}
      />,
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
        onCopyLink={() => {}}
        linkCopied={false}
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
          onCopyLink={() => {}}
          linkCopied={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(onToggleTuning).toHaveBeenCalledTimes(1);
    });

    it("reflects tuningOpen through aria-pressed", () => {
      const { rerender } = render(
        <TopBar
          corpora={gallery}
          activeId="arxiv"
          onChange={() => {}}
          tuningOpen={false}
          onToggleTuning={() => {}}
          onCopyLink={() => {}}
          linkCopied={false}
        />,
      );
      expect(screen.getByRole("button", { name: "Tuning" }).getAttribute("aria-pressed")).toBe("false");

      rerender(
        <TopBar
          corpora={gallery}
          activeId="arxiv"
          onChange={() => {}}
          tuningOpen
          onToggleTuning={() => {}}
          onCopyLink={() => {}}
          linkCopied={false}
        />,
      );
      expect(screen.getByRole("button", { name: "Tuning" }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("Copy link (spec slice C §6)", () => {
    it("calls onCopyLink and announces the copy through a status region", () => {
      const onCopyLink = vi.fn();
      const properties = {
        corpora: gallery,
        activeId: "arxiv" as const,
        onChange: () => {},
        tuningOpen: false,
        onToggleTuning: () => {},
        onCopyLink,
      };
      const { rerender } = render(<TopBar {...properties} linkCopied={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      expect(onCopyLink).toHaveBeenCalledOnce();
      expect(screen.getByRole("status").textContent).toBe("");
      rerender(<TopBar {...properties} linkCopied />);
      expect(screen.getByRole("status").textContent).toBe("Link copied");
    });
  });
});
