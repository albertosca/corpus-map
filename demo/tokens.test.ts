/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor } from "../src/labels/contrast";
import { DARK_TONES, DEFAULT_TONES } from "../src/shared/tones";
import { TOKENS, token, tokenStylesheet } from "./tokens";

describe("demo colour tokens", () => {
  it("names each token as a CSS variable and defines both schemes", () => {
    expect(token("secondBase")).toBe("var(--second-base)");
    const sheet = tokenStylesheet();
    expect(sheet).toContain("--muted: #4f5b6b;");
    expect(sheet).toContain("@media (prefers-color-scheme: dark)");
    expect(sheet).toContain("--muted: #a3afbf;");
  });

  it("takes the eight roles from the library tones and nothing else for colour", () => {
    for (const role of [
      "ground",
      "surface",
      "secondBase",
      "ink",
      "muted",
      "accent",
      "onAccent",
      "accentText",
    ] as const) {
      expect(TOKENS[role].light).toBe(DEFAULT_TONES[role]);
      expect(TOKENS[role].dark).toBe(DARK_TONES[role]);
    }
    expect("danger" in TOKENS).toBe(false);
    expect("link" in TOKENS).toBe(false);
    expect("focus" in TOKENS).toBe(false);
  });

  it.each(["light", "dark"] as const)(
    "%s: text and links reach 4.5:1 on the surface and panel, focus 3:1",
    (scheme) => {
      const ground = parseColor(TOKENS.ground[scheme]);
      const solid = parseColor(TOKENS.surface[scheme]);
      const panel = over(parseColor(TOKENS.panel[scheme]), ground);
      for (const background of [solid, panel]) {
        for (const role of ["ink", "muted", "accentText"] as const)
          expect(contrastRatio(parseColor(TOKENS[role][scheme]), background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(parseColor(TOKENS.ink[scheme]), ground)).toBeGreaterThanOrEqual(3);
    },
  );

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
