import { contrastRatio, parseColor } from "../labels/contrast";
import type { Tones } from "../shared/tones";
import { toOklab } from "../territories/tint";
import type { Findings } from "./checkTheme";
import { ciede2000, simulate, type VisionMode } from "./colourVision";

/**
 * The shape and contrast rules of the two-tone-accent skill's validator (`check_palette.ts`, measured in the
 * 2026-11-13 spike), kept here so `checkTheme` and the validator agree by construction: the opposite accent sits at
 * least 120 degrees of OKLCH hue from the second base with at least twice its chroma, and a colour-vision
 * deficiency still sees it as another colour (the chromatic OKLab distance, times 100, against the bases).
 */
export const MINIMUM_HUE_DISTANCE = 120;
export const MINIMUM_CHROMA_RATIO = 2;
export const MINIMUM_BASE_LIGHTNESS_GAP = 0.35;
export const MINIMUM_CHROMATIC_SEPARATION = 8;
/** CIEDE2000 between the accent and every palette colour, in each vision mode (the bar of metric 17). */
export const MINIMUM_ACCENT_DELTA = 9;
/** The validator's one allowed exception: the light accent fill on the ground, which keeps its 3:1 through the ring. */
export const ACCENT_ON_GROUND_FLOOR = 2.5;

const DEFICIENCIES: VisionMode[] = ["protanopia", "deuteranopia", "tritanopia"];

/** `[foreground, background, minimum]`: 4.5 for text, 3 for graphics (WCAG 2.x). */
const REQUIRED_PAIRS: Array<[keyof Tones, keyof Tones, number]> = [
  ["ink", "ground", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "ground", 4.5],
  ["muted", "surface", 4.5],
  ["surface", "secondBase", 4.5],
  ["onAccent", "accent", 4.5],
  ["accentText", "ground", 4.5],
  ["accentText", "surface", 4.5],
  ["accent", "surface", 3],
];

function oklch(colour: string): { lightness: number; chroma: number; hue: number } {
  const [red, green, blue] = parseColor(colour);
  const [lightness, greenRed, blueYellow] = toOklab(red, green, blue);
  return {
    lightness,
    chroma: Math.hypot(greenRed, blueYellow),
    hue: ((Math.atan2(blueYellow, greenRed) * 180) / Math.PI + 360) % 360,
  };
}

function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Chromatic OKLab distance (a and b only, times 100) between two colours as `mode` sees them. */
export function chromaticSeparation(first: string, second: string, mode: VisionMode): number {
  const [firstRed, firstGreen, firstBlue] = simulate(parseColor(first), mode);
  const [secondRed, secondGreen, secondBlue] = simulate(parseColor(second), mode);
  const [, firstGreenRed, firstBlueYellow] = toOklab(firstRed, firstGreen, firstBlue);
  const [, secondGreenRed, secondBlueYellow] = toOklab(secondRed, secondGreen, secondBlue);
  return 100 * Math.hypot(firstGreenRed - secondGreenRed, firstBlueYellow - secondBlueYellow);
}

/** Metric "accent": the eight roles hold the two-tone-accent contract (shape, contrast pairs, colour vision). */
export function checkAccent(tones: Tones, palette: readonly string[], findings: Findings): void {
  const ground = oklch(tones.ground);
  const secondBase = oklch(tones.secondBase);
  const accent = oklch(tones.accent);
  const advice = "See docs/styling.md, Two tones and one accent.";

  findings.expectAtLeast(
    "accent",
    "lightness",
    () => "the lightness gap between ground and secondBase",
    Math.abs(ground.lightness - secondBase.lightness),
    MINIMUM_BASE_LIGHTNESS_GAP,
    `One base has to be light and the other dark. ${advice}`,
  );
  findings.expectAtLeast(
    "accent",
    "hue",
    () => "the hue distance between accent and secondBase (degrees)",
    hueDistance(secondBase.hue, accent.hue),
    MINIMUM_HUE_DISTANCE,
    `Move the accent to the other side of the colour wheel from secondBase. ${advice}`,
  );
  findings.expectAtLeast(
    "accent",
    "chroma",
    () => "the chroma ratio of accent over secondBase",
    accent.chroma / Math.max(secondBase.chroma, 0.005),
    MINIMUM_CHROMA_RATIO,
    `The accent has to be at least twice as saturated as secondBase. ${advice}`,
  );

  for (const [foreground, background, minimum] of REQUIRED_PAIRS)
    findings.expectAtLeast(
      "accent",
      `${foreground}/${background}`,
      () => `${foreground} on ${background}`,
      contrastRatio(parseColor(tones[foreground]), parseColor(tones[background])),
      minimum,
      `Change ${foreground} or ${background}. ${advice}`,
    );
  findings.expectAtLeast(
    "accent",
    "accent/ground",
    () => "accent on ground",
    contrastRatio(parseColor(tones.accent), parseColor(tones.ground)),
    ACCENT_ON_GROUND_FLOOR,
    `The accent fill needs 2.5:1 on the ground (3:1 is carried by the ring in accentText). ${advice}`,
  );

  for (const mode of DEFICIENCIES) {
    for (const neighbour of ["ground", "surface", "secondBase"] as const)
      findings.expectAtLeast(
        "accent",
        `colour-vision ${neighbour}`,
        () => `the colour-vision distance (${mode}) between accent and ${neighbour}`,
        chromaticSeparation(tones.accent, tones[neighbour], mode),
        MINIMUM_CHROMATIC_SEPARATION,
        `The accent has to stay another colour, not just another tone, for ${mode}. ${advice}`,
      );
    const seen = simulate(parseColor(tones.accent), mode);
    for (const colour of palette)
      findings.expectAtLeast(
        "accent",
        "colour-vision palette",
        () => `the colour difference (${mode}) between accent and ${colour}`,
        ciede2000(seen, simulate(parseColor(colour), mode)),
        MINIMUM_ACCENT_DELTA,
        `The accent has to stay apart from every territory colour. ${advice}`,
      );
  }
}
