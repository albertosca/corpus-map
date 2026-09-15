import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type Theme } from "../src/index";

describe("package exports", () => {
  it("exposes DEFAULT_THEME and the Theme type from the package root", () => {
    const theme: Theme = DEFAULT_THEME;
    expect(theme.pointRadius).toBeGreaterThan(0);
  });
});
