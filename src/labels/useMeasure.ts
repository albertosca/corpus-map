import { useMemo } from "react";
import { estimateText, type Measure } from "./placement";

/** Text measurement from an offscreen 2D canvas; the deterministic estimate where there is none (jsdom). */
export function useMeasure(): Measure {
  return useMemo(() => {
    const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!ctx) return estimateText;
    return (text, font) => {
      ctx.font = font;
      const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "12");
      return { width: ctx.measureText(text).width, height: px };
    };
  }, []);
}
