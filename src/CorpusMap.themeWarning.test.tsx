import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { resetThemeWarnings } from "./shared/devThemeCheck";
import type { MapSpec } from "./shared/spec";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a"], centroid: [0, 0] }],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: "t1" }],
};

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  resetThemeWarnings();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe("CorpusMap theme warning", () => {
  it("warns once for a bad theme re-rendered five times with a fresh literal each time", async () => {
    const { rerender } = render(
      <CorpusMap spec={spec} renderCard={() => null} width={400} height={300} theme={{ territoryLabel: "#d0d0d0" }} />,
    );
    for (let round = 0; round < 4; round += 1)
      rerender(
        <CorpusMap
          spec={spec}
          renderCard={() => null}
          width={400}
          height={300}
          theme={{ territoryLabel: "#d0d0d0" }}
        />,
      );
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns nothing without a theme", async () => {
    render(<CorpusMap spec={spec} renderCard={() => null} width={400} height={300} />);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(warn).not.toHaveBeenCalled();
  });
});
