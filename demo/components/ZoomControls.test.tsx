import { fireEvent, render, screen } from "@testing-library/react";
import type { CorpusMapHandle } from "corpus-map";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { ZoomControls } from "./ZoomControls";

function fakeHandleRef(): { ref: RefObject<CorpusMapHandle | null>; handle: CorpusMapHandle } {
  const handle: CorpusMapHandle = { zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn() };
  return { ref: { current: handle }, handle };
}

describe("ZoomControls (showcase Task 5)", () => {
  it("calls zoomIn on the handle from the Zoom in button", () => {
    const { ref, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(handle.zoomIn).toHaveBeenCalledTimes(1);
    expect(handle.zoomOut).not.toHaveBeenCalled();
    expect(handle.fit).not.toHaveBeenCalled();
  });

  it("calls zoomOut on the handle from the Zoom out button", () => {
    const { ref, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(handle.zoomOut).toHaveBeenCalledTimes(1);
  });

  it("calls fit on the handle from the Fit button", () => {
    const { ref, handle } = fakeHandleRef();
    render(<ZoomControls mapRef={ref} />);
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the handle is not attached yet (ref.current null)", () => {
    const ref: RefObject<CorpusMapHandle | null> = { current: null };
    render(<ZoomControls mapRef={ref} />);
    // Must not throw when clicked before the map has mounted its handle.
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))).not.toThrow();
  });
});
