import { isSupportedColour, parseColor } from "../labels/contrast";
import { normaliseColour } from "./colourNotation";
import type { Theme } from "./theme";

/** The eight colour roles of the two-tone-accent look: two bases, ink, muted, and one accent with its text variants. */
export interface Tones {
  /** The page: the light base in a light theme, the dark base in a dark one. */
  ground: string;
  /** Cards, the top bar, the legend. */
  surface: string;
  /** The other base: the tooltip and the bottom strip. */
  secondBase: string;
  /** Names, outlines, the keyboard focus. */
  ink: string;
  /** Points, edges and secondary text. */
  muted: string;
  /** The one fill that stands out: the selected item's dot. */
  accent: string;
  /** Text and icons on an `accent` fill. */
  onAccent: string;
  /** The accent as text, a ring or a link: it keeps 4.5:1 on `ground` and `surface`. */
  accentText: string;
}

export const DEFAULT_TONES: Tones = {
  ground: "#f1f3f6",
  surface: "#ffffff",
  secondBase: "#1e2a3a",
  ink: "#141b26",
  muted: "#4f5b6b",
  accent: "#f26b1d",
  onAccent: "#1a0e05",
  accentText: "#a8400a",
};

export const DARK_TONES: Tones = {
  ground: "#0f141b",
  surface: "#18202b",
  secondBase: "#c9d3e0",
  ink: "#e8edf4",
  muted: "#a3afbf",
  accent: "#ff8a3d",
  onAccent: "#1a0e05",
  accentText: "#ff9e5e",
};

export const TONE_ROLES = Object.keys(DEFAULT_TONES) as Array<keyof Tones>;

/** The border of a card: the ink at 45% alpha, the same weight the previous default carried. */
const CARD_BORDER_ALPHA = 0.45;

function withAlpha(colour: string, alpha: number): string {
  const [red, green, blue] = parseColor(colour);
  return `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha})`;
}

/**
 * `input` laid over `base`, role by role. An unknown role or a colour this library cannot read is a
 * `RangeError` naming it (a `#rgb`, `hsl()` or CSS name is turned into `#rrggbb` first), and a role present
 * as `undefined` keeps the base's.
 */
export function mergeTones(base: Tones, input: { [Role in keyof Tones]?: string | undefined } | undefined): Tones {
  const merged: Tones = { ...base };
  for (const [role, colour] of Object.entries(input ?? {})) {
    if (!(TONE_ROLES as string[]).includes(role)) throw new RangeError(`Theme.tones has no role "${role}"`);
    if (colour === undefined) continue;
    const normalised = normaliseColour(colour);
    if (!isSupportedColour(normalised))
      throw new RangeError(`Theme.tones.${role}: "${colour}" is not a colour corpus-map can read`);
    merged[role as keyof Tones] = normalised;
  }
  return merged;
}

/** The `Theme` fields a role decides (spec two-tone §3.2). */
export type ToneDerived = Pick<
  Theme,
  | "tones"
  | "territoryLabel"
  | "pointNeutral"
  | "cardBackground"
  | "cardBorder"
  | "hoverBackground"
  | "hoverText"
  | "selectionRing"
  | "focusOutline"
  | "edge"
>;

/** Every `Theme` field a role decides, from the roles alone. */
export function themeFromTones(tones: Tones): ToneDerived {
  return {
    tones,
    territoryLabel: tones.ink,
    pointNeutral: tones.muted,
    cardBackground: tones.surface,
    cardBorder: withAlpha(tones.ink, CARD_BORDER_ALPHA),
    hoverBackground: tones.secondBase,
    hoverText: tones.surface,
    selectionRing: tones.accentText,
    focusOutline: tones.ink,
    edge: tones.muted,
  };
}
