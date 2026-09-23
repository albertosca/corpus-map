import { describe, expect, it, vi } from "vitest";
import { canvasSurface } from "./surface";

describe("canvasSurface", () => {
  it("calls clearRect with canvas dimensions on clear()", () => {
    const ctx = {
      clearRect: vi.fn(),
      canvas: { width: 300, height: 150 },
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(ctx);
    surface.clear();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 300, 150);
  });

  it("draws a 3-point polygon with correct path calls", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(ctx);
    const pts: Array<[number, number]> = [
      [10, 20],
      [30, 40],
      [50, 60],
    ];
    surface.polygon(pts, "red", "blue");

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 40);
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 60);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.fillStyle).toBe("red");
    expect(ctx.strokeStyle).toBe("blue");
  });

  it("skips path drawing for empty point array", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(ctx);
    surface.polygon([], "red", "blue");

    expect(ctx.beginPath).not.toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws a circle with arc and fill", () => {
    const ctx = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(ctx);
    surface.circle("node1", 100, 150, 5, "orange");

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.arc).toHaveBeenCalledWith(100, 150, 5, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.fillStyle).toBe("orange");
  });

  it("renders text with fillStyle, font, and fillText", () => {
    const ctx = {
      fillStyle: "",
      font: "",
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const surface = canvasSurface(ctx);
    surface.text("Hello", 50, 75, "green", "bold 16px Arial");

    expect(ctx.fillStyle).toBe("green");
    expect(ctx.font).toBe("bold 16px Arial");
    expect(ctx.fillText).toHaveBeenCalledWith("Hello", 50, 75);
  });
});
