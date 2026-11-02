import { fireEvent, render, screen } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { auditAccessibility, violationIds } from "../../test/audit";
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
        linkStatus={null}
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
        linkStatus={null}
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
        linkStatus={null}
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
        linkStatus={null}
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
          linkStatus={null}
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
          linkStatus={null}
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
          linkStatus={null}
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
      const { rerender } = render(<TopBar {...properties} linkStatus={null} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
      expect(onCopyLink).toHaveBeenCalledOnce();
      expect(screen.getByRole("status").textContent).toBe("");
      rerender(<TopBar {...properties} linkStatus="copied" />);
      expect(screen.getByRole("status").textContent).toBe("Link copied");
      rerender(<TopBar {...properties} linkStatus="failed" />);
      expect(screen.getByRole("status").textContent).toBe("Copy failed: use the address bar");
    });

    it("grows the status into the free space left of the controls, so the button never moves from under the pointer", () => {
      render(
        <TopBar
          corpora={gallery}
          activeId="arxiv"
          onChange={() => {}}
          tuningOpen={false}
          onToggleTuning={() => {}}
          onCopyLink={() => {}}
          linkStatus="failed"
        />,
      );
      const status = screen.getByRole("status");
      const label = screen.getByText("Corpus");
      // The right-aligned controls start at the first `margin-left: auto`
      // item; a status after them would push every control left as it fills.
      expect(status.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(status.style.marginLeft).toBe("auto");
      expect(label.style.marginLeft).toBe("");
    });
  });
});

