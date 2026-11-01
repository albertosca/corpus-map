import { describe, expect, it } from "vitest";
import {
  type GestureIntent,
  type GesturePointer,
  initialGestureState,
  isPressed,
  step,
  TOUCH_STRAY_DISTANCE,
} from "./gestures";

const touch = (
  kind: GesturePointer["kind"],
  pointerId: number,
  horizontal: number,
  vertical: number,
  time: number,
): GesturePointer => ({ kind, pointerId, pointerType: "touch", x: horizontal, y: vertical, time });
const mouse = (
  kind: GesturePointer["kind"],
  horizontal: number,
  vertical: number,
  time: number,
  pointerId = 1,
): GesturePointer => ({ kind, pointerId, pointerType: "mouse", x: horizontal, y: vertical, time });
const pen = (kind: GesturePointer["kind"], horizontal: number, vertical: number, time: number): GesturePointer => ({
  kind,
  pointerId: 1,
  pointerType: "pen",
  x: horizontal,
  y: vertical,
  time,
});

function run(events: readonly GesturePointer[], state = initialGestureState()) {
  const intents: GestureIntent[] = [];
  let current = state;
  for (const event of events) {
    const result = step(current, event);
    current = result.state;
    intents.push(...result.intents);
  }
  return { state: current, intents };
}

/** A touch tap: down and up at the same point, `duration` ms apart. */
const tapAt = (horizontal: number, vertical: number, time: number, duration = 50): GesturePointer[] => [
  touch("down", 1, horizontal, vertical, time),
  touch("up", 1, horizontal, vertical, time + duration),
];

const kinds = (intents: readonly GestureIntent[]) => intents.map((intent) => intent.kind);

