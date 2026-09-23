export interface Surface {
  clear(): void;
  polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
  circle(id: string, x: number, y: number, r: number, fill: string): void;
  /** Draws `text` centred on (x, y). */
  text(text: string, x: number, y: number, color: string, font: string): void;
  /** Sets the alpha applied to every draw call until the next `globalAlpha` call. */
  globalAlpha(alpha: number): void;
}

export class RecordingSurface implements Surface {
  cleared = 0;
  polygons: Array<{ points: Array<[number, number]>; fill: string; stroke: string }> = [];
  circles: Array<{ id: string; x: number; y: number; r: number; fill: string }> = [];
  texts: Array<{ text: string; x: number; y: number; color: string; font: string }> = [];
  alphas: number[] = [];
  calls: Array<"clear" | "polygon" | "circle" | "text" | "alpha"> = [];

  clear() {
    this.calls.push("clear");
    this.cleared += 1;
  }
  polygon(points: Array<[number, number]>, fill: string, stroke: string) {
    this.calls.push("polygon");
    this.polygons.push({ points, fill, stroke });
  }
  circle(id: string, x: number, y: number, r: number, fill: string) {
    this.calls.push("circle");
    this.circles.push({ id, x, y, r, fill });
  }
  text(text: string, x: number, y: number, color: string, font: string) {
    this.calls.push("text");
    this.texts.push({ text, x, y, color, font });
  }
  globalAlpha(alpha: number) {
    this.calls.push("alpha");
    this.alphas.push(alpha);
  }
}

export function canvasSurface(ctx: CanvasRenderingContext2D): Surface {
  return {
    clear() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    polygon(points, fill, stroke) {
      const [first, ...rest] = points;
      if (!first) return;
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of rest) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
    },
    circle(_id, x, y, r, fill) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    },
    text(text, x, y, color, font) {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    },
    globalAlpha(alpha) {
      ctx.globalAlpha = alpha;
    },
  };
}
