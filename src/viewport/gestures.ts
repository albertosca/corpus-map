/**
 * The gesture recogniser (spec mobile §2): a pure state machine that turns
 * pointer events into intents. No DOM, no React and no clock of its own: time
 * comes from the event, so a test controls it. Two finger slots at most, so
 * every event costs O(1).
 */

/** How far, in box pixels, a press may end from where it went down and still be a tap. */
export const CLICK_SLOP = 4;
/**
 * How far, in box pixels, a finger may stray from where it went down and
 * still tap when it comes back within `CLICK_SLOP`: past it the press is a
 * pan for good, the way a touch browser cancels the tap once a scroll
 * starts. Wider than the slop so a finger's jitter still taps; a mouse
 * keeps the click's rule (only the distance at the up decides).
 */
export const TOUCH_STRAY_DISTANCE = 10;
/** Two taps within this many milliseconds, up to up, make a double tap (touch only). */
export const DOUBLE_TAP_INTERVAL = 300;
/** ...and within this many pixels of each other. */
export const DOUBLE_TAP_DISTANCE = 24;
/** Two fingers down and up within this many milliseconds of the first down make a two-finger tap. */
export const TWO_FINGER_TAP_INTERVAL = 300;
/** Under this distance, in pixels, two fingers give a pinch factor of 1 rather than a division by almost zero. */
const MINIMUM_PINCH_DISTANCE = 1;

export interface GesturePointer {
  kind: "down" | "move" | "up" | "cancel";
  pointerId: number;
  /** "mouse", "pen" or "touch". */
  pointerType: string;
  /** Box pixels. */
  x: number;
  y: number;
  /** The event's `timeStamp`, in milliseconds. */
  time: number;
}

export type GestureIntent =
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "pinch"; factor: number; centreX: number; centreY: number; dx: number; dy: number }
  | { kind: "tap"; x: number; y: number; pointerType: string }
  | { kind: "doubleTap"; x: number; y: number }
  | { kind: "twoFingerTap"; x: number; y: number };

interface Finger {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
}

/**
 * Opaque to callers. `phase` "one" is a single press that can still tap;
 * "pinch" is two fingers; "pan" is a finger that strayed past
 * `TOUCH_STRAY_DISTANCE`, or the finger left after a pinch, and never taps
 * (the latter can only finish a two-finger tap).
 */
export interface GestureState {
  readonly phase: "idle" | "one" | "pinch" | "pan";
  readonly pointerType: string;
  readonly first: Finger | null;
  readonly second: Finger | null;
  readonly firstDownTime: number;
  /** Two fingers, both still inside the slop and inside the interval so far. */
  readonly twoFingerTap: boolean;
  /** Where the finger lifted first in a two-finger tap last was. */
  readonly lifted: { readonly x: number; readonly y: number } | null;
  /** The pinch's distance and midpoint at its start or at the last emitted pinch. */
  readonly anchor: { readonly distance: number; readonly x: number; readonly y: number } | null;
  /** The last touch tap, a candidate first half of a double tap. */
  readonly lastTap: { readonly x: number; readonly y: number; readonly time: number } | null;
}

const IDLE: GestureState = {
  phase: "idle",
  pointerType: "",
  first: null,
  second: null,
  firstDownTime: 0,
  twoFingerTap: false,
  lifted: null,
  anchor: null,
  lastTap: null,
};

const NONE: readonly GestureIntent[] = [];

export function initialGestureState(): GestureState {
  return IDLE;
}

/** Whether a gesture is in progress, so a move belongs to it and is not a hover. */
export function isPressed(state: GestureState): boolean {
  return state.phase !== "idle";
}

const withinSlop = (finger: Finger): boolean =>
  Math.hypot(finger.x - finger.startX, finger.y - finger.startY) <= CLICK_SLOP;