describe("the gesture recogniser (spec mobile §2)", () => {
  describe("one pointer", () => {
    it("pans one finger by each move's delta, and an up far away is no tap", () => {
      const { intents } = run([
        touch("down", 1, 10, 10, 0),
        touch("move", 1, 15, 12, 10),
        touch("move", 1, 25, 20, 20),
        touch("up", 1, 25, 20, 30),
      ]);
      expect(intents).toEqual([
        { kind: "pan", dx: 5, dy: 2 },
        { kind: "pan", dx: 10, dy: 8 },
      ]);
    });

    it("pans the mouse the same way and taps on an up within the slop", () => {
      const { intents } = run([mouse("down", 10, 10, 0), mouse("move", 13, 10, 10), mouse("up", 13, 10, 20)]);
      expect(intents).toEqual([
        { kind: "pan", dx: 3, dy: 0 },
        { kind: "tap", x: 13, y: 10, pointerType: "mouse" },
      ]);
    });

    it("is no tap once a finger has strayed past TOUCH_STRAY_DISTANCE, even when it comes back to where it went down", () => {
      // The browser pass: a pan that swung out and back selected the item under the finger.
      const { intents } = run([
        touch("down", 1, 10, 10, 0),
        touch("move", 1, 10 + TOUCH_STRAY_DISTANCE + 1, 10, 10),
        touch("move", 1, 11, 10, 20),
        touch("up", 1, 11, 10, 30),
      ]);
      expect(intents.filter((intent) => intent.kind !== "pan")).toEqual([]);
    });

    it("still taps a finger that jittered up to TOUCH_STRAY_DISTANCE and came back within the slop", () => {
      const { intents } = run([
        touch("down", 1, 10, 10, 0),
        touch("move", 1, 10 + TOUCH_STRAY_DISTANCE, 10, 10),
        touch("move", 1, 11, 10, 20),
        touch("up", 1, 11, 10, 30),
      ]);
      expect(intents[intents.length - 1]).toEqual({ kind: "tap", x: 11, y: 10, pointerType: "touch" });
    });

    it("taps a finger lifted 6 px from where it went down: a finger on glass drifts more than a mouse (whole-branch review #1)", () => {
      const { intents } = run([touch("down", 1, 0, 0, 0), touch("move", 1, 6, 0, 10), touch("up", 1, 6, 0, 20)]);
      expect(intents[intents.length - 1]).toEqual({ kind: "tap", x: 6, y: 0, pointerType: "touch" });
    });

    it("still keeps a mouse press lifted 6 px away from being a click", () => {
      const { intents } = run([mouse("down", 0, 0, 0), mouse("move", 6, 0, 10), mouse("up", 6, 0, 20)]);
      expect(kinds(intents)).toEqual(["pan"]);
    });

    it("never lets a strayed finger be the first half of a double tap", () => {
      const { intents } = run([
        touch("down", 1, 10, 10, 0),
        touch("move", 1, 40, 10, 10),
        touch("move", 1, 10, 10, 20),
        touch("up", 1, 10, 10, 30),
        ...tapAt(10, 10, 100),
      ]);
      expect(intents.filter((intent) => intent.kind !== "pan")).toEqual([
        { kind: "tap", x: 10, y: 10, pointerType: "touch" },
      ]);
    });

    it("never turns two quick mouse clicks into a double tap", () => {
      const { intents } = run([
        mouse("down", 50, 50, 0),
        mouse("up", 50, 50, 40),
        mouse("down", 50, 50, 100),
        mouse("up", 50, 50, 140),
      ]);
      expect(kinds(intents)).toEqual(["tap", "tap"]);
    });

    it("never turns two quick pen taps into a double tap", () => {
      const { intents } = run([
        pen("down", 50, 50, 0),
        pen("up", 50, 50, 40),
        pen("down", 50, 50, 100),
        pen("up", 50, 50, 140),
      ]);
      expect(kinds(intents)).toEqual(["tap", "tap"]);
    });

    it("ignores a second mouse pointer while one is pressed", () => {
      const { intents } = run([
        mouse("down", 50, 50, 0),
        mouse("down", 90, 90, 10, 2),
        mouse("move", 120, 90, 20, 2),
        mouse("up", 120, 90, 30, 2),
        mouse("up", 50, 50, 40),
      ]);
      expect(intents).toEqual([{ kind: "tap", x: 50, y: 50, pointerType: "mouse" }]);
    });

    it("taps a finger lifted within the slop of where it went down", () => {
      const { intents } = run([touch("down", 1, 50, 50, 0), touch("up", 1, 52, 51, 50)]);
      expect(intents).toEqual([{ kind: "tap", x: 52, y: 51, pointerType: "touch" }]);
    });

    it("still taps a mouse press that wandered 10 px and came back (the distance at the up decides, like a click)", () => {
      const { intents } = run([
        mouse("down", 50, 50, 0),
        mouse("move", 60, 50, 10),
        mouse("move", 51, 50, 20),
        mouse("up", 51, 50, 30),
      ]);
      expect(intents[intents.length - 1]).toEqual({ kind: "tap", x: 51, y: 50, pointerType: "mouse" });
    });

    it("restarts the press on a second down from the pointer it holds (its up was lost)", () => {
      const { intents } = run([mouse("down", 0, 0, 0), mouse("down", 50, 50, 100), mouse("up", 50, 50, 150)]);
      expect(intents).toEqual([{ kind: "tap", x: 50, y: 50, pointerType: "mouse" }]);
    });

    it("never pinches one finger with itself when its down repeats", () => {
      const { intents } = run([touch("down", 1, 0, 0, 0), touch("down", 1, 100, 0, 10), touch("move", 1, 140, 0, 20)]);
      expect(intents).toEqual([{ kind: "pan", dx: 40, dy: 0 }]);
    });

    it("is pressed between a down and its up, and not otherwise", () => {
      const pressed = step(initialGestureState(), touch("down", 1, 0, 0, 0)).state;
      expect(isPressed(initialGestureState())).toBe(false);
      expect(isPressed(pressed)).toBe(true);
      expect(isPressed(step(pressed, touch("up", 1, 0, 0, 10)).state)).toBe(false);
    });
  });

  describe("double tap (touch only)", () => {
    it("turns a second tap within 300 ms and 24 px into a double tap at the second tap", () => {
      const { intents } = run([...tapAt(50, 50, 0), ...tapAt(60, 55, 200)]);
      expect(intents).toEqual([
        { kind: "tap", x: 50, y: 50, pointerType: "touch" },
        { kind: "doubleTap", x: 60, y: 55 },
      ]);
    });

    it("keeps two taps more than 300 ms apart, up to up, as two taps", () => {
      const { intents } = run([...tapAt(50, 50, 0), ...tapAt(50, 50, 350)]);
      expect(kinds(intents)).toEqual(["tap", "tap"]);
    });

    it("keeps two taps more than 24 px apart as two taps", () => {
      const { intents } = run([...tapAt(50, 50, 0), ...tapAt(90, 50, 200)]);
      expect(kinds(intents)).toEqual(["tap", "tap"]);
    });

    it("starts a new sequence on a third quick tap", () => {
      const { intents } = run([...tapAt(50, 50, 0), ...tapAt(50, 50, 150), ...tapAt(50, 50, 300)]);
      expect(kinds(intents)).toEqual(["tap", "doubleTap", "tap"]);
    });

    it("does not pair a tap with one before a pan in between", () => {
      const { intents } = run([
        ...tapAt(50, 50, 0),
        touch("down", 1, 50, 50, 60),
        touch("move", 1, 90, 50, 70),
        touch("up", 1, 90, 50, 80),
        ...tapAt(50, 50, 100),
      ]);
      expect(kinds(intents)).toEqual(["tap", "pan", "tap"]);
    });
  });

  describe("pinch", () => {
    it("emits the distance ratio, the midpoint and its movement", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("move", 2, 300, 100, 20),
      ]);
      expect(intents).toEqual([{ kind: "pinch", factor: 2, centreX: 200, centreY: 100, dx: 50, dy: 0 }]);
    });

    it("drags with the midpoint: two moves sum to the fingers' shift and their factors multiply to 1", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("move", 1, 110, 120, 20),
        touch("move", 2, 210, 120, 30),
      ]);
      const pinches = intents.filter((intent) => intent.kind === "pinch");
      expect(pinches).toHaveLength(2);
      const horizontal = pinches.reduce((sum, intent) => sum + intent.dx, 0);
      const vertical = pinches.reduce((sum, intent) => sum + intent.dy, 0);
      const factor = pinches.reduce((product, intent) => product * intent.factor, 1);
      expect(horizontal).toBeCloseTo(10, 9);
      expect(vertical).toBeCloseTo(20, 9);
      expect(factor).toBeCloseTo(1, 9);
    });

    it("gives factor 1 when the fingers start at the same point", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 100, 100, 10),
        touch("move", 2, 110, 100, 20),
      ]);
      expect(intents).toEqual([{ kind: "pinch", factor: 1, centreX: 105, centreY: 100, dx: 5, dy: 0 }]);
    });

    it("starts from where the fingers went down after wiggling inside the slop", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("move", 2, 202, 100, 20),
        touch("move", 2, 250, 100, 30),
      ]);
      expect(intents).toEqual([{ kind: "pinch", factor: 1.5, centreX: 175, centreY: 100, dx: 25, dy: 0 }]);
    });

    it("continues as a pan from the remaining finger, with no jump and no tap, when one finger lifts", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("move", 2, 300, 100, 20),
        touch("up", 2, 300, 100, 30),
        touch("move", 1, 107, 103, 40),
        touch("up", 1, 107, 103, 50),
      ]);
      expect(intents.slice(1)).toEqual([{ kind: "pan", dx: 7, dy: 3 }]);
    });

    it("ignores a third finger and keeps the pinch going", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("down", 3, 400, 400, 20),
        touch("move", 3, 450, 450, 30),
        touch("up", 3, 450, 450, 40),
        touch("move", 2, 300, 100, 50),
      ]);
      expect(intents).toEqual([{ kind: "pinch", factor: 2, centreX: 200, centreY: 100, dx: 50, dy: 0 }]);
    });
  });

  describe("two-finger tap", () => {
    const twoFingerTap = (secondMove: number, lastUp: number): GesturePointer[] => [
      touch("down", 1, 100, 100, 0),
      touch("down", 2, 140, 100, 30),
      touch("move", 2, 140 + secondMove, 100, 60),
      touch("up", 1, 100, 100, 120),
      touch("up", 2, 140 + secondMove, 100, lastUp),
    ];

    it("emits only a two-finger tap at the midpoint when both lift within 300 ms without moving", () => {
      expect(run(twoFingerTap(0, 150)).intents).toEqual([{ kind: "twoFingerTap", x: 120, y: 100 }]);
    });

    it("emits no pinch for a wiggle inside the slop", () => {
      expect(run(twoFingerTap(3, 150)).intents).toEqual([{ kind: "twoFingerTap", x: 121.5, y: 100 }]);
    });

    it("is no two-finger tap when a finger moves past the slop", () => {
      expect(kinds(run(twoFingerTap(10, 150)).intents)).not.toContain("twoFingerTap");
    });

    it("is no two-finger tap when the last finger lifts after 300 ms", () => {
      expect(run(twoFingerTap(0, 320)).intents).toEqual([]);
    });

    it("is no two-finger tap when the second finger comes down after 300 ms", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 140, 100, 310),
        touch("up", 1, 100, 100, 320),
        touch("up", 2, 140, 100, 330),
      ]);
      expect(intents).toEqual([]);
    });
  });

  describe("cancel", () => {
    it("ends a pan: no press is left and the pointer's up emits nothing", () => {
      const cancelled = run([
        touch("down", 1, 10, 10, 0),
        touch("move", 1, 20, 10, 10),
        touch("cancel", 1, 20, 10, 20),
      ]);
      expect(isPressed(cancelled.state)).toBe(false);
      expect(step(cancelled.state, touch("up", 1, 20, 10, 30)).intents).toEqual([]);
    });

    it("keeps the finger left after one finger of a pinch is cancelled panning, never a hover (whole-branch review #3)", () => {
      const cancelled = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 200, 100, 10),
        touch("cancel", 2, 200, 100, 20),
      ]);
      expect(isPressed(cancelled.state)).toBe(true);
      const after = run([touch("move", 1, 150, 100, 30), touch("up", 1, 150, 100, 40)], cancelled.state);
      expect(after.intents).toEqual([{ kind: "pan", dx: 50, dy: 0 }]);
      expect(isPressed(after.state)).toBe(false);
      const fresh = run([touch("down", 5, 0, 0, 50), touch("move", 5, 20, 0, 60)], after.state);
      expect(fresh.intents).toEqual([{ kind: "pan", dx: 20, dy: 0 }]);
    });

    it("ends a two-finger tap before it completes", () => {
      const { intents } = run([
        touch("down", 1, 100, 100, 0),
        touch("down", 2, 140, 100, 30),
        touch("cancel", 1, 100, 100, 60),
        touch("up", 2, 140, 100, 90),
      ]);
      expect(intents).toEqual([]);
    });

    it("forgets the last tap, so the next tap is a plain tap", () => {
      const { intents } = run([
        ...tapAt(50, 50, 0),
        touch("down", 1, 50, 50, 60),
        touch("cancel", 1, 50, 50, 70),
        ...tapAt(50, 50, 100),
      ]);
      expect(kinds(intents)).toEqual(["tap", "tap"]);
    });
  });
});