describe("TopBar on a narrow window (spec mobile §6)", () => {
  function narrowBar(extra: Partial<Parameters<typeof TopBar>[0]> = {}) {
    const properties = {
      corpora: gallery,
      activeId: "arxiv" as const,
      onChange: () => {},
      tuningOpen: false,
      onToggleTuning: () => {},
      onCopyLink: () => {},
      linkStatus: null,
      narrow: true,
      ...extra,
    };
    const view = render(<TopBar {...properties} />);
    const menu = screen.getByRole("button", { name: "Menu" });
    const popover = view.container.querySelector<HTMLElement>("#top-bar-menu");
    if (!popover) throw new Error("no popover");
    return { ...view, menu, popover };
  }

  it("fits one row: the title and the Corpus label hidden but present, the select stretching", () => {
    const { container } = narrowBar();
    const bar = container.querySelector<HTMLElement>("[data-topbar]");
    expect(bar?.style.flexWrap).toBe("nowrap");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("corpus-map");
    expect(heading.style.position).toBe("absolute");
    // jsdom normalises the clip's spelling; a clip rect is what hides it.
    expect(heading.style.clip).toMatch(/^rect\(/);
    const label = container.querySelector<HTMLElement>("label[for='corpus-select']");
    expect(label?.style.clip).toMatch(/^rect\(/);
    expect(label?.style.position).toBe("absolute");
    const select = screen.getByLabelText("Corpus") as HTMLSelectElement;
    expect(select.style.flex).toContain("1");
    expect(select.style.minHeight).toBe("44px");
  });

  it("shows a 44 × 44 Menu button that discloses Tuning and Copy link, each 44 px tall", () => {
    const { menu, popover } = narrowBar();
    expect(menu.style.minWidth).toBe("44px");
    expect(menu.style.minHeight).toBe("44px");
    expect(menu.getAttribute("aria-controls")).toBe("top-bar-menu");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(popover.hidden).toBe(true);
    // An inline `display` would beat the `hidden` attribute's UA rule, so the closed menu would still show.
    expect(getComputedStyle(popover).display).toBe("none");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(popover.hidden).toBe(false);
    expect(getComputedStyle(popover).display).toBe("flex");
    for (const name of ["Tuning", "Copy link"]) {
      expect(screen.getByRole("button", { name }).style.minHeight).toBe("44px");
    }
  });

  it("closes on Escape, focusing Menu, without letting the Escape reach the document", () => {
    const { menu, popover } = narrowBar();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    try {
      fireEvent.click(menu);
      const tuning = screen.getByRole("button", { name: "Tuning" });
      tuning.focus();
      fireEvent.keyDown(tuning, { key: "Escape" });
      expect(popover.hidden).toBe(true);
      expect(document.activeElement).toBe(menu);
      expect(documentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", documentEscape);
    }
  });

  it("closes on an Escape with focus outside it, as Safari leaves focus after a click (whole-branch review #8)", () => {
    const { menu, popover } = narrowBar();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    try {
      fireEvent.click(menu);
      menu.blur();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(popover.hidden).toBe(true);
      expect(document.activeElement).toBe(menu);
      expect(documentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", documentEscape);
    }
  });

  it("lets an Escape on the closed Menu reach the document, so the drawer still closes", () => {
    const { menu } = narrowBar();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    try {
      fireEvent.keyDown(menu, { key: "Escape" });
      expect(documentEscape).toHaveBeenCalledTimes(1);
      fireEvent.click(menu);
      fireEvent.keyDown(menu, { key: "Escape" });
      expect(documentEscape).toHaveBeenCalledTimes(1);
      expect(menu.getAttribute("aria-expanded")).toBe("false");
    } finally {
      document.removeEventListener("keydown", documentEscape);
    }
  });

  it("closes on a press outside, focusing Menu; a press inside keeps it open", () => {
    const { menu, popover } = narrowBar();
    fireEvent.click(menu);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Tuning" }));
    expect(popover.hidden).toBe(false);
    fireEvent.pointerDown(document.body);
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(menu);
  });

  it("closes and calls onToggleTuning when Tuning is chosen, reflecting tuningOpen", () => {
    const onToggleTuning = vi.fn();
    const { menu, popover } = narrowBar({ onToggleTuning, tuningOpen: true });
    fireEvent.click(menu);
    const tuning = screen.getByRole("button", { name: "Tuning" });
    expect(tuning.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tuning);
    expect(onToggleTuning).toHaveBeenCalledTimes(1);
    expect(popover.hidden).toBe(true);
  });

  it("closes, focusing Menu, and calls onCopyLink when Copy link is chosen; the status stays announced", () => {
    const onCopyLink = vi.fn();
    const { menu, popover, rerender } = narrowBar({ onCopyLink });
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(menu);
    rerender(
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={onCopyLink}
        linkStatus="copied"
        narrow
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Link copied");
  });

  it("points gearButtonRef at the Menu button, so closing the tuning panel returns focus there", () => {
    const gearButtonReference = createRef<HTMLButtonElement>();
    const { menu } = narrowBar({ gearButtonRef: gearButtonReference });
    expect(gearButtonReference.current).toBe(menu);
  });

  it("moves gearButtonRef to the Tuning button when the window widens, and back to Menu when it narrows", () => {
    const gearButtonReference = createRef<HTMLButtonElement>();
    const base = {
      corpora: gallery,
      activeId: "arxiv" as const,
      onChange: () => {},
      tuningOpen: false,
      onToggleTuning: () => {},
      onCopyLink: () => {},
      linkStatus: null,
      gearButtonRef: gearButtonReference,
    };
    const { rerender } = render(<TopBar {...base} narrow />);
    rerender(<TopBar {...base} />);
    expect(gearButtonReference.current).toBe(screen.getByRole("button", { name: "Tuning" }));
    rerender(<TopBar {...base} narrow />);
    expect(gearButtonReference.current).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("keeps the wide bar as it was: no Menu, wrapping, Tuning and Copy link in the row", () => {
    const { container } = render(
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={() => {}}
        linkStatus={null}
      />,
    );
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(container.querySelector("#top-bar-menu")).toBeNull();
    expect(container.querySelector<HTMLElement>("[data-topbar]")?.style.flexWrap).toBe("wrap");
    expect(screen.getByRole("heading", { level: 1 }).style.position).toBe("");
  });

  it("comes back closed when the window narrows again after widening with the menu open", () => {
    const { menu, rerender, container } = narrowBar();
    fireEvent.click(menu);
    const wide = {
      corpora: gallery,
      activeId: "arxiv" as const,
      onChange: () => {},
      tuningOpen: false,
      onToggleTuning: () => {},
      onCopyLink: () => {},
      linkStatus: null,
    };
    rerender(<TopBar {...wide} />);
    rerender(<TopBar {...wide} narrow />);
    expect(container.querySelector<HTMLElement>("#top-bar-menu")?.hidden).toBe(true);
    expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("passes the accessibility audit, closed and open", async () => {
    const { container, menu } = narrowBar();
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
    fireEvent.click(menu);
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
  });
});

describe("TopBar search (spec search §6)", () => {
  const spec: MapSpec = { version: "1", territories: [], nodes: [] };
  const bar = (extra: Partial<Parameters<typeof TopBar>[0]> = {}) =>
    render(
      <TopBar
        corpora={gallery}
        activeId="arxiv"
        onChange={() => {}}
        tuningOpen={false}
        onToggleTuning={() => {}}
        onCopyLink={() => {}}
        linkStatus={null}
        search={{ spec, onMatches: () => {}, onShow: () => {} }}
        {...extra}
      />,
    );

  it("shows no search without the prop", () => {
    bar({ search: undefined });
    expect(document.querySelector("search")).toBeNull();
  });

  it("puts the search after the corpus select on a wide bar, described by where it runs", () => {
    const { container } = bar();
    const select = screen.getByLabelText("Corpus");
    const search = container.querySelector("search") as HTMLElement;
    expect(select.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Search" });
    const hint = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Searches titles and details in your browser");
    expect((input as HTMLElement).style.minHeight).toBe("");
  });

  it("puts the search in the one-row narrow bar before Menu, with 44 px targets", () => {
    const { container } = bar({ narrow: true });
    const search = container.querySelector("search") as HTMLElement;
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(search.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search" }).style.minHeight).toBe("44px");
    expect(container.querySelector<HTMLElement>("[data-topbar]")?.style.flexWrap).toBe("nowrap");
  });

  it("keeps the wide search on one row, so its results never make the bar taller", () => {
    const { container } = bar();
    expect((container.querySelector("search") as HTMLElement).style.flexWrap).toBe("nowrap");
  });

  it("lets the narrow search take more of the row than the corpus select, which may shrink to nothing", () => {
    const { container } = bar({ narrow: true });
    const search = container.querySelector("search") as HTMLElement;
    const select = screen.getByLabelText("Corpus");
    expect(Number(search.style.flexGrow)).toBeGreaterThan(Number(select.style.flexGrow));
    expect(select.style.flexBasis).toMatch(/^0/);
    expect(select.style.minWidth).toBe("0px");
  });

  it("passes the accessibility audit with the search, wide and narrow", async () => {
    const wide = bar();
    expect(violationIds(await auditAccessibility(wide.container))).toEqual([]);
    wide.unmount();
    const narrow = bar({ narrow: true });
    expect(violationIds(await auditAccessibility(narrow.container))).toEqual([]);
  });
});
