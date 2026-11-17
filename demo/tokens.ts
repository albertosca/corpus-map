import { DARK_TONES, DEFAULT_TONES, type Tones, withAlpha } from "../src/shared/tones";

/**
 * Every colour the demo paints, light and dark. The eight roles are the library's own `Tones` of the house themes,
 * so the demo wears the look it ships: two bases, ink, muted, and one accent. The rest is derived from them
 * (a translucent panel, borders, a shadow). Components read them as CSS variables (`token("ink")` → `var(--ink)`),
 * and `tokenStylesheet()` defines the variables for both schemes, switched by `prefers-color-scheme`.
 * `demo/tokens.test.ts` keeps any other colour literal out of the demo.
 */
const role = (name: keyof Tones) => ({ light: DEFAULT_TONES[name], dark: DARK_TONES[name] });

const derived = (name: keyof Tones, lightAlpha: number, darkAlpha: number) => ({
  light: withAlpha(DEFAULT_TONES[name], lightAlpha),
  dark: withAlpha(DARK_TONES[name], darkAlpha),
});

export const TOKENS = {
  ground: role("ground"),
  surface: role("surface"),
  secondBase: role("secondBase"),
  ink: role("ink"),
  muted: role("muted"),
  accent: role("accent"),
  onAccent: role("onAccent"),
  accentText: role("accentText"),
  panel: derived("surface", 0.92, 0.92),
  borderStrong: derived("ink", 0.2, 0.28),
  borderMedium: derived("ink", 0.15, 0.2),
  border: derived("ink", 0.1, 0.14),
  divider: derived("ink", 0.06, 0.06),
  shadow: { light: "rgba(0,0,0,0.08)", dark: "rgba(0,0,0,0.5)" },
};

export type TokenName = keyof typeof TOKENS;

function variableName(name: TokenName): string {
  return `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

export function token(name: TokenName): string {
  return `var(${variableName(name)})`;
}

/**
 * The one accent fill of the demo's screen: the "Show on map" button of the library's search box while results show
 * and nothing is selected (the selected item's dot is the spot afterwards). The box is the library's, so it carries
 * neither a class nor a data attribute: the demo marks the wrapper and this rule reaches the one button that has no
 * `aria-label` (Clear search has one). `!important` because the box styles its controls inline.
 */
export const ACCENT_SPOT_RULE = `[data-accent-spot="on"] search button:not([aria-label]) {
  background: var(--accent) !important;
  color: var(--on-accent) !important;
  border-color: transparent !important;
}
`;

export function tokenStylesheet(): string {
  const block = (scheme: "light" | "dark") =>
    (Object.keys(TOKENS) as TokenName[]).map((name) => `  ${variableName(name)}: ${TOKENS[name][scheme]};`).join("\n");
  return `:root {\n${block("light")}\n}\n@media (prefers-color-scheme: dark) {\n:root {\n${block("dark")}\n}\n}\n${ACCENT_SPOT_RULE}`;
}
