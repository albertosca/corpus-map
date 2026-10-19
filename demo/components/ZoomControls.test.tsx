import { fireEvent, render, screen } from "@testing-library/react";
import type { CorpusMapHandle } from "corpus-map";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAWER_MAXIMUM_WIDTH } from "./Drawer";
import { BOTTOM_LEFT_COLUMN_WIDTH, GUTTER } from "./floatingLayout";
import { BUTTON_WIDTH, ZoomControls } from "./ZoomControls";

function fakeHandleRef(): { reference: RefObject<CorpusMapHandle | null>; handle: CorpusMapHandle } {
  const handle: CorpusMapHandle = { zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn() };
  return { reference: { current: handle }, handle };
}

const ORIGINAL_INNER_WIDTH = window.innerWidth;

/** `window.innerWidth` is read at mount (lazy `useState` initializer), so this must run before `render`. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

describe("ZoomControls (showcase Task 5)", () => {
  it("calls zoomIn on the handle from the Zoom in button", () => {
    const { reference, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={reference} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(handle.zoomIn).toHaveBeenCalledTimes(1);
    expect(handle.zoomOut).not.toHaveBeenCalled();
    expect(handle.fit).not.toHaveBeenCalled();
  });

  it("calls zoomOut on the handle from the Zoom out button", () => {
    const { reference, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={reference} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(handle.zoomOut).toHaveBeenCalledTimes(1);
  });

  it("calls fit on the handle from the Fit button", () => {
    const { reference, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={reference} />);
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the handle is not attached yet (reference.current null)", () => {
    const reference: RefObject<CorpusMapHandle | null> = { current: null };
    render(<ZoomControls mapRef={reference} />);
    // Must not throw when clicked before the map has mounted its handle.
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))).not.toThrow();
  });

  describe("shifting left of the open drawer (showcase Task 6 fix round 1)", () => {
    afterEach(() => {
      setViewportWidth(ORIGINAL_INNER_WIDTH);
    });

    it("stays at its default offset when the drawer is closed, even on a wide viewport", () => {
      setViewportWidth(1280);
      const { reference } = fakeHandleRef();
      const { container } = render(<ZoomControls mapRef={reference} drawerOpen={false} />);
      const element = container.querySelector<HTMLElement>("[data-zoom-controls]");
      expect(element?.style.right).toBe("12px");
    });

    it("shifts its right edge left of the drawer's left edge on a wide viewport with the drawer open", () => {
      setViewportWidth(1280);
      const { reference } = fakeHandleRef();
      const { container } = render(<ZoomControls mapRef={reference} drawerOpen={true} />);
      const element = container.querySelector<HTMLElement>("[data-zoom-controls]");

      // Parsed the same way the demo's own overflow guard reads inline
      // values (no layout engine in jsdom): the drawer's left edge, at this
      // viewport width, is `viewportWidth - DRAWER_MAXIMUM_WIDTH` (its `width:
      // 90vw` is capped by `maxWidth` well before 1280px; its own `right`
      // is `0`). Controls must sit with their right edge strictly left of
      // that, i.e. their own `right` offset must be > `DRAWER_MAXIMUM_WIDTH`.
      const shiftedRight = Number.parseFloat(element?.style.right ?? "");
      expect(shiftedRight).toBeGreaterThan(DRAWER_MAXIMUM_WIDTH);
    });

    it("falls back to its default offset (covered by the drawer) at 375px even with the drawer open", () => {
      setViewportWidth(375);
      const { reference } = fakeHandleRef();
      const { container } = render(<ZoomControls mapRef={reference} drawerOpen={true} />);
      const element = container.querySelector<HTMLElement>("[data-zoom-controls]");
      expect(element?.style.right).toBe("12px");
    });

    it("shifts live when the browser is resized past the breakpoint while the drawer stays open", () => {
      setViewportWidth(375);
      const { reference } = fakeHandleRef();
      const { container } = render(<ZoomControls mapRef={reference} drawerOpen={true} />);
      const element = container.querySelector<HTMLElement>("[data-zoom-controls]");
      expect(element?.style.right).toBe("12px");

      setViewportWidth(1280);
      fireEvent(window, new Event("resize"));
      expect(Number.parseFloat(element?.style.right ?? "")).toBeGreaterThan(DRAWER_MAXIMUM_WIDTH);
    });
  });

  describe("staying clear of the minimap too, not just the drawer (showcase Task 6 fix round 2)", () => {
    afterEach(() => {
      setViewportWidth(ORIGINAL_INNER_WIDTH);
    });

    it("does NOT shift at 500px — wide enough to have shifted under fix round 1's drawer-only threshold (440), but not wide enough to clear the minimap/indicator column too", () => {
      setViewportWidth(500);
      const { reference } = fakeHandleRef();
      const { container } = render(<ZoomControls mapRef={reference} drawerOpen={true} />);
      const element = container.querySelector<HTMLElement>("[data-zoom-controls]");
      // Stays at its default offset (drawer covers it) rather than the
      // shifted DRAWER_MAXIMUM_WIDTH + GUTTER (332px) fix round 1 would have
      // produced here — that shifted position would have landed the
      // controls squarely on the minimap (`task-6-rereview.md`'s finding).
      expect(element?.style.right).toBe("12px");
    });

    it("shifts once the viewport clears BOTTOM_LEFT_COLUMN_WIDTH + GUTTER past the shift, not just the drawer's own edge", () => {
      const breakpoint = BOTTOM_LEFT_COLUMN_WIDTH + GUTTER + BUTTON_WIDTH + GUTTER + DRAWER_MAXIMUM_WIDTH + GUTTER;

      // One pixel below the breakpoint: still covered.
      setViewportWidth(breakpoint - 1);
      const { reference: referenceBelow } = fakeHandleRef();
      const { container: belowContainer } = render(<ZoomControls mapRef={referenceBelow} drawerOpen={true} />);
      expect(belowContainer.querySelector<HTMLElement>("[data-zoom-controls]")?.style.right).toBe("12px");

      // Exactly at the breakpoint: shifted, and clears the column with a
      // GUTTER-sized margin (parsed the same way the overflow guard reads
      // inline values — no layout engine in jsdom).
      setViewportWidth(breakpoint);
      const { reference: referenceAt } = fakeHandleRef();
      const { container: atContainer } = render(<ZoomControls mapRef={referenceAt} drawerOpen={true} />);
      const element = atContainer.querySelector<HTMLElement>("[data-zoom-controls]");
      const shiftedRight = Number.parseFloat(element?.style.right ?? "");
      expect(shiftedRight).toBe(DRAWER_MAXIMUM_WIDTH + GUTTER);
    });
  });
});
