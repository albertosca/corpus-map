import type { CSSProperties, ReactElement, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { token } from "../tokens";

export interface WheelEventSample {
  /** A per-capture counter, unique across the session — never the array index, so React's list keys survive the newest-first reorder. */
  id: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  /** Milliseconds since the previous captured event, or `null` for the first one this mount has seen. */
  msSincePrevious: number | null;
}

export interface WheelCaptureProps {
  /** The map's own container — a passive, read-only listener attaches here and is removed on unmount; it never calls `preventDefault`, so it never competes with the library's own non-passive zoom listener on the same element. */
  containerRef: RefObject<HTMLElement | null>;
}

const MAXIMUM_SAMPLES = 50;

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
};

const copyButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  padding: "4px 10px",
  borderRadius: 4,
  border: `1px solid ${token("borderStrong")}`,
  background: token("surface"),
  color: token("text"),
  fontSize: 12,
  // This button lives inside `TuningPanel`'s `data-floating-control`
  // (`WheelCapture` has no floating container of its own), so a
  // percentage `maxWidth` here genuinely caps it at the panel's width --
  // real CSS containment (Task 7 fix round 2), not a value chosen to
  // please the overflow check.
  maxWidth: "100%",
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: token("textMuted"),
};

const tableWrapStyle: CSSProperties = {
  maxHeight: 220,
  overflowY: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};

const thStyle: CSSProperties = {
  textAlign: "right",
  padding: "2px 6px",
  borderBottom: `1px solid ${token("borderMedium")}`,
  fontWeight: 600,
  position: "sticky",
  top: 0,
  background: token("surfaceSolid"),
};

const tdStyle: CSSProperties = {
  textAlign: "right",
  padding: "2px 6px",
  borderBottom: `1px solid ${token("divider")}`,
};

/** What the "Copy" button writes — the samples without the internal `id`, oldest capture concerns aside. */
function toClipboardPayload(samples: readonly WheelEventSample[]): string {
  return JSON.stringify(
    samples.map(({ deltaY: verticalDelta, deltaMode, ctrlKey, msSincePrevious }) => ({
      deltaY: verticalDelta,
      deltaMode,
      ctrlKey,
      msSincePrevious,
    })),
    null,
    2,
  );
}

/**
 * A read-only, passive `wheel` listener on the map container (showcase
 * Task 7, spec 4 §2 "Trackpad capture"): records the last 50 events —
 * `deltaY`, `deltaMode`, `ctrlKey`, and the milliseconds since the previous
 * one — newest first, in a table with a "Copy" button, so Alberto can
 * measure what his trackpad and mouse actually send (the numbers spec 2
 * left to his hands). Rendered only while the tuning panel is open
 * (`TuningPanel` mounts it conditionally); mounting attaches the listener,
 * unmounting removes it.
 */
export function WheelCapture({ containerRef: containerReference }: WheelCaptureProps): ReactElement {
  const [samples, setSamples] = useState<WheelEventSample[]>([]);
  const lastTimeReference = useRef<number | null>(null);
  const nextIdReference = useRef(0);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    const element = containerReference.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      const previous = lastTimeReference.current;
      lastTimeReference.current = now;
      const id = nextIdReference.current;
      nextIdReference.current += 1;
      const sample: WheelEventSample = {
        id,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        msSincePrevious: previous === null ? null : Math.round(now - previous),
      };
      // Read-only on purpose: never `event.preventDefault()` — a passive
      // listener could not stop the default action anyway, and this
      // listener exists to observe, not to act.
      setSamples((previous) => [sample, ...previous].slice(0, MAXIMUM_SAMPLES));
    };
    element.addEventListener("wheel", onWheel, { passive: true });
    return () => element.removeEventListener("wheel", onWheel);
  }, [containerReference]);

  const handleCopy = () => {
    navigator.clipboard.writeText(toClipboardPayload(samples)).then(
      () => setCopyMessage("Copied to clipboard."),
      () => setCopyMessage("Could not copy to clipboard."),
    );
  };

  return (
    <div data-wheel-capture style={wrapStyle}>
      <h3 style={headingStyle}>Wheel capture</h3>
      <button type="button" onClick={handleCopy} style={copyButtonStyle}>
        Copy
      </button>
      {copyMessage ? (
        <p role="status" style={statusStyle}>
          {copyMessage}
        </p>
      ) : null}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Delta Y</th>
              <th style={thStyle}>Mode</th>
              <th style={thStyle}>Ctrl</th>
              <th style={thStyle}>Interval (ms)</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample) => (
              <tr key={sample.id}>
                <td style={tdStyle}>{sample.deltaY.toFixed(2)}</td>
                <td style={tdStyle}>{sample.deltaMode}</td>
                <td style={tdStyle}>{sample.ctrlKey ? "yes" : "no"}</td>
                <td style={tdStyle}>{sample.msSincePrevious === null ? "-" : sample.msSincePrevious}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
