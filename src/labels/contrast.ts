type Rgba = [number, number, number, number];

/** Parses `rgba(r,g,b,a)`, `rgb(r,g,b)` and `#rrggbb` — the notations the theme uses. */
export function parseColor(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (!fn?.[1]) throw new Error(`unsupported colour notation: ${color}`);
  const parts = fn[1].split(",").map((p) => Number.parseFloat(p));
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return [r, g, b, a];
}

/** `top` composited over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.2 contrast ratio between two opaque colours. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
