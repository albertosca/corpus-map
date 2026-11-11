import { contrastRatio, isSupportedColour, over, parseColor, type Rgba } from "../labels/contrast";
import { DENSE_FILL_FACTOR, DENSE_NAME_ALPHA } from "../shared/presentation";
import { resolveTheme, type ThemeInput } from "../shared/theme";
import { tintDirection } from "../territories/familyColours";
import { TINT_STEPS, tint, tintBand } from "../territories/tint";
import { visitedFactor } from "../territories/visitedFactor";

/** Which accessibility check a problem comes from: the metric numbers of the map-feel spec, plus the extra gates. */
export type ThemeMetric = "15" | "16" | "17" | "focus" | "outline" | "ring" | "palette";

export interface ThemeProblem {
  metric: ThemeMetric;
  /** What was measured, e.g. `#7466a9 as a point over its own fill`. */
  subject: string;
  /** The worst value found for this kind of problem (a contrast ratio, a ΔE00, or a hole in pixels). */
  measured: number;
  /** The bar the value has to reach. */
  required: number;
  /** One readable sentence: what is wrong and what to change. */
  message: string;
}

export interface CheckThemeOptions {
  /** The page colour the map sits on (`#rrggbb` or `rgb()`); by default `#ffffff` for a theme with dark names and `#18181b` for one with light names. */
  page?: string | undefined;
}

const PAGE_FOR_DARK_INK = "#ffffff";
const PAGE_FOR_LIGHT_INK = "#18181b";
const MINIMUM_PALETTE_SIZE = 2;
const MAXIMUM_PALETTE_SIZE = 10;
const MINIMUM_POINT_CONTRAST = 3;
const MINIMUM_NAME_CONTRAST = 4.5;
const MINIMUM_RING_HOLE = 0.5;
const DEFAULT_UNVISITED_RING_WIDTH = 1.5;

const withAlpha = (colour: Rgba, alpha: number): Rgba => [colour[0], colour[1], colour[2], alpha];

/** Keeps the worst case per `metric:kind`, so a failing palette yields a short readable list, not thousands of rows. */
class Findings {
  private readonly worst = new Map<string, ThemeProblem>();

  expectAtLeast(
    metric: ThemeMetric,
    kind: string,
    subject: () => string,
    measured: number,
    required: number,
    advice: string,
  ): void {
    if (measured >= required) return;
    const key = `${metric}:${kind}`;
    const seen = this.worst.get(key);
    if (seen !== undefined && seen.measured <= measured) return;
    const described = subject();
    this.worst.set(key, {
      metric,
      subject: described,
      measured,
      required,
      message: `${described} measures ${measured.toFixed(2)}, needs ${required}. ${advice}`,
    });
  }

  fail(metric: ThemeMetric, subject: string, measured: number, required: number, message: string): void {
    this.worst.set(`${metric}:${subject}`, { metric, subject, measured, required, message });
  }

  get problems(): ThemeProblem[] {
    return [...this.worst.values()];
  }

  get isEmpty(): boolean {
    return this.worst.size === 0;
  }
}

/** The palette and every single colour the checks parse: readable, and the palette opaque with 2 to 10 entries. */
function checkReadable(theme: ReturnType<typeof resolveTheme>, findings: Findings): void {
  const size = theme.palette.length;
  if (size < MINIMUM_PALETTE_SIZE || size > MAXIMUM_PALETTE_SIZE)
    findings.fail(
      "palette",
      `palette of ${size} colours`,
      size,
      size < MINIMUM_PALETTE_SIZE ? MINIMUM_PALETTE_SIZE : MAXIMUM_PALETTE_SIZE,
      `Theme.palette has ${size} colours; give it between ${MINIMUM_PALETTE_SIZE} and ${MAXIMUM_PALETTE_SIZE}.`,
    );
  for (const [index, colour] of theme.palette.entries()) {
    const subject = `palette #${index + 1} (${colour})`;
    if (!isSupportedColour(colour))
      findings.fail("palette", subject, 0, 1, `${subject} is not a #rrggbb, rgb() or rgba() colour; use one of those.`);
    else if (parseColor(colour)[3] !== 1)
      findings.fail(
        "palette",
        subject,
        parseColor(colour)[3],
        1,
        `${subject} is not opaque; a palette colour must have alpha 1, set the fill with territoryFillAlpha.`,
      );
  }
  const single: Array<[string, string | undefined]> = [
    ["territoryLabel", theme.territoryLabel],
    ["pointNeutral", theme.pointNeutral],
    ["focusOutline", theme.focusOutline],
    ["selectionRing", theme.selectionRing],
    ["edge", theme.edge],
  ];
  for (const [field, colour] of single)
    if (colour !== undefined && !isSupportedColour(colour))
      findings.fail(
        "palette",
        `Theme.${field} (${colour})`,
        0,
        1,
        `Theme.${field} (${colour}) is not a #rrggbb, rgb() or rgba() colour; use one of those.`,
      );
}

/**
 * Measures a theme against the accessibility metrics the library holds its own themes to (spec consumer-styles §4).
 * Pure and advisory: an empty list means every check passed; nothing here throws except an unreadable `page`.
 */
