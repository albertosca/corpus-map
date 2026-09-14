export interface Surface {
  clear(): void;
  polygon(points: Array<[number, number]>, fill: string, stroke: string): void;
  circle(id: string, x: number, y: number, r: number, fill: string): void;
  text(text: string, x: number, y: number, color: string, font: string): void;
}

export class RecordingSurface implements Surface {
  cleared = 0;
  polygons: Array<{ points: Array<[number, number]>; fill: string; stroke: string }> = [];
  circles: Array<{ id: string; x: number; y: number; r: number; fill: string }> = [];
  texts: Array<{ text: string; x: number; y: number; color: string; font: string }> = [];

  clear() {
    this.cleared += 1;
  }
  polygon(points: Array<[number, number]>, fill: string, stroke: string) {
    this.polygons.push({ points, fill, stroke });
  }
  circle(id: string, x: number, y: number, r: number, fill: string) {
    this.circles.push({ id, x, y, r, fill });
  }
  text(text: string, x: number, y: number, color: string, font: string) {
    this.texts.push({ text, x, y, color, font });
  }
}

export function canvasSurface(ctx: CanvasRenderingContext2D): Surface {
  return {
    clear() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    polygon(points, fill, stroke) {
      if (points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
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
      ctx.fillText(text, x, y);
    },
  };
}
