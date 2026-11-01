import type { Direction } from "../a11y/spatialNeighbour";
import type { LodThresholds, Regime } from "../lod/lod";

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type KeyboardCommand =
  | { kind: "pan"; horizontal: number; vertical: number }
  | { kind: "zoom"; direction: "in" | "out" }
  | { kind: "fit" }
  | { kind: "regimeOut" }
  | { kind: "neighbour"; direction: Direction }
  | { kind: "start" };

const PAN_STEP = 0.1;
const PAN_STEP_LARGE = 0.5;

const PAN_DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowUp: "up",
};

/**
 * The surface's key map (spec slice B §4). Pan fractions are of the view's
 * width/height, signed in the direction the view travels: ArrowRight shows
 * what lies to the right. Ctrl/Cmd are taken only with the zoom keys — the
 * map captures the browser's page zoom while it has focus — and Ctrl+0
 * stays the browser's zoom reset. Alt is never taken. With `selecting` (a
 * live selection), a plain arrow moves to the neighbour and Shift pans by
 * the small step; Enter and Space start the walk only without a selection
 * (spec spatial keys §2).
 */
export function keyboardCommand(input: KeyInput, selecting = false): KeyboardCommand | null {
  if (input.altKey) return null;
  if (input.key === "+" || input.key === "=") return { kind: "zoom", direction: "in" };
  if (input.key === "-") return { kind: "zoom", direction: "out" };
  if (input.ctrlKey || input.metaKey) return null;
  const direction = PAN_DIRECTIONS[input.key];
  if (direction) {
    const arrow = ARROW_DIRECTIONS[input.key];
    if (selecting && !input.shiftKey && arrow) return { kind: "neighbour", direction: arrow };
    const step = input.shiftKey && !selecting ? PAN_STEP_LARGE : PAN_STEP;
    // `|| 0` turns -0 (from -1 * 0) into 0, so callers and `toEqual` see a plain zero.
    return { kind: "pan", horizontal: direction[0] * step || 0, vertical: direction[1] * step || 0 };
  }
  if (input.key === "0" || input.key === "Home") return { kind: "fit" };
  if (input.key === "Escape") return { kind: "regimeOut" };
  if ((input.key === "Enter" || input.key === " ") && !selecting && !input.shiftKey) return { kind: "start" };
  return null;
}

/**
 * Where `Esc` zooms to, as a ratio of the fitted scale: from near, the
 * geometric middle of the mid band (its lower edge floored at the fitted
 * ratio 1); from mid, or when the mid band is empty, the fit itself. Only a
 * target strictly below the current `ratio` counts — hysteresis can hold a
 * regime below its threshold, and `Esc` never zooms in — so the first one
 * below wins, and nothing when none is (or at far).
 */
export function regimeOutRatio(regime: Regime, ratio: number, thresholds: LodThresholds): number | null {
  if (regime === "far") return null;
  const targets = [1];
  if (regime === "near") {
    const lower = Math.max(thresholds.midAt, 1);
    if (lower < thresholds.nearAt) targets.unshift(Math.sqrt(lower * thresholds.nearAt));
  }
  return targets.find((target) => target < ratio) ?? null;
}
