import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { resetThemeWarnings, themeKeyOf, warnAboutTheme } from "./devThemeCheck";
import { DARK_THEME, DEFAULT_THEME, type Theme } from "./theme";

declare const process: {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
};

const probe = vi.hoisted(() => ({ calls: 0, failure: undefined as Error | undefined }));

vi.mock("corpus-map/theme-check", async (importOriginal) => {
  const original = await importOriginal<typeof import("corpus-map/theme-check")>();
  return {
    ...original,
    checkTheme: (...parameters: Parameters<typeof original.checkTheme>) => {
      probe.calls += 1;
      if (probe.failure !== undefined) throw probe.failure;
      return original.checkTheme(...parameters);
    },
  };
});

const BAD: Theme = { ...DEFAULT_THEME, territoryLabel: "#d0d0d0" };
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  resetThemeWarnings();
  probe.calls = 0;
  probe.failure = undefined;
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe("warnAboutTheme", () => {
  it("warns once for a theme the checks reject, and the message starts with the library name", async () => {
    warnAboutTheme(BAD);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^corpus-map theme:/);
  });

  it("does not warn again for an equal theme in a new object", async () => {
    warnAboutTheme(BAD);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warnAboutTheme({ ...BAD, palette: [...BAD.palette] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(probe.calls).toBe(1);
  });

  it("warns again for a different bad theme", async () => {
    warnAboutTheme(BAD);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warnAboutTheme({ ...BAD, territoryLabel: "#cccccc" });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
  });

  it("warns nothing for the house themes", async () => {
    warnAboutTheme(DEFAULT_THEME);
    warnAboutTheme(DARK_THEME);
    await vi.waitFor(() => expect(probe.calls).toBe(2), { timeout: 10_000 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("in production neither warns nor loads the checks", async () => {
    vi.stubEnv("NODE_ENV", "production");
    warnAboutTheme(BAD);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warn).not.toHaveBeenCalled();
    expect(probe.calls).toBe(0);
  });

  it("does not throw where there is no `process` at all (native ESM, an import map)", () => {
    vi.stubGlobal("process", undefined);
    try {
      expect(() => warnAboutTheme(BAD)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("swallows a failing check: no warning and no unhandled rejection", async () => {
    probe.failure = new Error("boom");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      warnAboutTheme(BAD);
      await vi.waitFor(() => expect(probe.calls).toBe(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(warn).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("themeKeyOf", () => {
  it("is equal for equal values and differs when a measured value changes", () => {
    expect(themeKeyOf(BAD)).toBe(themeKeyOf({ ...BAD, palette: [...BAD.palette] }));
    expect(themeKeyOf(BAD)).not.toBe(themeKeyOf({ ...BAD, pointRadius: BAD.pointRadius + 1 }));
    expect(themeKeyOf(BAD)).not.toBe(themeKeyOf({ ...BAD, unvisitedRingWidth: 2 }));
  });
});
