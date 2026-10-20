/**
 * Every colour the demo paints, light and dark. Components read them as CSS
 * variables (`token("text")` → `var(--text)`), and `tokenStylesheet()` defines
 * the variables for both schemes, switched by `prefers-color-scheme`.
 * `demo/tokens.test.ts` keeps any other colour literal out of the demo.
 */
export const TOKENS = {
  page: { light: "#f7f7f8", dark: "#111114" },
  text: { light: "#1a1d23", dark: "#ececf1" },
  textMuted: { light: "#555b66", dark: "#a0a6b4" },
  surfaceSolid: { light: "#ffffff", dark: "#1c1c20" },
  surface: { light: "rgba(255,255,255,0.92)", dark: "rgba(28,28,32,0.92)" },
  borderStrong: { light: "rgba(0,0,0,0.2)", dark: "rgba(255,255,255,0.28)" },
  borderMedium: { light: "rgba(0,0,0,0.15)", dark: "rgba(255,255,255,0.2)" },
  border: { light: "rgba(0,0,0,0.10)", dark: "rgba(255,255,255,0.14)" },
  divider: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.06)" },
  shadow: { light: "rgba(0,0,0,0.08)", dark: "rgba(0,0,0,0.5)" },
  link: { light: "#0b5ed7", dark: "#7aa7ff" },
  danger: { light: "#8a1f1f", dark: "#ff8a8a" },
  dangerSurface: { light: "rgba(138,31,31,0.08)", dark: "rgba(255,138,138,0.12)" },
  focus: { light: "#2b6de0", dark: "#7aa7ff" },
} as const;

export type TokenName = keyof typeof TOKENS;

function variableName(name: TokenName): string {
  return `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

export function token(name: TokenName): string {
  return `var(${variableName(name)})`;
}

export function tokenStylesheet(): string {
  const block = (scheme: "light" | "dark") =>
    (Object.keys(TOKENS) as TokenName[]).map((name) => `  ${variableName(name)}: ${TOKENS[name][scheme]};`).join("\n");
  return `:root {\n${block("light")}\n}\n@media (prefers-color-scheme: dark) {\n:root {\n${block("dark")}\n}\n}\n`;
}
