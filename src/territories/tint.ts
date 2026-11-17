import { parseColor } from "../labels/contrast";

/** Lightness offsets in OKLab, one per sibling slot (spec slice E §5). */
export const TINT_STEPS = [0, 0.07, 0.14, 0.21, 0.28] as const;

const toLinear = (channel: number) => {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number) => {
  const clamped = Math.min(1, Math.max(0, channel));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
};

export function toOklab(red: number, green: number, blue: number): [number, number, number] {
  const [linearRed, linearGreen, linearBlue] = [toLinear(red), toLinear(green), toLinear(blue)];
  const long = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue);
  const medium = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue);
  const short = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue);
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
}

function fromOklab(lightness: number, greenRed: number, blueYellow: number): [number, number, number] {
  const long = (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3;
  const medium = (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3;
  const short = (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3;
  return [
    fromLinear(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    fromLinear(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    fromLinear(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

const hex = (channels: readonly number[]) =>
  `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/** OKLab lightness limits for any tint: past the ceiling a tint washes out the points drawn over its fill on a dark page. */
export const TINT_FLOOR = 0.05;
export const TINT_CEILING = 0.78;
/** Kept between a tint and the palette's extreme on the page's side: hue moves luminance a little at equal lightness. */
export const TINT_MARGIN = 0.02;

/** OKLab lightness of `colour`. */
export function lightness(colour: string): number {
  const [red, green, blue] = parseColor(colour);
  return toOklab(red, green, blue)[0];
}

/**
 * The lightness band family tints may use: from the palette's own extreme on
 * the page's side (every palette colour already passes metric 15) to the
 * limit on the label's side, so no tint ends up closer to the page than the
 * palette colour nearest to it.
 */
export function tintBand(palette: readonly string[], direction: 1 | -1): readonly [number, number] {
  const values = palette.map(lightness);
  return direction > 0
    ? [Math.min(...values) + TINT_MARGIN, TINT_CEILING]
    : [TINT_FLOOR, Math.max(...values) - TINT_MARGIN];
}

const LARGEST_STEP = TINT_STEPS[TINT_STEPS.length - 1] as number;

/**
 * `colour` moved `step` in OKLab lightness towards `direction` (1 lighter,
 * -1 darker) inside `band`; when that side has less room than the largest
 * step, the side with more room is used and every step is scaled into it, so
 * siblings stay distinct and ordered. Chroma shrinks as lightness nears
 * either end so the result stays in gamut; a colour's alpha is dropped.
 * Step 0 returns the colour as `#rrggbb`.
 */
export function tint(
  colour: string,
  step: number,
  direction: 1 | -1,
  band: readonly [number, number] = [TINT_FLOOR, TINT_CEILING],
): string {
  const [red, green, blue] = parseColor(colour);
  if (step === 0) return hex([red, green, blue]);
  const [floor, ceiling] = band;
  const [current, greenRed, blueYellow] = toOklab(red, green, blue);
  const upward = Math.max(0, ceiling - current);
  const downward = Math.max(0, current - floor);
  const preferred = direction > 0 ? upward : downward;
  const other = direction > 0 ? downward : upward;
  const side = preferred >= LARGEST_STEP || preferred >= other ? direction : -direction;
  const room = side === direction ? preferred : other;
  const target = current + side * step * Math.min(1, room / LARGEST_STEP);
  const chroma = Math.min(1, Math.min(target, 1 - target) / Math.max(Math.min(current, 1 - current), 1e-6));
  return hex(fromOklab(target, greenRed * chroma, blueYellow * chroma));
}
