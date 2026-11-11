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
    ["an unparseable entry", ["blue", "#336699"]],
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
