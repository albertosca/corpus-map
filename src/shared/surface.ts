export interface Surface {
  clear(): void;
  polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
  circle(id: string, horizontal: number, vertical: number, radius: number, fill: string): void;
  /** Draws `text` centred on (horizontal, vertical); `letterSpacing` (a CSS length) applies to this call only. */
  text(text: string, horizontal: number, vertical: number, color: string, font: string, letterSpacing?: string): void;
  /** Sets the alpha applied to every draw call until the next `globalAlpha` call. */
  globalAlpha(alpha: number): void;
  /**
   * Strokes closed rings (no fill) as one path at `width`, so many rings of
   * one colour cost one stroke; leaves the line width of later calls untouched.
   */
  outline(rings: Array<Array<[number, number]>>, color: string, width: number): void;
  /** Strokes a circle of radius `radius` centred on (horizontal, vertical) (no fill) at `width`, leaving later calls untouched. */
  ring(horizontal: number, vertical: number, radius: number, color: string, width: number): void;
  /** Strokes a circle (no fill) for point `id`, at `width`, leaving later calls untouched. */
  hollowCircle(id: string, horizontal: number, vertical: number, radius: number, colour: string, width: number): void;
  /** Strokes a straight line from `start` to `end` at `width`, leaving later calls untouched. */
  line(start: [number, number], end: [number, number], colour: string, width: number): void;
  /** Fills a rounded rectangle (an item label's plate), leaving later calls untouched. */
  plate(left: number, top: number, width: number, height: number, radius: number, fill: string): void;
  /**
   * Draws `draw`'s calls into one offscreen layer and composites it once at
   * `alpha`, so shapes drawn inside never darken where they overlap (spec
   * slice D §3). Without an offscreen canvas it draws straight onto the
   * target at `alpha`: overlaps then darken, but the map still renders.
   */
  layer(alpha: number, draw: (surface: Surface) => void): void;
}

export class RecordingSurface implements Surface {
  cleared = 0;
  polygons: Array<{ points: Array<[number, number]>; fill: string; stroke: string }> = [];
  circles: Array<{ id: string; x: number; y: number; r: number; fill: string }> = [];
  texts: Array<{ text: string; x: number; y: number; color: string; font: string; letterSpacing?: string }> = [];
  alphas: number[] = [];
  outlines: Array<{ rings: Array<Array<[number, number]>>; color: string; width: number }> = [];
  rings: Array<{ x: number; y: number; r: number; color: string; width: number }> = [];
  layers: number[] = [];
  hollowCircles: Array<{ id: string; x: number; y: number; r: number; colour: string; width: number }> = [];
  lines: Array<{ from: [number, number]; to: [number, number]; colour: string; width: number }> = [];
  plates: Array<{ left: number; top: number; width: number; height: number; radius: number; fill: string }> = [];
  calls: Array<
    | "clear"
    | "polygon"
    | "circle"
    | "hollowCircle"
    | "text"
    | "alpha"
    | "outline"
    | "ring"
    | "line"
    | "plate"
    | "layer"
    | "layerEnd"
  > = [];

  clear() {
    this.calls.push("clear");
    this.cleared += 1;
  }
  polygon(points: Array<[number, number]>, fill: string, stroke: string) {
    this.calls.push("polygon");
    this.polygons.push({ points, fill, stroke });
  }
  circle(id: string, horizontal: number, vertical: number, radius: number, fill: string) {
    this.calls.push("circle");
    this.circles.push({ id, x: horizontal, y: vertical, r: radius, fill });
  }
  hollowCircle(id: string, horizontal: number, vertical: number, radius: number, colour: string, width: number) {
    this.calls.push("hollowCircle");
    this.hollowCircles.push({ id, x: horizontal, y: vertical, r: radius, colour, width });
  }
  text(text: string, horizontal: number, vertical: number, color: string, font: string, letterSpacing?: string) {
    this.calls.push("text");
    this.texts.push(
      letterSpacing === undefined
        ? { text, x: horizontal, y: vertical, color, font }
        : { text, x: horizontal, y: vertical, color, font, letterSpacing },
    );
  }
  globalAlpha(alpha: number) {
    this.calls.push("alpha");
    this.alphas.push(alpha);
  }
  outline(rings: Array<Array<[number, number]>>, color: string, width: number) {
    this.calls.push("outline");
    this.outlines.push({ rings, color, width });
  }
  ring(horizontal: number, vertical: number, radius: number, color: string, width: number) {
    this.calls.push("ring");
    this.rings.push({ x: horizontal, y: vertical, r: radius, color, width });
  }
  line(start: [number, number], end: [number, number], colour: string, width: number) {
    this.calls.push("line");
    this.lines.push({ from: start, to: end, colour, width });
  }
  plate(left: number, top: number, width: number, height: number, radius: number, fill: string) {
    this.calls.push("plate");
    this.plates.push({ left, top, width, height, radius, fill });
  }
  layer(alpha: number, draw: (surface: Surface) => void) {
    this.calls.push("layer");
    this.layers.push(alpha);
    draw(this);
    this.calls.push("layerEnd");
  }
}

