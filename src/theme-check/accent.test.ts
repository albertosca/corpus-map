import { describe, expect, it } from "vitest";
import { DARK_THEME, DEFAULT_THEME } from "../shared/theme";
import { chromaticSeparation, MINIMUM_HUE_DISTANCE } from "./accent";
import { checkTheme } from "./checkTheme";

const accentSubjects = (input: Parameters<typeof checkTheme>[0]): string =>
  checkTheme(input)
    .filter((problem) => problem.metric === "accent")
    .map((problem) => problem.subject)
    .join(" | ");

describe("accent metric", () => {
  it("passes both house themes", () => {
    expect(accentSubjects(DEFAULT_THEME)).toBe("");
    expect(accentSubjects(DARK_THEME)).toBe("");
  });

  it("agrees with the skill's validator on the house numbers", () => {
    // Pinned from `bun ~/.claude/skills/two-tone-accent/scripts/check_palette.ts` on the palette document (exit 0):
    // accent over ground in the light theme is the validator's one conditional pair, and colour vision holds.
    expect(accentSubjects({ tones: { accent: "#f26b1d" } })).toBe("");
    expect(chromaticSeparation("#f26b1d", "#f1f3f6", "protanopia")).toBeGreaterThan(8);
    expect(chromaticSeparation("#ff8a3d", "#0f141b", "tritanopia")).toBeGreaterThan(8);
  });

  it("fails a red accent on a green base through colour vision", () => {
    expect(accentSubjects({ tones: { secondBase: "#1e3a2a", accent: "#d02020", accentText: "#a01010" } })).toMatch(
      /colour-vision/,
    );
  });

  it("fails an accent that a territory colour matches, through the palette check", () => {
    // A consumer palette holding the accent itself: no colour-vision mode can tell them apart.
    expect(accentSubjects({ palette: ["#f26b1d", "#141b26"] })).toMatch(
      /colour difference \(protanopia\) between accent and #f26b1d/,
    );
    expect(accentSubjects(DEFAULT_THEME)).not.toMatch(/colour difference/);
  });

  it("fails an accent with too little chroma", () => {
    expect(accentSubjects({ tones: { accent: "#8a8f98", accentText: "#4a4f58" } })).toMatch(/chroma/);
  });

  it("fails an accent too close in hue to the second base", () => {
    expect(accentSubjects({ tones: { secondBase: "#3a2a1e", accent: "#f26b1d" } })).toMatch(/hue distance/);
    expect(MINIMUM_HUE_DISTANCE).toBe(120);
  });

  it("fails an accentText below 4.5:1 on the ground", () => {
    expect(accentSubjects({ tones: { accentText: "#f26b1d" } })).toMatch(/accentText on ground/);
  });

  it("keeps the validator's one allowed exception: the light accent fill on the ground at 2.74", () => {
    expect(accentSubjects(DEFAULT_THEME)).not.toMatch(/accent on ground/);
    expect(accentSubjects({ tones: { accent: "#f7a27a" } })).toMatch(/accent on ground/);
  });

  it("fails bases of the same lightness", () => {
    expect(accentSubjects({ tones: { secondBase: "#e0e4ea" } })).toMatch(/lightness gap/);
  });
});
