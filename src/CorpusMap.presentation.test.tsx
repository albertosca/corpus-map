import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { CorpusMap, type CorpusMapHandle, type CorpusMapView } from "./CorpusMap";
import { validateSpec } from "./shared/spec";

const spec = validateSpec({
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
  ],
});

/** The last view `onViewChange` reported. */
function latest(views: readonly CorpusMapView[]): CorpusMapView | undefined {
  return views[views.length - 1];
}

function mount(presentation?: "auto" | "guided" | "dense") {
  const views: CorpusMapView[] = [];
  const handle = createRef<CorpusMapHandle>();
  render(
    <CorpusMap
      ref={handle}
      spec={spec}
      width={400}
      height={300}
      thresholds={{ midAt: 1.1, nearAt: 50 }}
      renderCard={() => null}
      onViewChange={(view) => views.push(view)}
      {...(presentation === undefined ? {} : { presentation })}
    />,
  );
  return { views, handle };
}

describe("presentation prop", () => {
  it("is guided at the fitted view and dense once zoomed to mid, by default", () => {
    const { views, handle } = mount();
    expect(latest(views)?.presentation).toBe("guided");
    act(() => handle.current?.zoomIn());
    expect(latest(views)?.regime).toBe("mid");
    expect(latest(views)?.presentation).toBe("dense");
  });

  it("stays guided at mid when locked to guided, and dense at far when locked to dense", () => {
    const guided = mount("guided");
    act(() => guided.handle.current?.zoomIn());
    expect(latest(guided.views)?.presentation).toBe("guided");
    expect(latest(mount("dense").views)?.presentation).toBe("dense");
  });
});
