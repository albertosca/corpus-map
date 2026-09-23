import type { Tuning } from "../shared/tuning";

/** Pixels per `deltaMode` unit: 0 pixels, 1 lines, 2 pages (MapLibre and OpenLayers use 40 and 300). */
const PIXELS_PER_MODE = [1, 40, 300] as const;

export interface WheelInput {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

/**
 * Multiplicative zoom factor for one wheel event. Exponential in the delta,
 * so a scroll yields the same final scale whether it arrives as one event or
 * many (Guiard and Beaudouin-Lafon 2004: control the zoom index, not the
 * scale). `ctrlKey` marks a trackpad pinch. A single event is capped so a
 * large line- or page-mode notch cannot jump.
 */
export function wheelZoomFactor(
  e: WheelInput,
  t: Pick<Tuning, "wheelSensitivity" | "pinchGain" | "maxZoomPerEvent">,
): number {
  const perUnit = PIXELS_PER_MODE[e.deltaMode as 0 | 1 | 2] ?? 1;
  const delta = e.deltaY * perUnit * (e.ctrlKey ? t.pinchGain : 1);
  const factor = Math.exp(-delta * t.wheelSensitivity);
  return Math.min(t.maxZoomPerEvent, Math.max(1 / t.maxZoomPerEvent, factor));
}
