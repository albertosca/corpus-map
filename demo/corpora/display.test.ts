import { DEFAULT_THRESHOLDS, DEFAULT_TUNING } from "corpus-map";
import { describe, expect, it } from "vitest";
import { type DisplayValues, displayDifferences, resolveDisplay } from "./display";

const COMPUTED = { width: 150, height: 60 };

describe("resolveDisplay", () => {
  it("gives the library defaults and the computed card size when the entry has no display", () => {
    expect(resolveDisplay(undefined, COMPUTED)).toEqual({
      tuning: DEFAULT_TUNING,
      thresholds: DEFAULT_THRESHOLDS,
      cardSize: COMPUTED,
    });
  });

  it("merges tuning one level deep into labelClasses, and thresholds field by field", () => {
    const values = resolveDisplay(
      { tuning: { fadeBand: 0.4, labelClasses: { medium: 0.3 } }, thresholds: { nearAt: 3 } },
      COMPUTED,
    );
    expect(values.tuning).toEqual({ ...DEFAULT_TUNING, fadeBand: 0.4, labelClasses: { large: 0.8, medium: 0.3 } });
    expect(values.thresholds).toEqual({ midAt: DEFAULT_THRESHOLDS.midAt, nearAt: 3 });
  });

  it("prefers the entry's own card size over the computed one", () => {
    expect(resolveDisplay({ cardSize: { width: 200, height: 96 } }, COMPUTED).cardSize).toEqual({
      width: 200,
      height: 96,
    });
  });
});

describe("displayDifferences", () => {
  it("is empty for the defaults and the computed card size", () => {
    expect(displayDifferences(resolveDisplay(undefined, COMPUTED), COMPUTED)).toEqual({});
  });

  it("keeps exactly the fields that differ", () => {
    const values: DisplayValues = {
      tuning: { ...DEFAULT_TUNING, fadeBand: 0.4, labelClasses: { ...DEFAULT_TUNING.labelClasses, large: 0.9 } },
      thresholds: { ...DEFAULT_THRESHOLDS, nearAt: 3 },
      cardSize: { width: 180, height: 60 },
    };
    expect(displayDifferences(values, COMPUTED)).toEqual({
      tuning: { fadeBand: 0.4, labelClasses: { large: 0.9 } },
      thresholds: { nearAt: 3 },
      cardSize: { width: 180, height: 60 },
    });
  });

  it.each<[string, DisplayValues]>([
    ["defaults", resolveDisplay(undefined, COMPUTED)],
    [
      "tuning only",
      {
        tuning: { ...DEFAULT_TUNING, hoverRadius: 20, labelClasses: { large: 0.7, medium: 0.2 } },
        thresholds: DEFAULT_THRESHOLDS,
        cardSize: COMPUTED,
      },
    ],
    [
      "everything",
      {
        tuning: { ...DEFAULT_TUNING, edgesPerNode: 0 },
        thresholds: { midAt: 1.5, nearAt: 2.5 },
        cardSize: { width: 240, height: 76 },
      },
    ],
  ])("round-trips through resolveDisplay: %s", (_case, values) => {
    expect(resolveDisplay(displayDifferences(values, COMPUTED), COMPUTED)).toEqual(values);
  });
});
