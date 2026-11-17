import { describe, expect, it } from "vitest";
import { DARK_THEME, DEFAULT_THEME, resolveTheme } from "./theme";
import { DARK_TONES, DEFAULT_TONES, themeFromTones } from "./tones";

describe("tones", () => {
  it("names the eight roles of the house themes", () => {
    expect(Object.keys(DEFAULT_TONES).sort()).toEqual([
      "accent",
      "accentText",
      "ground",
      "ink",
      "muted",
      "onAccent",
      "secondBase",
      "surface",
    ]);
    expect(Object.keys(DARK_TONES).sort()).toEqual(Object.keys(DEFAULT_TONES).sort());
    expect(DEFAULT_TONES.accent).toBe("#f26b1d");
    expect(DARK_TONES.accentText).toBe("#ff9e5e");
  });

  it("derives every role-driven field of the light theme", () => {
    const derived = themeFromTones(DEFAULT_TONES);
    expect({
      territoryLabel: derived.territoryLabel,
      pointNeutral: derived.pointNeutral,
      cardBackground: derived.cardBackground,
      cardBorder: derived.cardBorder,
      hoverBackground: derived.hoverBackground,
      hoverText: derived.hoverText,
      selectionRing: derived.selectionRing,
      focusOutline: derived.focusOutline,
      edge: derived.edge,
    }).toEqual({
      territoryLabel: "#141b26",
      pointNeutral: "#4f5b6b",
      cardBackground: "#ffffff",
      cardBorder: "rgba(20,27,38,0.45)",
      hoverBackground: "#1e2a3a",
      hoverText: "#ffffff",
      selectionRing: "#a8400a",
      focusOutline: "#141b26",
      edge: "#4f5b6b",
    });
  });

  it("derives four slate steps from ground toward ink, hue-free", () => {
    expect(themeFromTones(DEFAULT_TONES).palette).toEqual(["#6c7179", "#51565f", "#353b45", "#141b26"]);
    expect(themeFromTones(DARK_TONES).palette).toEqual(["#7c8188", "#979ca3", "#b7bcc3", "#e8edf4"]);
  });

  it("follows the roles: a warmer ground moves every step and the last one stays the ink", () => {
    const steps = themeFromTones({ ...DEFAULT_TONES, ground: "#f6f1ea" }).palette;
    expect(steps).not.toEqual(themeFromTones(DEFAULT_TONES).palette);
    expect(steps[steps.length - 1]).toBe(DEFAULT_TONES.ink);
  });

  it("lets a consumer palette beat the slate steps, and tones alone move them", () => {
    expect(resolveTheme({ palette: ["#112233", "#445566"] }).palette).toEqual(["#112233", "#445566"]);
    expect(resolveTheme({ tones: { ink: "#000000" } }).palette[3]).toBe("#000000");
    expect(resolveTheme({ palette: ["#112233", "#445566"], tones: { ink: "#000000" } }).palette).toEqual([
      "#112233",
      "#445566",
    ]);
  });

  it("derives the dark theme from the dark roles", () => {
    const derived = themeFromTones(DARK_TONES);
    expect(derived.territoryLabel).toBe("#e8edf4");
    expect(derived.hoverBackground).toBe("#c9d3e0");
    expect(derived.hoverText).toBe("#18202b");
    expect(derived.selectionRing).toBe("#ff9e5e");
    expect(derived.cardBorder).toBe("rgba(232,237,244,0.45)");
  });

  it("makes DEFAULT_THEME and DARK_THEME the derivation of their tones", () => {
    expect(DEFAULT_THEME.tones).toEqual(DEFAULT_TONES);
    expect(DARK_THEME.tones).toEqual(DARK_TONES);
    expect(DARK_THEME.territoryLabel).toBe(DARK_TONES.ink);
    expect(DEFAULT_THEME.selectionRing).toBe(DEFAULT_TONES.accentText);
  });

  it("lets a role reach every field derived from it", () => {
    const theme = resolveTheme({ tones: { accentText: "#112233" } });
    expect(theme.selectionRing).toBe("#112233");
    expect(theme.tones.accent).toBe(DEFAULT_TONES.accent);
    expect(theme.territoryLabel).toBe(DEFAULT_TONES.ink);
  });

  it("lets an explicit field beat its role", () => {
    const theme = resolveTheme({ tones: { accentText: "#112233" }, selectionRing: "#445566" });
    expect(theme.selectionRing).toBe("#445566");
  });

  it("takes the dark house theme underneath with base: dark", () => {
    const theme = resolveTheme({ base: "dark", tones: { accentText: "#abcdef" } });
    expect(theme.territoryLabel).toBe(DARK_TONES.ink);
    expect(theme.selectionRing).toBe("#abcdef");
    expect(theme.palette).toEqual(DARK_THEME.palette);
    expect(resolveTheme({ base: "dark" })).toEqual(DARK_THEME);
  });

  it("accepts a whole house theme as input, as the recipes pass it", () => {
    expect(resolveTheme(DARK_THEME)).toEqual(DARK_THEME);
    expect(resolveTheme(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
  });

  it("normalises role colours the way other colours are", () => {
    expect(resolveTheme({ tones: { ink: "#123" } }).tones.ink).toBe("#112233");
    expect(resolveTheme({ tones: { ink: "#123" } }).territoryLabel).toBe("#112233");
  });

  it("does not let undefined roles overwrite the house ones", () => {
    expect(resolveTheme({ tones: { accent: undefined } }).tones).toEqual(DEFAULT_TONES);
  });

  it("rejects an unreadable role colour and an unknown role by name", () => {
    expect(() => resolveTheme({ tones: { ink: "nope" } })).toThrow(
      new RangeError('Theme.tones.ink: "nope" is not a colour corpus-map can read'),
    );
    expect(() => resolveTheme({ tones: { inkk: "#000000" } as never })).toThrow(
      new RangeError('Theme.tones has no role "inkk"'),
    );
  });

  it("rejects a role that is not a string, from a JS or JSON consumer, with a RangeError naming it", () => {
    expect(() => resolveTheme({ tones: { accent: 42 } as never })).toThrow(
      new RangeError("Theme.tones.accent: 42 is not a colour corpus-map can read"),
    );
    expect(() => resolveTheme({ tones: { accent: null } as never })).toThrow(
      new RangeError("Theme.tones.accent: null is not a colour corpus-map can read"),
    );
  });
});
