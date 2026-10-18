type Rgba = [number, number, number, number];

/** Parses `rgba(r,g,b,a)`, `rgb(r,g,b)` and `#rrggbb` — the notations the theme uses. */
export function parseColor(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const packed = Number.parseInt(hex[1], 16);
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255, 1];
  }
  const functional = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (!functional?.[1]) throw new Error(`unsupported colour notation: ${color}`);
  const parts = functional[1].split(",").map((part) => Number.parseFloat(part));
  const [red = 0, green = 0, blue = 0, alpha = 1] = parts;
  return [red, green, blue, alpha];
}

/** `top` composited over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  return [
    top[0] * alpha + bottom[0] * (1 - alpha),
    top[1] * alpha + bottom[1] * (1 - alpha),
    top[2] * alpha + bottom[2] * (1 - alpha),
    1,
  ];
}

function luminance([red, green, blue]: Rgba): number {
  const toLinear = (channel: number) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
}

/** WCAG 2.2 contrast ratio between two opaque colours. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}
