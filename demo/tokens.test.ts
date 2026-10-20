/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor } from "../src/labels/contrast";
import { TOKENS, token, tokenStylesheet } from "./tokens";

describe("demo colour tokens", () => {
  it("names each token as a CSS variable and defines both schemes", () => {
    expect(token("textMuted")).toBe("var(--text-muted)");
    const sheet = tokenStylesheet();
    expect(sheet).toContain("--text-muted: #555b66;");
    expect(sheet).toContain("@media (prefers-color-scheme: dark)");
    expect(sheet).toContain("--text-muted: #a0a6b4;");
  });

  it.each(["light", "dark"] as const)("%s: panel text reaches 4.5:1 on its surface", (scheme) => {
    const page = parseColor(TOKENS.page[scheme]);
    const solid = parseColor(TOKENS.surfaceSolid[scheme]);
    const translucent = over(parseColor(TOKENS.surface[scheme]), page);
    for (const background of [solid, translucent]) {
      expect(contrastRatio(parseColor(TOKENS.text[scheme]), background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(parseColor(TOKENS.textMuted[scheme]), background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(parseColor(TOKENS.link[scheme]), background)).toBeGreaterThanOrEqual(4.5);
    }
    const alertBackground = over(parseColor(TOKENS.dangerSurface[scheme]), solid);
    expect(contrastRatio(parseColor(TOKENS.danger[scheme]), alertBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(parseColor(TOKENS.focus[scheme]), page)).toBeGreaterThanOrEqual(3);
  });

  it("leaves no colour literal in the demo outside tokens.ts", () => {
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    const sources = import.meta.glob<string>(
      ["./**/*.{ts,tsx,html}", "!./corpora/**", "!./**/*.test.*", "!./tokens.ts"],
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    );
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      text.split("\n").forEach((line, index) => {
        if (literal.test(line)) offenders.push(`${path}:${index + 1}`);
      });
    }
    expect(Object.keys(sources)).toContain("./App.tsx");
    expect(Object.keys(sources)).toContain("./index.html");
    expect(offenders).toEqual([]);
  });
});
