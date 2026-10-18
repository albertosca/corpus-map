import { useMemo } from "react";
import { estimateText, type Measure } from "./placement";

/** Text measurement from an offscreen 2D canvas; the deterministic estimate where there is none (jsdom). */
export function useMeasure(): Measure {
  return useMemo(() => {
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!context) return estimateText;
    return (text, font) => {
      context.font = font;
      const pixels = Number.parseFloat(/(\d+(?:\.\d+)?)pixels/.exec(font)?.[1] ?? "12");
      return { width: context.measureText(text).width, height: pixels };
    };
  }, []);
}
