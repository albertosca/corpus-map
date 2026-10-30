import { describe, expect, it, vi } from "vitest";
import { canvasSurface, RecordingSurface } from "./surface";

describe("canvasSurface", () => {
  it("calls clearRect with canvas dimensions on clear()", () => {
    const context = {
      clearRect: vi.fn(),
      canvas: { width: 300, height: 150 },
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    surface.clear();
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 300, 150);
  });

  it("draws a 3-point polygon with correct path calls", () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    const pts: Array<[number, number]> = [
      [10, 20],
      [30, 40],
      [50, 60],
    ];
    surface.polygon(pts, "red", "blue");

    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(30, 40);
    expect(context.lineTo).toHaveBeenCalledWith(50, 60);
    expect(context.lineTo).toHaveBeenCalledTimes(2);
    expect(context.closePath).toHaveBeenCalledOnce();
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fillStyle).toBe("red");
    expect(context.strokeStyle).toBe("blue");
  });

  it("skips path drawing for empty point array", () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    surface.polygon([], "red", "blue");

    expect(context.beginPath).not.toHaveBeenCalled();
    expect(context.moveTo).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
  });

  it("draws a circle with arc and fill", () => {
    const context = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    surface.circle("node1", 100, 150, 5, "orange");

    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.arc).toHaveBeenCalledWith(100, 150, 5, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.fillStyle).toBe("orange");
  });

  it("renders text with fillStyle, font, and fillText, centred on (x, y)", () => {
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    surface.text("Hello", 50, 75, "green", "bold 16px Arial");

    expect(context.fillStyle).toBe("green");
    expect(context.font).toBe("bold 16px Arial");
    expect(context.textAlign).toBe("center");
    expect(context.textBaseline).toBe("middle");
    expect(context.fillText).toHaveBeenCalledWith("Hello", 50, 75);
  });

  it("sets context.globalAlpha", () => {
    const context = { globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(context);
    surface.globalAlpha(0.5);
    expect(context.globalAlpha).toBe(0.5);
  });

  function strokeCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
      lineWidth: 1,
    };
  }

  it("strokes an outline ring without filling it, inside save/restore", () => {
    const context = strokeCtx();
    canvasSurface(context as unknown as CanvasRenderingContext2D).outline(
      [
        [
          [0, 0],
          [4, 0],
          [0, 4],
        ],
      ],
      "#123456",
      3,
    );
    expect(context.moveTo).toHaveBeenCalledWith(0, 0);
    expect(context.lineTo).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.strokeStyle).toBe("#123456");
    expect(context.lineWidth).toBe(3);
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it("strokes a line at its width and colour, inside save/restore", () => {
    const context = strokeCtx();
    canvasSurface(context as unknown as CanvasRenderingContext2D).line([1, 2], [3, 4], "#654321", 2.5);
    expect(context.moveTo).toHaveBeenCalledWith(1, 2);
    expect(context.lineTo).toHaveBeenCalledWith(3, 4);
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.strokeStyle).toBe("#654321");
    expect(context.lineWidth).toBe(2.5);
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it("strokes several rings as one path, each closed on its own", () => {
    const context = strokeCtx();
    canvasSurface(context as unknown as CanvasRenderingContext2D).outline(
      [
        [
          [0, 0],
          [4, 0],
          [0, 4],
        ],
        [
          [10, 10],
          [14, 10],
          [10, 14],
        ],
      ],
      "#123456",
      3,
    );
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenNthCalledWith(1, 0, 0);
    expect(context.moveTo).toHaveBeenNthCalledWith(2, 10, 10);
    expect(context.closePath).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it.each([[[]], [[[]]]])("draws nothing for an outline with no points (%j)", (rings) => {
    const context = strokeCtx();
    canvasSurface(context as unknown as CanvasRenderingContext2D).outline(rings, "#123456", 3);
    expect(context.beginPath).not.toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("strokes a ring as a full circle without filling it", () => {
    const context = strokeCtx();
    canvasSurface(context as unknown as CanvasRenderingContext2D).ring(10, 20, 6, "#123456", 3);
    expect(context.arc).toHaveBeenCalledWith(10, 20, 6, 0, Math.PI * 2);
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.lineWidth).toBe(3);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it("draws with the letter spacing and restores the previous one", () => {
    const seen: string[] = [];
    const fake = {
      letterSpacing: "0px",
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      fillText(text: string) {
        seen.push(`${text}@${fake.letterSpacing}`);
      },
    };
    const surface = canvasSurface(fake as unknown as CanvasRenderingContext2D);
    surface.text("spaced", 0, 0, "#000", "12px a", "1px");
    surface.text("plain", 0, 0, "#000", "12px a");
    expect(seen).toEqual(["spaced@1px", "plain@0px"]);
    expect(fake.letterSpacing).toBe("0px");
  });
});

describe("canvasSurface plate", () => {
  it("fills one rounded rectangle through four arcs", () => {
    const arcs: number[][] = [];
    const fake = {
      fillStyle: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: (...corner: number[]) => arcs.push(corner),
      closePath: vi.fn(),
      fill: vi.fn(),
    };
    canvasSurface(fake as unknown as CanvasRenderingContext2D).plate(10, 20, 40, 16, 3, "#123456");
    expect(arcs).toEqual([
      [50, 20, 50, 36, 3],
      [50, 36, 10, 36, 3],
      [10, 36, 10, 20, 3],
      [10, 20, 50, 20, 3],
    ]);
    expect(fake.fill).toHaveBeenCalledOnce();
    expect(fake.fillStyle).toBe("#123456");
  });
});

describe("RecordingSurface", () => {
  it("records the sequence of method calls", () => {
    const surface = new RecordingSurface();
    surface.polygon([[0, 0]], "red", "blue");
    surface.text("hello", 10, 20, "black", "bold");
    expect(surface.calls).toEqual(["polygon", "text"]);
  });

  it("records globalAlpha calls as an 'alpha' call and in alphas", () => {
    const surface = new RecordingSurface();
    surface.globalAlpha(0.5);
    surface.globalAlpha(1);
    expect(surface.calls).toEqual(["alpha", "alpha"]);
    expect(surface.alphas).toEqual([0.5, 1]);
  });

  it("records letterSpacing only when given", () => {
    const surface = new RecordingSurface();
    surface.text("plain", 0, 0, "#000", "12px a");
    surface.text("spaced", 0, 0, "#000", "12px a", "1px");
    expect(surface.texts).toEqual([
      { text: "plain", x: 0, y: 0, color: "#000", font: "12px a" },
      { text: "spaced", x: 0, y: 0, color: "#000", font: "12px a", letterSpacing: "1px" },
    ]);
  });
});
