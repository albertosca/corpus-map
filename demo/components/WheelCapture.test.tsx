import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WheelCapture } from "./WheelCapture";

/** Renders `WheelCapture` against a plain div standing in for the map's own container. */
function renderCapture() {
  const containerRef = createRef<HTMLDivElement>();
  const utils = render(
    <>
      <div ref={containerRef} data-map-stand-in />
      <WheelCapture containerRef={containerRef} />
    </>,
  );
  const container = containerRef.current;
  if (!container) throw new Error("expected the stand-in container to be mounted");
  return { ...utils, container };
}

/**
 * `fireEvent.wheel` (unlike a bare `el.dispatchEvent`) wraps the dispatch in
 * `act()`, so a `setState` the listener triggers is flushed before this
 * returns — and its own return value is the DOM's `dispatchEvent` result:
 * `true` when nothing called `preventDefault`, `false` otherwise, which is
 * exactly what the "never calls preventDefault" test needs.
 */
function dispatchWheel(el: HTMLElement, init: Partial<{ deltaY: number; deltaMode: number; ctrlKey: boolean }> = {}) {
  return fireEvent.wheel(el, { deltaY: 0, deltaMode: 0, ctrlKey: false, ...init });
}

describe("WheelCapture (showcase Task 7)", () => {
  let now = 1000;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches a passive wheel listener to the container and removes it on unmount", () => {
    const containerRef = createRef<HTMLDivElement>();
    const el = document.createElement("div");
    document.body.appendChild(el);
    (containerRef as { current: HTMLDivElement | null }).current = el;
    const addSpy = vi.spyOn(el, "addEventListener");
    const removeSpy = vi.spyOn(el, "removeEventListener");

    const { unmount } = render(<WheelCapture containerRef={containerRef} />);
    expect(addSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: true });

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("wheel", expect.any(Function));
    el.remove();
  });

  it("never calls preventDefault on a captured wheel event (passive, read-only)", () => {
    const { container } = renderCapture();
    const notPrevented = dispatchWheel(container, { deltaY: -40 });
    expect(notPrevented).toBe(true);
  });

  it("records deltaY, deltaMode and ctrlKey, newest first", () => {
    const { container } = renderCapture();

    dispatchWheel(container, { deltaY: -40, deltaMode: 0, ctrlKey: false });
    now += 100;
    dispatchWheel(container, { deltaY: 12, deltaMode: 1, ctrlKey: true });

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // Header row plus two data rows, newest capture first.
    expect(rows).toHaveLength(3);
    const firstData = within(rows[1] as HTMLElement).getAllByRole("cell");
    expect(firstData.map((c) => c.textContent)).toEqual(["12.00", "1", "yes", "100"]);
    const secondData = within(rows[2] as HTMLElement).getAllByRole("cell");
    expect(secondData.map((c) => c.textContent)).toEqual(["-40.00", "0", "no", "-"]);
  });

  it("caps at 50 captured events, dropping the oldest", () => {
    const { container } = renderCapture();
    for (let i = 0; i < 55; i += 1) {
      dispatchWheel(container, { deltaY: i });
      now += 10;
    }
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(51); // header + 50 capped rows
    // Newest first: the last dispatched deltaY (54) leads.
    const firstData = within(rows[1] as HTMLElement).getAllByRole("cell");
    expect(firstData[0]?.textContent).toBe("54.00");
    // The oldest five (deltaY 0..4) must have been dropped.
    const lastData = within(rows[50] as HTMLElement).getAllByRole("cell");
    expect(lastData[0]?.textContent).toBe("5.00");
  });

  it("copies the captured samples as JSON via the clipboard, and reports failure without throwing", async () => {
    const { container } = renderCapture();
    dispatchWheel(container, { deltaY: -5, ctrlKey: true });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(writeText.mock.calls[0]?.[0] as string) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ deltaY: -5, deltaMode: 0, ctrlKey: true });

    const failingWriteText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText: failingWriteText } });
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Copy" }))).not.toThrow();
    await screen.findByText("Could not copy to clipboard.");
  });
});
