export interface Surface {
  clear(): void;
  polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
  circle(id: string, horizontal: number, vertical: number, radius: number, fill: string): void;
  /** Draws `text` centred on (horizontal, vertical). */
  text(text: string, horizontal: number, vertical: number, color: string, font: string): void;
  /** Sets the alpha applied to every draw call until the next `globalAlpha` call. */
  globalAlpha(alpha: number): void;
  /** Strokes a closed ring (no fill) at `width`, leaving the line width of later calls untouched. */
  outline(points: Array<[number, number]>, color: string, width: number): void;
  /** Strokes a circle of radius `radius` centred on (horizontal, vertical) (no fill) at `width`, leaving later calls untouched. */
  ring(horizontal: number, vertical: number, radius: number, color: string, width: number): void;
}

export class RecordingSurface implements Surface {
  cleared = 0;
  polygons: Array<{ points: Array<[number, number]>; fill: string; stroke: string }> = [];
  circles: Array<{ id: string; x: number; y: number; r: number; fill: string }> = [];
  texts: Array<{ text: string; x: number; y: number; color: string; font: string }> = [];
  alphas: number[] = [];
  outlines: Array<{ points: Array<[number, number]>; color: string; width: number }> = [];
  rings: Array<{ x: number; y: number; r: number; color: string; width: number }> = [];
  calls: Array<"clear" | "polygon" | "circle" | "text" | "alpha" | "outline" | "ring"> = [];

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
  text(text: string, horizontal: number, vertical: number, color: string, font: string) {
    this.calls.push("text");
    this.texts.push({ text, x: horizontal, y: vertical, color, font });
  }
  globalAlpha(alpha: number) {
    this.calls.push("alpha");
    this.alphas.push(alpha);
  }
  outline(points: Array<[number, number]>, color: string, width: number) {
    this.calls.push("outline");
    this.outlines.push({ points, color, width });
  }
  ring(horizontal: number, vertical: number, radius: number, color: string, width: number) {
    this.calls.push("ring");
    this.rings.push({ x: horizontal, y: vertical, r: radius, color, width });
  }
}

export function canvasSurface(context: CanvasRenderingContext2D): Surface {
  return {
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
    text(text, horizontal, vertical, color, font) {
      context.fillStyle = color;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, horizontal, vertical);
    },
    globalAlpha(alpha) {
      context.globalAlpha = alpha;
    },
    outline(points, color, width) {
      const [first, ...rest] = points;
      if (!first) return;
      context.save();
      context.beginPath();
      context.moveTo(first[0], first[1]);
      for (const [horizontal, vertical] of rest) context.lineTo(horizontal, vertical);
      context.closePath();
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
  };
}