// One offscreen context per target context, made on first use; `null` when
// the target's canvas has no document to make one with (an OffscreenCanvas,
// a test fake), so the lookup is not retried every frame.
const offscreenContexts = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D | null>();

function offscreenFor(target: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
  if (!offscreenContexts.has(target)) {
    const canvas = target.canvas.ownerDocument?.createElement("canvas");
    offscreenContexts.set(target, canvas?.getContext("2d") ?? null);
  }
  return offscreenContexts.get(target) ?? null;
}

export function canvasSurface(context: CanvasRenderingContext2D): Surface {
  const surface: Surface = {
    clear() {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    },
    polygon(points, fill, stroke) {
      const [first, ...rest] = points;
      if (!first) return;
      context.beginPath();
      context.moveTo(first[0], first[1]);
      for (const [horizontal, vertical] of rest) context.lineTo(horizontal, vertical);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = stroke;
      context.stroke();
    },
    circle(_id, horizontal, vertical, radius, fill) {
      context.beginPath();
      context.arc(horizontal, vertical, radius, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
    },
    line(start, end, colour, width) {
      context.save();
      context.beginPath();
      context.moveTo(start[0], start[1]);
      context.lineTo(end[0], end[1]);
      context.strokeStyle = colour;
      context.lineWidth = width;
      context.stroke();
      context.restore();
    },
    plate(left, top, width, height, radius, fill) {
      const corner = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(left + corner, top);
      context.arcTo(left + width, top, left + width, top + height, corner);
      context.arcTo(left + width, top + height, left, top + height, corner);
      context.arcTo(left, top + height, left, top, corner);
      context.arcTo(left, top, left + width, top, corner);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    },
    hollowCircle(_id, horizontal, vertical, radius, colour, width) {
      context.save();
      context.beginPath();
      context.arc(horizontal, vertical, radius, 0, Math.PI * 2);
      context.strokeStyle = colour;
      context.lineWidth = width;
      context.stroke();
      context.restore();
    },
    text(text, horizontal, vertical, color, font, letterSpacing) {
      context.fillStyle = color;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      if (letterSpacing === undefined) {
        context.fillText(text, horizontal, vertical);
        return;
      }
      const previous = context.letterSpacing;
      context.letterSpacing = letterSpacing;
      context.fillText(text, horizontal, vertical);
      context.letterSpacing = previous;
    },
    globalAlpha(alpha) {
      context.globalAlpha = alpha;
    },
    outline(rings, color, width) {
      if (!rings.some((ring) => ring.length > 0)) return;
      context.save();
      context.beginPath();
      for (const [first, ...rest] of rings) {
        if (!first) continue;
        context.moveTo(first[0], first[1]);
        for (const [horizontal, vertical] of rest) context.lineTo(horizontal, vertical);
        context.closePath();
      }
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
      context.restore();
    },
    ring(horizontal, vertical, radius, color, width) {
      context.save();
      context.beginPath();
      context.arc(horizontal, vertical, radius, 0, Math.PI * 2);
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
      context.restore();
    },
    layer(alpha, draw) {
      const offscreen = offscreenFor(context);
      if (!offscreen) {
        // Straight onto the target: an alpha set inside is relative to the
        // layer's, as it would be inside an offscreen layer composited at `alpha`.
        const previous = context.globalAlpha;
        const relative: Surface = { ...surface, globalAlpha: (inner) => surface.globalAlpha(inner * alpha) };
        context.globalAlpha = alpha;
        draw(relative);
        context.globalAlpha = previous;
        return;
      }
      const layerCanvas = offscreen.canvas;
      if (layerCanvas.width !== context.canvas.width) layerCanvas.width = context.canvas.width;
      if (layerCanvas.height !== context.canvas.height) layerCanvas.height = context.canvas.height;
      offscreen.setTransform(1, 0, 0, 1, 0, 0);
      offscreen.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      offscreen.setTransform(context.getTransform());
      draw(canvasSurface(offscreen));
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = alpha;
      context.drawImage(layerCanvas, 0, 0);
      context.restore();
    },
  };
  return surface;
}
