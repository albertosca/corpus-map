import { useMemo } from "react";
import { estimateText, type Measure } from "./placement";

/** Text measurement from an offscreen 2D canvas; the deterministic estimate where there is none (jsdom). */
export function useMeasure(): Measure {
  return useMemo(() => {
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!context) return estimateText;
    // A browser parses the font on every assignment; placement measures thousands of words in one font.
    let lastFont: string | null = null;
    return (text, font) => {
      if (font !== lastFont) {
        context.font = font;
        lastFont = font;
      }
      const pixels = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
      return { width: context.measureText(text).width, height: pixels };
    };
  }, []);
}
