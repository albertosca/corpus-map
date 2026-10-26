import { estimateText } from "../labels/placement";
import type { MapSpec } from "../shared/spec";
import { CARD_BORDER_WIDTH, CARD_STRIPE_WIDTH } from "./CardOverlay";

// The card frame is border-box, so its borders come out of the size `CorpusMap` is given.
const BORDER_ACROSS = CARD_STRIPE_WIDTH + CARD_BORDER_WIDTH;
const BORDER_DOWN = 2 * CARD_BORDER_WIDTH;

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
  /** Pixels on every side of the text; must leave a text column at `maximumWidth`. Default 8. */
  padding?: number;
  /** The narrowest frame, padding and borders included. Default 120. */
  minimumWidth?: number;
  /** The widest frame, padding and borders included. Default 240. */
  maximumWidth?: number;
  /** Measures a label on one line; defaults to the library's own estimate (0.6 × the font's px size per character). */
  measure?: (text: string, font: string) => { width: number };
}

/**
 * A card size fitted to the corpus's own labels, to pass as `CorpusMap`'s
 * `cardSize`. The label width at `percentile` (nearest rank) is split over
 * `titleLines`, the frame clamped to `[minimumWidth, maximumWidth]`; the
 * height holds the lines the title then takes plus `extraLines`. Both sides
 * include the padding and the card frame's borders (a 4 px stripe and 1 px
 * across, 1 px top and bottom), so the renderer's own box is the padded text
 * column. A label longer than that is the card renderer's to clamp. Both sides are rounded
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

  // A CSS length followed by its unit, standing on its own: "16px", ".5px", "16PX/1.2"; never "1e2px".
  const fontPixels = Number.parseFloat(/(?:^|\s)(\d*\.?\d+)px(?=[\s/]|$)/i.exec(font)?.[1] ?? "");
  ensure(fontPixels > 0, "font", "a font with a px size", font);
  ensure(lineHeight > 0 && lineHeight < Infinity, "lineHeight", "> 0", lineHeight);
  ensure(Number.isInteger(titleLines) && titleLines >= 1, "titleLines", "an integer >= 1", titleLines);
  ensure(Number.isInteger(extraLines) && extraLines >= 0, "extraLines", "an integer >= 0", extraLines);
  ensure(percentile > 0 && percentile <= 1, "percentile", "in (0, 1]", percentile);
  ensure(padding >= 0 && padding < Infinity, "padding", ">= 0", padding);
  ensure(minimumWidth >= 1 && minimumWidth < Infinity, "minimumWidth", ">= 1", minimumWidth);
  ensure(maximumWidth >= minimumWidth && maximumWidth < Infinity, "maximumWidth", ">= minimumWidth", maximumWidth);
  ensure(maximumWidth - 2 * padding - BORDER_ACROSS > 0, "padding", "small enough to leave a text column", padding);

  const widths = spec.nodes
    .map((node) => {
      const { width } = measure(node.label, font);
      ensure(Number.isFinite(width), "measure", "a finite width", width);
      return width;
    })
    .sort((left, right) => left - right);
  // Nearest rank, less a hair: 0.07 × 100 is 7.000000000000001 in floating point.
  const rank = Math.max(1, Math.ceil(percentile * widths.length - 1e-9));
  const labelWidth = widths[rank - 1] ?? 0;

  const chrome = 2 * padding + BORDER_ACROSS;
  const frame = Math.min(maximumWidth, Math.max(minimumWidth, labelWidth / titleLines + chrome));
  const column = frame - chrome;
  // The padding guard leaves `column` positive unless the label is empty, which takes one line.
  const linesUsed = labelWidth === 0 ? 1 : Math.max(1, Math.min(titleLines, Math.ceil(labelWidth / column)));
  return {
    width: Math.ceil(frame),
    height: Math.ceil((linesUsed + extraLines) * fontPixels * lineHeight + 2 * padding + BORDER_DOWN),
  };
}

function ensure(valid: boolean, option: keyof CardSizeOptions, rule: string, value: unknown): void {
  if (!valid) throw new RangeError(`cardSizeFor: options.${option} must be ${rule}, got ${String(value)}`);
}
