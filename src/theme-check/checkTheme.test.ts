import { describe, expect, it } from "vitest";
import { DARK_THEME, DEFAULT_THEME, type ThemeInput } from "../shared/theme";
import { checkTheme, type ThemeMetric } from "./checkTheme";

function expectProblem(partial: ThemeInput, metric: ThemeMetric, options?: { page?: string }) {
  const problems = checkTheme({ ...DEFAULT_THEME, ...partial }, options);
  expect(
    problems.some((problem) => problem.metric === metric),
    JSON.stringify(problems),
  ).toBe(true);
  for (const problem of problems) {
    expect(Number.isFinite(problem.measured), JSON.stringify(problem)).toBe(true);
    expect(problem.message.length).toBeGreaterThan(0);
  }
  return problems;
}

describe("checkTheme part one", () => {
  it("reports a point that cannot be seen (metric 15)", () => {
    const problems = expectProblem({ palette: ["#fafafa", ...DEFAULT_THEME.palette.slice(1)] }, "15");
    expect(problems.find((problem) => problem.metric === "15")?.required).toBe(3);
  });

  it("reports a name that cannot be read (metric 16)", () => {
    const problems = expectProblem({ territoryLabel: "#d0d0d0" }, "16", { page: "#ffffff" });
    expect(problems.find((problem) => problem.metric === "16")?.required).toBe(4.5);
  });

  it.each([
    ["one entry", ["#336699"]],
    [
      "eleven entries",
      Array.from({ length: 11 }, (_, index) => `#${(index * 20 + 40).toString(16).padStart(2, "0")}4466`),
    ],
    ["an rgba entry", ["rgba(10,20,30,0.5)", "#336699"]],
    ["an unparseable entry", ["oklch(0.5 0.1 20)", "#336699"]],
    ["an empty palette", []],
  ])("reports a palette of %s without throwing", (_name, palette) => {
    const problems = expectProblem({ palette }, "palette");
    // an unreadable palette returns the palette problems at once, no colour maths on it
    expect(problems.every((problem) => problem.metric === "palette")).toBe(true);
  });

  it("reports an unreadable label, neutral or focus colour as a palette problem, not a throw", () => {
    expectProblem({ territoryLabel: "nope" }, "palette");
    expectProblem({ pointNeutral: "nope" }, "palette");
    expectProblem({ focusOutline: "nope" }, "palette");
  });

  it("reports a ring that closes the hole", () => {
    const problems = expectProblem({ pointRadius: 2, unvisitedRingWidth: 1.8 }, "ring");
    const ring = problems.find((problem) => problem.metric === "ring");
    expect(ring?.measured).toBeCloseTo(0.2, 5);
    expect(ring?.required).toBe(0.5);
  });

  it("reports a ring wider than the point as a negative hole, finite", () => {
    const problems = expectProblem({ pointRadius: 2, unvisitedRingWidth: 5 }, "ring");
    expect(problems.find((problem) => problem.metric === "ring")?.measured).toBe(-3);
  });

  it("keeps only the worst case per metric and kind", () => {
    const problems = checkTheme({ ...DEFAULT_THEME, territoryLabel: "#d0d0d0" }, { page: "#ffffff" });
    const keys = problems.map((problem) => `${problem.metric}:${problem.subject}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(problems.length).toBeLessThan(10);
  });

  it("measures against the given page", () => {
    expect(checkTheme(DEFAULT_THEME, { page: "#ffffff" })).toEqual([]);
    expect(checkTheme(DEFAULT_THEME, { page: "#18181b" }).length).toBeGreaterThan(0);
    expect(checkTheme(DARK_THEME, { page: "#18181b" })).toEqual([]);
    expect(checkTheme(DARK_THEME, { page: "#ffffff" }).length).toBeGreaterThan(0);
  });

  it("derives the page from the theme when none is given", () => {
    expect(checkTheme(DEFAULT_THEME)).toEqual([]);
    expect(checkTheme(DARK_THEME)).toEqual([]);
  });

  it("rejects a page it cannot parse", () => {
    expect(() => checkTheme({}, { page: "blue" })).toThrow(RangeError);
  });

  it("the house light theme has no problems on its pages", () => {
    for (const page of ["#ffffff", "#f7f7f8"]) expect(checkTheme(DEFAULT_THEME, { page })).toEqual([]);
  });

  it("accepts a partial theme and resolves it over the default", () => {
    expect(checkTheme({})).toEqual([]);
  });
});

describe("checkTheme part two", () => {
  const rest = DEFAULT_THEME.palette.slice(2);

  it("reports two palette colours that are nearly the same (metric 17, normal vision)", () => {
    const problems = expectProblem({ palette: ["#065781", "#075882", ...rest] }, "17");
    const found = problems.find((problem) => problem.metric === "17" && problem.subject.includes("normal"));
    expect(found?.required).toBe(9);
    expect(found?.subject).toContain("#065781");
    expect(found?.subject).toContain("#075882");
  });

  it("reports a pair that is apart in normal vision but collapses under deuteranopia, naming the mode", () => {
    // Same luminance, opposite on the red-green axis.
    const palette = ["#8a6a3a", "#5f7a3a", ...rest];
    const problems = expectProblem({ palette }, "17");
    expect(problems.some((problem) => problem.subject.includes("deuteranopia"))).toBe(true);
  });

  it("reports a focus outline that cannot be seen over the fills (focus)", () => {
    const problems = expectProblem({ focusOutline: "#f0f0f0" }, "focus", { page: "#ffffff" });
    expect(problems.find((problem) => problem.metric === "focus")?.required).toBe(3);
  });

  it("reports a palette colour whose own outline vanishes over its fill (outline)", () => {
    const problems = expectProblem({ palette: ["#f4f4f4", ...DEFAULT_THEME.palette.slice(1)] }, "outline", {
      page: "#ffffff",
    });
    expect(problems.find((problem) => problem.metric === "outline")?.measured).toBeLessThan(3);
  });

  it.each([
    ["#ffffff", "#f7f7f8"],
    ["#18181b", "#111114"],
  ])("the house themes pass on their pages", (...pages) => {
    const theme = pages[0] === "#ffffff" ? DEFAULT_THEME : DARK_THEME;
    for (const page of pages) expect(checkTheme(theme, { page })).toEqual([]);
    expect(checkTheme(theme)).toEqual([]);
  });
});

describe("checkTheme on numbers that cannot be measured", () => {
  it.each([
    ["a NaN fill alpha", { territoryFillAlpha: Number.NaN }],
    ["a fill alpha above 1", { territoryFillAlpha: 2 }],
    ["a negative fill alpha", { territoryFillAlpha: -0.5 }],
    ["a NaN point radius", { pointRadius: Number.NaN }],
    ["an infinite point radius", { pointRadius: Number.POSITIVE_INFINITY }],
  ])("%s is a readable problem with a finite measured value", (_name, partial) => {
    const problems = checkTheme({ ...DEFAULT_THEME, ...partial });
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(Number.isFinite(problem.measured), JSON.stringify(problem)).toBe(true);
      expect(problem.measured).toBeGreaterThanOrEqual(0);
      expect(problem.message.length).toBeGreaterThan(0);
    }
  });

  it("throws a RangeError for an invalid width, since resolveTheme validates it first", () => {
    expect(() => checkTheme({ selectionRingWidth: 0 })).toThrow(RangeError);
  });
});

describe("checkTheme with short hex colours", () => {
  it("measures a palette written as #rgb the same as its #rrggbb form", () => {
    const long = ["#336699", "#996633", "#339966", "#993366"];
    const short = ["#369", "#963", "#396", "#936"];
    expect(checkTheme({ palette: short })).toEqual(checkTheme({ palette: long }));
  });

  it("measures hsl() and named colours the same as their #rrggbb form", () => {
    const long = ["#336699", "#996633", "#339966", "#993366"];
    expect(checkTheme({ palette: ["hsl(210, 50%, 40%)", "#963", "hsl(150 50% 40%)", "#936"] })).toEqual(
      checkTheme({ palette: long }),
    );
    expect(checkTheme({ territoryLabel: "silver" })).toEqual(checkTheme({ territoryLabel: "#c0c0c0" }));
  });
});
