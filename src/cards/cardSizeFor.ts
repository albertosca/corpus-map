import { estimateText } from "../labels/placement";
import type { MapSpec } from "../shared/spec";

/** How `cardSizeFor` sizes a card: the text the consumer's card shows, and the frame around it. */
export interface CardSizeOptions {
  /** CSS font shorthand with a px size, the font the card's title uses. Default `"16px sans-serif"`. */
  font?: string;
  /** Line height as a multiple of the font size. Default 1.25. */
  lineHeight?: number;
  /** The most lines a title may wrap to; an integer >= 1. Default 2. */
  titleLines?: number;
  /** Lines under the title (a year, a subtitle); an integer >= 0. Default 0. */
  extraLines?: number;
  /** Which label width the card fits, in (0, 1]; 0.9 fits nine titles in ten whole. Default 0.9. */
  percentile?: number;
  /** Pixels on every side of the text. Default 8. */
  padding?: number;
  /** The narrowest frame, padding included. Default 120. */
  minimumWidth?: number;
  /** The widest frame, padding included. Default 240. */
  maximumWidth?: number;
  /** Measures a label on one line; defaults to the library's own estimate (0.6 × the font's px size per character). */
  measure?: (text: string, font: string) => { width: number };
}

/**
 * A card size fitted to the corpus's own labels, to pass as `CorpusMap`'s
 * `cardSize`. The label width at `percentile` (nearest rank) is split over
 * `titleLines`, the frame clamped to `[minimumWidth, maximumWidth]`; the
 * height holds the lines the title then takes plus `extraLines`. A label
 * longer than that is the card renderer's to clamp. Both sides are rounded
 * up to whole pixels; invalid options throw a `RangeError` naming the
 * option.
 */
export function cardSizeFor(spec: MapSpec, options: CardSizeOptions = {}): { width: number; height: number } {
  const {
    font = "16px sans-serif",
    lineHeight = 1.25,
    titleLines = 2,
    extraLines = 0,
    percentile = 0.9,
    padding = 8,
    minimumWidth = 120,
    maximumWidth = 240,
    measure = estimateText,
  } = options;

  const fontPixels = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "");
  ensure(fontPixels > 0, "font", "a font with a px size", font);
  ensure(lineHeight > 0 && lineHeight < Infinity, "lineHeight", "> 0", lineHeight);
  ensure(Number.isInteger(titleLines) && titleLines >= 1, "titleLines", "an integer >= 1", titleLines);
  ensure(Number.isInteger(extraLines) && extraLines >= 0, "extraLines", "an integer >= 0", extraLines);
  ensure(percentile > 0 && percentile <= 1, "percentile", "in (0, 1]", percentile);
  ensure(padding >= 0 && padding < Infinity, "padding", ">= 0", padding);
  ensure(minimumWidth >= 1 && minimumWidth < Infinity, "minimumWidth", ">= 1", minimumWidth);
  ensure(maximumWidth >= minimumWidth && maximumWidth < Infinity, "maximumWidth", ">= minimumWidth", maximumWidth);

  const widths = spec.nodes
    .map((node) => {
      const { width } = measure(node.label, font);
      ensure(Number.isFinite(width), "measure", "a finite width", width);
      return width;
    })
    .sort((left, right) => left - right);
  const labelWidth = widths.length === 0 ? 0 : (widths[Math.ceil(percentile * widths.length) - 1] ?? 0);

  const frame = Math.min(maximumWidth, Math.max(minimumWidth, labelWidth / titleLines + 2 * padding));
  const column = frame - 2 * padding;
  const linesUsed = column > 0 ? Math.max(1, Math.min(titleLines, Math.ceil(labelWidth / column))) : titleLines;
  return {
    width: Math.ceil(frame),
    height: Math.ceil((linesUsed + extraLines) * fontPixels * lineHeight + 2 * padding),
  };
}

function ensure(valid: boolean, option: keyof CardSizeOptions, rule: string, value: unknown): void {
  if (!valid) throw new RangeError(`cardSizeFor: options.${option} must be ${rule}, got ${String(value)}`);
}
