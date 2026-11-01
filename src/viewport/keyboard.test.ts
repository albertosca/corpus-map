import { describe, expect, it } from "vitest";
import { keyboardCommand, regimeOutRatio } from "./keyboard";

const plain = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };

describe("keyboardCommand", () => {
  it.each([
    ["ArrowRight", 0.1, 0],
    ["ArrowLeft", -0.1, 0],
    ["ArrowDown", 0, 0.1],
    ["ArrowUp", 0, -0.1],
  ])("pans a tenth of the view for %s", (key, horizontal, vertical) => {
    expect(keyboardCommand({ ...plain, key })).toEqual({ kind: "pan", horizontal, vertical });
  });

  it("pans half the view with Shift", () => {
    expect(keyboardCommand({ ...plain, key: "ArrowLeft", shiftKey: true })).toEqual({
      kind: "pan",
      horizontal: -0.5,
      vertical: 0,
    });
  });

  it.each(["+", "="])("zooms in on %s, with or without Ctrl, Cmd or Shift", (key) => {
    for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(keyboardCommand({ ...plain, ...modifiers, key })).toEqual({ kind: "zoom", direction: "in" });
    }
  });

  it("zooms out on -, with or without Ctrl or Cmd", () => {
    for (const modifiers of [{}, { ctrlKey: true }, { metaKey: true }]) {
      expect(keyboardCommand({ ...plain, ...modifiers, key: "-" })).toEqual({ kind: "zoom", direction: "out" });
    }
  });

  it.each(["0", "Home"])("fits on %s", (key) => {
    expect(keyboardCommand({ ...plain, key })).toEqual({ kind: "fit" });
  });

  it("zooms out one regime on Escape", () => {
    expect(keyboardCommand({ ...plain, key: "Escape" })).toEqual({ kind: "regimeOut" });
  });

  it("leaves Ctrl+0 to the browser's zoom reset", () => {
    expect(keyboardCommand({ ...plain, key: "0", ctrlKey: true })).toBeNull();
    expect(keyboardCommand({ ...plain, key: "0", metaKey: true })).toBeNull();
  });

  it("leaves Ctrl or Cmd with arrows, Home and Escape to the browser", () => {
    for (const key of ["ArrowRight", "Home", "Escape"]) {
      expect(keyboardCommand({ ...plain, key, ctrlKey: true })).toBeNull();
      expect(keyboardCommand({ ...plain, key, metaKey: true })).toBeNull();
    }
  });

  it("leaves every key with Alt alone", () => {
    for (const key of ["ArrowRight", "+", "-", "0", "Escape"]) {
      expect(keyboardCommand({ ...plain, key, altKey: true })).toBeNull();
    }
  });

  it("ignores keys it does not own", () => {
    for (const key of ["a", "Tab", "PageDown"]) {
      expect(keyboardCommand({ ...plain, key })).toBeNull();
    }
  });
});

describe("keyboardCommand with a selection (spec spatial keys §2)", () => {
  it.each([
    ["ArrowRight", "right"],
    ["ArrowLeft", "left"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
  ] as const)("turns %s into a move to the neighbour %s", (key, direction) => {
    expect(keyboardCommand({ ...plain, key }, true)).toEqual({ kind: "neighbour", direction });
  });

  it("pans by the small step with Shift while selecting", () => {
    expect(keyboardCommand({ ...plain, key: "ArrowRight", shiftKey: true }, true)).toEqual({
      kind: "pan",
      horizontal: 0.1,
      vertical: 0,
    });
  });

  it.each(["Enter", " "])("starts the walk on %j without a selection, and leaves it alone with one", (key) => {
    expect(keyboardCommand({ ...plain, key })).toEqual({ kind: "start" });
    expect(keyboardCommand({ ...plain, key }, true)).toBeNull();
  });

  it("leaves Ctrl/Cmd+Enter and Alt+Enter to the browser", () => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(keyboardCommand({ ...plain, ...modifiers, key: "Enter" })).toBeNull();
    }
  });

  it.each(["Enter", " "])("leaves Shift+%j to the browser (Shift+Space scrolls the page up)", (key) => {
    expect(keyboardCommand({ ...plain, shiftKey: true, key })).toBeNull();
  });
});

describe("regimeOutRatio", () => {
  // A wide mid band (the library default before slice G), so the
  // geometric middle is far from both edges.
  const wideBand = { midAt: 2, nearAt: 6 };

  it("does nothing at far", () => {
    expect(regimeOutRatio("far", 1, wideBand)).toBeNull();
  });

  it("fits from mid", () => {
    expect(regimeOutRatio("mid", 3, wideBand)).toBe(1);
  });

  it("goes from near to the geometric middle of the mid band", () => {
    expect(regimeOutRatio("near", 8, wideBand)).toBeCloseTo(Math.sqrt(12), 12);
  });

  it("fits from near when the mid band is empty", () => {
    expect(regimeOutRatio("near", 8, { midAt: 6, nearAt: 6 })).toBe(1);
  });

  it("never zooms in when midAt is below the fitted ratio", () => {
    const ratio = regimeOutRatio("near", 8, { midAt: 0.5, nearAt: 6 });
    expect(ratio).toBeCloseTo(Math.sqrt(6), 12);
    expect(ratio).toBeLessThan(6);
  });

  it("fits from near when nearAt is at or below 1", () => {
    expect(regimeOutRatio("near", 2, { midAt: 0, nearAt: 1 })).toBe(1);
    expect(regimeOutRatio("near", 2, { midAt: 0, nearAt: 0 })).toBe(1);
  });

  it("falls back to the fit when hysteresis holds near below the mid band's middle", () => {
    expect(regimeOutRatio("near", 5.75, { midAt: 5.9, nearAt: 6 })).toBe(1);
  });

  it("does nothing when no target lies below the current ratio", () => {
    expect(regimeOutRatio("mid", 0.6, { midAt: 0.5, nearAt: 6 })).toBeNull();
    expect(regimeOutRatio("mid", 1, wideBand)).toBeNull();
    expect(regimeOutRatio("near", 0.9, { midAt: 0.5, nearAt: 0.8 })).toBeNull();
  });
});
