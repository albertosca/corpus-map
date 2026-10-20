import { describe, expect, it } from "vitest";
import { canvasSurface, RecordingSurface } from "./surface";

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface FakeCanvas {
  width: number;
  height: number;
  ownerDocument?: { createElement: (tag: string) => FakeCanvas };
  context?: ReturnType<typeof fakeContext>;
  getContext?: () => unknown;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Just enough of a 2D context to see what `layer` does, logged as `<name>.<call>`. */
function fakeContext(log: string[], name: string, canvas: FakeCanvas) {
  const stack: Array<{ transform: Matrix; alpha: number }> = [];
  const context = {
    canvas,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    transform: { ...IDENTITY },
    setTransform(...values: unknown[]) {
      const [first, second, third, fourth, fifth, sixth] = values as number[];
      context.transform =
        values.length === 1
          ? { ...(values[0] as Matrix) }
          : { a: first ?? 1, b: second ?? 0, c: third ?? 0, d: fourth ?? 1, e: fifth ?? 0, f: sixth ?? 0 };
      log.push(`${name}.setTransform ${context.transform.a}`);
    },
    getTransform: () => ({ ...context.transform }),
    clearRect: () => log.push(`${name}.clearRect ${canvas.width}x${canvas.height}`),
    drawImage: (image: FakeCanvas) =>
      log.push(
        `${name}.drawImage ${image.width}x${image.height} alpha=${context.globalAlpha} scale=${context.transform.a}`,
      ),
    save: () => stack.push({ transform: { ...context.transform }, alpha: context.globalAlpha }),
    restore: () => {
      const saved = stack.pop();
      if (saved) {
        context.transform = saved.transform;
        context.globalAlpha = saved.alpha;
      }
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => log.push(`${name}.fill ${context.fillStyle} alpha=${context.globalAlpha}`),
    stroke: () => {},
  };
  return context;
}

function target(log: string[], withDocument: boolean) {
  let created = 0;
  const canvas: FakeCanvas = { width: 200, height: 100 };
  if (withDocument) {
    canvas.ownerDocument = {
      createElement: () => {
        created += 1;
        const layerCanvas: FakeCanvas = { width: 300, height: 150 };
        layerCanvas.context = fakeContext(log, "layer", layerCanvas);
        layerCanvas.getContext = () => layerCanvas.context;
        return layerCanvas;
      },
    };
  }
  const context = fakeContext(log, "target", canvas);
  return { canvas, context, created: () => created };
}

const SQUARE: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [10, 10],
];

describe("canvasSurface layer", () => {
  it("draws offscreen at the target's transform and composites once, at the alpha, under the identity transform", () => {
    const log: string[] = [];
    const { context } = target(log, true);
    context.setTransform(2, 0, 0, 2, 0, 0);
    log.length = 0;
    canvasSurface(context as unknown as CanvasRenderingContext2D).layer(0.2, (layer) =>
      layer.polygon(SQUARE, "red", "transparent"),
    );
    expect(log).toEqual([
      "layer.setTransform 1",
      "layer.clearRect 200x100",
      "layer.setTransform 2",
      "layer.fill red alpha=1",
      "target.setTransform 1",
      "target.drawImage 200x100 alpha=0.2 scale=1",
    ]);
    expect(context.globalAlpha).toBe(1);
    expect(context.transform.a).toBe(2);
  });

  it("follows a resized backing store and reuses one offscreen canvas", () => {
    const log: string[] = [];
    const { canvas, context, created } = target(log, true);
    const surface = canvasSurface(context as unknown as CanvasRenderingContext2D);
    surface.layer(0.2, () => {});
    canvas.width = 640;
    canvas.height = 480;
    log.length = 0;
    surface.layer(0.2, () => {});
    expect(log).toContain("layer.clearRect 640x480");
    expect(log).toContain("target.drawImage 640x480 alpha=0.2 scale=1");
    expect(created()).toBe(1);
  });

  it("draws straight onto the target at the alpha when no offscreen canvas can be made, then restores the alpha", () => {
    const log: string[] = [];
    const { context } = target(log, false);
    context.globalAlpha = 0.7;
    canvasSurface(context as unknown as CanvasRenderingContext2D).layer(0.2, (layer) =>
      layer.polygon(SQUARE, "red", "transparent"),
    );
    expect(log).toEqual(["target.fill red alpha=0.2"]);
    expect(context.globalAlpha).toBe(0.7);
  });
});

describe("RecordingSurface layer", () => {
  it("records the layer's alpha and brackets what was drawn inside it", () => {
    const surface = new RecordingSurface();
    surface.layer(0.2, (layer) => layer.polygon(SQUARE, "red", "transparent"));
    expect(surface.layers).toEqual([0.2]);
    expect(surface.calls).toEqual(["layer", "polygon", "layerEnd"]);
  });
});
