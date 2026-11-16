import { act, render, screen } from "@testing-library/react";
import type { CorpusMapView } from "corpus-map";
import { describe, expect, it } from "vitest";
import { createViewStore, Indicator } from "./Indicator";

function storeWith(view: CorpusMapView | null) {
  const store = createViewStore();
  store.set(view);
  return store;
}

describe("Indicator (showcase Task 5)", () => {
  it("renders nothing before the first onViewChange", () => {
    const { container } = render(<Indicator store={createViewStore()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders regime, ratio to one decimal, and the visible count", () => {
    render(<Indicator store={storeWith({ regime: "mid", ratio: 7.34, visibleCount: 42, presentation: "dense" })} />);
    expect(screen.getByText("mid · 7.3× · 42 items")).not.toBeNull();
  });

  it("says '1 item', not '1 items', for a single visible item (and '0 items' for none)", () => {
    const store = storeWith({ regime: "near", ratio: 12, visibleCount: 1, presentation: "dense" });
    render(<Indicator store={store} />);
    expect(screen.getByText("near · 12.0× · 1 item")).not.toBeNull();
    act(() => store.set({ regime: "near", ratio: 12, visibleCount: 0, presentation: "dense" }));
    expect(screen.getByText("near · 12.0× · 0 items")).not.toBeNull();
  });

  it("sits in a labelled region, floating or inline, so no page content is outside a landmark", () => {
    const view: CorpusMapView = { regime: "far", ratio: 1, visibleCount: 8000, presentation: "guided" };
    const floating = render(<Indicator store={storeWith(view)} />);
    expect(screen.getByRole("region", { name: "Map view" }).textContent).toBe("far · 1.0× · 8000 items");
    floating.unmount();
    render(<Indicator store={storeWith(view)} inline />);
    expect(screen.getByRole("region", { name: "Map view" }).textContent).toBe("far · 1.0× · 8000 items");
  });

  it("rounds the ratio to one decimal even when it lands on a whole number", () => {
    render(<Indicator store={storeWith({ regime: "far", ratio: 1, visibleCount: 8000, presentation: "guided" })} />);
    expect(screen.getByText("far · 1.0× · 8000 items")).not.toBeNull();
  });

  it("goes blank when the store is cleared, and stops listening once unmounted", () => {
    const store = storeWith({ regime: "far", ratio: 1, visibleCount: 3, presentation: "guided" });
    const { container, unmount } = render(<Indicator store={store} />);
    act(() => store.set(null));
    expect(container.firstChild).toBeNull();
    unmount();
    expect(() => store.set({ regime: "far", ratio: 2, visibleCount: 3, presentation: "guided" })).not.toThrow();
  });

  it("inline: renders in flow, without data-floating-control", () => {
    const store = storeWith({ regime: "far", ratio: 1, visibleCount: 3, presentation: "dense" });
    const { container } = render(<Indicator store={store} inline />);
    const element = container.firstElementChild as HTMLElement | null;
    expect(element).not.toBeNull();
    expect(element?.hasAttribute("data-floating-control")).toBe(false);
    expect(element?.style.position).toBe("");
  });
});