export function checkTheme(input: ThemeInput, options: CheckThemeOptions = {}): ThemeProblem[] {
  const theme = resolveTheme(input);
  if (options.page !== undefined && !isSupportedColour(options.page))
    throw new RangeError(`checkTheme: page ${options.page} is not a #rrggbb or rgb() colour`);
  const findings = new Findings();
  checkReadable(theme, findings);
  // Colour maths on a colour that cannot be read would be NaN: report what is unreadable and stop.
  if (!findings.isEmpty) return findings.problems;

  const hole = theme.pointRadius - (theme.unvisitedRingWidth ?? DEFAULT_UNVISITED_RING_WIDTH);
  findings.expectAtLeast(
    "ring",
    "hole",
    () => `the unvisited ring's hole (pointRadius ${theme.pointRadius} minus its width)`,
    hole,
    MINIMUM_RING_HOLE,
    "Raise pointRadius or lower unvisitedRingWidth, or an unvisited point reads as a filled one.",
  );

  const direction = tintDirection(theme);
  const page = parseColor(options.page ?? (direction === 1 ? PAGE_FOR_LIGHT_INK : PAGE_FOR_DARK_INK));
  const band = tintBand(theme.palette, direction);
  const tints = theme.palette.flatMap((colour) => TINT_STEPS.map((step) => tint(colour, step, direction, band)));
  const label = parseColor(theme.territoryLabel);
  // The strongest fill a fully visited territory reaches; only names are drawn there (the boost fades as points fade in).
  const strongest = theme.territoryFillAlpha * visitedFactor(1);
  const fillAlphas = [theme.territoryFillAlpha, theme.territoryFillAlpha * DENSE_FILL_FACTOR];
  /** The page, bare or under one colour's fill: every background a point or a name can sit on. */
  const beneath = (colours: readonly string[], alpha: number): Rgba[] => [
    page,
    ...colours.map((colour) => over(withAlpha(parseColor(colour), alpha), page)),
  ];
  const outlines: Array<[string, string]> = [
    ["the keyboard focus outline", theme.focusOutline],
    ["the selection ring", theme.selectionRing ?? theme.territoryLabel],
    ["an edge line", theme.edge ?? theme.territoryLabel],
  ];

  for (const fillAlpha of fillAlphas) {
    for (const background of beneath(theme.palette, fillAlpha))
      for (const colour of [...theme.palette, theme.pointNeutral])
        findings.expectAtLeast(
          "15",
          "point",
          () => `${colour} as a point over a fill of ${fillAlpha.toFixed(3)}`,
          contrastRatio(parseColor(colour), background),
          MINIMUM_POINT_CONTRAST,
          "Darken (light page) or lighten (dark page) that colour, or lower territoryFillAlpha.",
        );
    for (const background of beneath(tints, fillAlpha)) {
      for (const colour of tints)
        findings.expectAtLeast(
          "15",
          "tint",
          () => `family tint ${colour} as a point over a fill of ${fillAlpha.toFixed(3)}`,
          contrastRatio(parseColor(colour), background),
          MINIMUM_POINT_CONTRAST,
          "A family's tints come from its palette colour: move that colour away from the page colour.",
        );
      if (fillAlpha === theme.territoryFillAlpha)
        findings.expectAtLeast(
          "16",
          "name-tint",
          () => `the territory name colour over a family tint's fill of ${fillAlpha.toFixed(3)}`,
          contrastRatio(over(label, background), background),
          MINIMUM_NAME_CONTRAST,
          "Move territoryLabel further from the palette colours, or lower territoryFillAlpha.",
        );
      for (const [name, colour] of outlines)
        findings.expectAtLeast(
          "15",
          `outline ${name}`,
          () => `${name} (${colour}) over a family tint`,
          contrastRatio(parseColor(colour), background),
          MINIMUM_POINT_CONTRAST,
          "Pick a colour with more contrast against the palette and its tints.",
        );
    }
  }

  // Names: guided, visited ceiling and dense, over every palette colour.
  for (const alpha of [theme.territoryFillAlpha, strongest])
    for (const background of beneath(theme.palette, alpha))
      findings.expectAtLeast(
        "16",
        "name",
        () => `the territory name colour over a fill of ${alpha.toFixed(3)}`,
        contrastRatio(over(label, background), background),
        MINIMUM_NAME_CONTRAST,
        "Move territoryLabel further from the palette colours, or lower territoryFillAlpha.",
      );
  for (const background of beneath(theme.palette, theme.territoryFillAlpha * DENSE_FILL_FACTOR))
    findings.expectAtLeast(
      "16",
      "name-dense",
      () => "the muted territory name colour in the dense presentation",
      contrastRatio(over(withAlpha(label, label[3] * DENSE_NAME_ALPHA), background), background),
      MINIMUM_NAME_CONTRAST,
      "Move territoryLabel further from the page and the palette colours.",
    );
  for (const colour of [...theme.palette, ...tints]) {
    const background = over(withAlpha(parseColor(colour), strongest), page);
    findings.expectAtLeast(
      "16",
      "name-visited",
      () => `the territory name colour over ${colour} at the visited ceiling (${strongest.toFixed(3)})`,
      contrastRatio(over(label, background), background),
      MINIMUM_NAME_CONTRAST,
      "Move territoryLabel further from the palette colours, or lower territoryFillAlpha.",
    );
  }
  return findings.problems;
}