function pairOf(first: Finger, second: Finger): { distance: number; x: number; y: number } {
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

const moved = (finger: Finger, event: GesturePointer): Finger => ({ ...finger, x: event.x, y: event.y });

export function step(
  state: GestureState,
  event: GesturePointer,
): { state: GestureState; intents: readonly GestureIntent[] } {
  switch (event.kind) {
    case "down":
      return { state: down(state, event), intents: NONE };
    case "move":
      return move(state, event);
    case "up":
      return up(state, event);
    case "cancel":
      return {
        state: owns(state, event.pointerId) ? { ...IDLE } : state,
        intents: NONE,
      };
  }
}

function owns(state: GestureState, pointerId: number): boolean {
  return state.first?.pointerId === pointerId || state.second?.pointerId === pointerId;
}

function down(state: GestureState, event: GesturePointer): GestureState {
  const finger: Finger = { pointerId: event.pointerId, x: event.x, y: event.y, startX: event.x, startY: event.y };
  // A down from a pointer already held means its up was lost: start over from this one.
  if (state.phase === "idle" || owns(state, event.pointerId)) {
    return {
      ...IDLE,
      phase: "one",
      pointerType: event.pointerType,
      first: finger,
      firstDownTime: event.time,
      lastTap: state.phase === "idle" ? state.lastTap : null,
    };
  }
  const touchPair = state.pointerType === "touch" && event.pointerType === "touch";
  if (!touchPair || state.second !== null || state.first === null || state.phase === "pinch") return state;
  return {
    ...state,
    phase: "pinch",
    second: finger,
    twoFingerTap:
      state.phase === "one" && withinSlop(state.first) && event.time - state.firstDownTime <= TWO_FINGER_TAP_INTERVAL,
    anchor: pairOf(state.first, finger),
    lastTap: null,
  };
}

function move(state: GestureState, event: GesturePointer): { state: GestureState; intents: readonly GestureIntent[] } {
  const { first, second } = state;
  if (first === null || !owns(state, event.pointerId)) return { state, intents: NONE };
  if (state.phase !== "pinch" || second === null) {
    const nextFirst = moved(first, event);
    const strayed =
      state.phase === "one" &&
      state.pointerType === "touch" &&
      Math.hypot(nextFirst.x - nextFirst.startX, nextFirst.y - nextFirst.startY) > TOUCH_STRAY_DISTANCE;
    const next = { ...state, first: nextFirst, ...(strayed ? { phase: "pan" as const } : {}) };
    const horizontal = event.x - first.x;
    const vertical = event.y - first.y;
    if (horizontal === 0 && vertical === 0) return { state: next, intents: NONE };
    return { state: next, intents: [{ kind: "pan", dx: horizontal, dy: vertical }] };
  }
  const nextFirst = first.pointerId === event.pointerId ? moved(first, event) : first;
  const nextSecond = second.pointerId === event.pointerId ? moved(second, event) : second;
  const twoFingerTap = state.twoFingerTap && withinSlop(nextFirst) && withinSlop(nextSecond);
  const settled = { ...state, first: nextFirst, second: nextSecond, twoFingerTap };
  if (twoFingerTap || state.anchor === null) return { state: settled, intents: NONE };
  const anchor = state.anchor;
  const current = pairOf(nextFirst, nextSecond);
  const factor =
    anchor.distance < MINIMUM_PINCH_DISTANCE || current.distance < MINIMUM_PINCH_DISTANCE
      ? 1
      : current.distance / anchor.distance;
  return {
    state: { ...settled, anchor: current },
    intents: [
      {
        kind: "pinch",
        factor,
        centreX: current.x,
        centreY: current.y,
        dx: current.x - anchor.x,
        dy: current.y - anchor.y,
      },
    ],
  };
}

function up(state: GestureState, event: GesturePointer): { state: GestureState; intents: readonly GestureIntent[] } {
  const { first, second } = state;
  if (first === null || !owns(state, event.pointerId)) return { state, intents: NONE };
  if (state.phase === "pinch" && second !== null) {
    const lifting = first.pointerId === event.pointerId ? moved(first, event) : moved(second, event);
    const remaining = first.pointerId === event.pointerId ? second : first;
    return {
      state: {
        ...state,
        phase: "pan",
        first: remaining,
        second: null,
        anchor: null,
        twoFingerTap:
          state.twoFingerTap && withinSlop(lifting) && event.time - state.firstDownTime <= TWO_FINGER_TAP_INTERVAL,
        lifted: { x: lifting.x, y: lifting.y },
      },
      intents: NONE,
    };
  }
  const released = moved(first, event);
  if (state.phase === "pan") {
    const completes =
      state.twoFingerTap &&
      state.lifted !== null &&
      withinSlop(released) &&
      event.time - state.firstDownTime <= TWO_FINGER_TAP_INTERVAL;
    return {
      state: { ...IDLE },
      intents:
        completes && state.lifted !== null
          ? [{ kind: "twoFingerTap", x: (state.lifted.x + event.x) / 2, y: (state.lifted.y + event.y) / 2 }]
          : NONE,
    };
  }
  if (!withinSlop(released)) return { state: { ...IDLE }, intents: NONE };
  if (state.pointerType !== "touch") {
    return { state: { ...IDLE }, intents: [{ kind: "tap", x: event.x, y: event.y, pointerType: state.pointerType }] };
  }
  const previous = state.lastTap;
  const doubled =
    previous !== null &&
    event.time - previous.time <= DOUBLE_TAP_INTERVAL &&
    Math.hypot(event.x - previous.x, event.y - previous.y) <= DOUBLE_TAP_DISTANCE;
  if (doubled) return { state: { ...IDLE }, intents: [{ kind: "doubleTap", x: event.x, y: event.y }] };
  return {
    state: { ...IDLE, lastTap: { x: event.x, y: event.y, time: event.time } },
    intents: [{ kind: "tap", x: event.x, y: event.y, pointerType: "touch" }],
  };
}
