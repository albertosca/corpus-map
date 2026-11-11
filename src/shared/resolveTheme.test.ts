import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, resolveTheme } from "./theme";

const WIDTH_FIELDS = [
  "territoryOutlineWidth",
  "groupOutlineWidth",
  "unvisitedRingWidth",
  "selectionRingWidth",
  "matchRingWidth",
  "neighbourRingWidth",
] as const;

describe("resolveTheme", () => {
  it("returns the default for undefined and for {}", () => {
    expect(resolveTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(resolveTheme({})).toEqual(DEFAULT_THEME);
  });

  it("replaces plain fields and keeps the rest", () => {
    const theme = resolveTheme({ palette: ["#111111", "#eeeeee"], pointRadius: 3 });
    expect(theme.palette).toEqual(["#111111", "#eeeeee"]);
    expect(theme.pointRadius).toBe(3);
    expect(theme.territoryLabel).toBe(DEFAULT_THEME.territoryLabel);
  });

  it("merges territoryFonts field by field", () => {
    const theme = resolveTheme({ territoryFonts: { large: "700 20px serif" } });
    expect(theme.territoryFonts.large).toBe("700 20px serif");
    expect(theme.territoryFonts.medium).toBe(DEFAULT_THEME.territoryFonts.medium);
    expect(theme.territoryFonts.small).toBe(DEFAULT_THEME.territoryFonts.small);
    expect(theme.territoryFonts.compact).toBe(DEFAULT_THEME.territoryFonts.compact);
  });

  it("merges territoryNameStyle: {} keeps the default, a field overrides only itself", () => {
    expect(resolveTheme({ territoryNameStyle: {} }).territoryNameStyle).toEqual({ uppercase: true, spacing: 0.6 });
    expect(resolveTheme({ territoryNameStyle: { uppercase: false } }).territoryNameStyle).toEqual({
      uppercase: false,
      spacing: 0.6,
    });
    expect(resolveTheme({ territoryNameStyle: { spacing: 0 } }).territoryNameStyle).toEqual({
      uppercase: true,
      spacing: 0,
    });
  });

  it("a field present as undefined falls to the default", () => {
    expect(
      resolveTheme({
        pointRadius: undefined,
        territoryNameStyle: undefined,
        territoryFonts: { large: undefined },
        matchRingWidth: undefined,
      }),
    ).toEqual(DEFAULT_THEME);
  });

  it("does not mutate the default", () => {
    const before = JSON.stringify(DEFAULT_THEME);
    resolveTheme({ territoryFonts: { large: "x" }, territoryNameStyle: { uppercase: false } });
    expect(JSON.stringify(DEFAULT_THEME)).toBe(before);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects a width of %s, naming the field", (bad) => {
    for (const field of WIDTH_FIELDS) {
      expect(() => resolveTheme({ [field]: bad })).toThrow(RangeError);
      expect(() => resolveTheme({ [field]: bad })).toThrow(new RegExp(`Theme\\.${field} .*${String(bad)}`));
    }
  });

  it("rejects a width that is not a number", () => {
    expect(() => resolveTheme({ selectionRingWidth: "2" as unknown as number })).toThrow(RangeError);
  });

  it("accepts a small positive width and leaves absent widths absent", () => {
    expect(resolveTheme({ matchRingWidth: 0.5 }).matchRingWidth).toBe(0.5);
    expect(resolveTheme({}).matchRingWidth).toBeUndefined();
  });

  it("expands #rgb colours to #rrggbb, so the painters and checks only meet the long form", () => {
    const theme = resolveTheme({
      palette: ["#f80", "#0A5"],
      territoryLabel: "#abc",
      pointNeutral: "#123",
      focusOutline: "#fff",
      selectionRing: "#000",
      edge: "#9ab",
    });
    expect(theme.palette).toEqual(["#ff8800", "#00aa55"]);
    expect([theme.territoryLabel, theme.pointNeutral, theme.focusOutline, theme.selectionRing, theme.edge]).toEqual([
      "#aabbcc",
      "#112233",
      "#ffffff",
      "#000000",
      "#99aabb",
    ]);
  });

  it("turns hsl(), hsla() and CSS named colours into notations the painters read", () => {
    const theme = resolveTheme({
      palette: ["hsl(0, 100%, 50%)", "hsl(120 100% 25%)", "hsla(240, 100%, 50%, 0.5)"],
      territoryLabel: "rebeccapurple",
      pointNeutral: "RED",
      edge: "aliceblue",
      focusOutline: "yellowgreen",
    });
    expect(theme.palette).toEqual(["#ff0000", "#008000", "rgba(0,0,255,0.5)"]);
    expect([theme.territoryLabel, theme.pointNeutral, theme.edge, theme.focusOutline]).toEqual([
      "#663399",
      "#ff0000",
      "#f0f8ff",
      "#9acd32",
    ]);
  });

  it("knows all 148 CSS named colours, and no other word", () => {
    const named = ["black", "white", "gray", "grey", "darkslategray", "lightgoldenrodyellow", "whitesmoke", "tomato"];
    for (const name of named) expect(resolveTheme({ pointNeutral: name }).pointNeutral).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveTheme({ pointNeutral: "tomato" }).pointNeutral).toBe("#ff6347");
    expect(resolveTheme({ pointNeutral: "lightgoldenrodyellow" }).pointNeutral).toBe("#fafad2");
    expect(resolveTheme({ pointNeutral: "notacolour" }).pointNeutral).toBe("notacolour");
    expect(resolveTheme({ pointNeutral: "transparent" }).pointNeutral).toBe("transparent");
  });

  it("leaves a notation it does not know untouched", () => {
    expect(resolveTheme({ palette: ["#ff8800", "rgb(1,2,3)", "oklch(0.5 0.1 20)", "hsl(nope)"] }).palette).toEqual([
      "#ff8800",
      "rgb(1,2,3)",
      "oklch(0.5 0.1 20)",
      "hsl(nope)",
    ]);
  });
});
