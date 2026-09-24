import type { CSSProperties, ReactElement, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

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

const MAX_SAMPLES = 50;

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
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 12,
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "#555b66",
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
  borderBottom: "1px solid rgba(0,0,0,0.15)",
  fontWeight: 600,
  position: "sticky",
  top: 0,
  background: "#ffffff",
};

const tdStyle: CSSProperties = {
  textAlign: "right",
  padding: "2px 6px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

/** What the "Copy" button writes — the samples without the internal `id`, oldest capture concerns aside. */
function toClipboardPayload(samples: readonly WheelEventSample[]): string {
  return JSON.stringify(
    samples.map(({ deltaY, deltaMode, ctrlKey, msSincePrevious }) => ({ deltaY, deltaMode, ctrlKey, msSincePrevious })),
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
export function WheelCapture({ containerRef }: WheelCaptureProps): ReactElement {
  const [samples, setSamples] = useState<WheelEventSample[]>([]);
  const lastTimeRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const previous = lastTimeRef.current;
      lastTimeRef.current = now;
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      const sample: WheelEventSample = {
        id,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        msSincePrevious: previous === null ? null : Math.round(now - previous),
      };
      // Read-only on purpose: never `e.preventDefault()` — a passive
      // listener could not stop the default action anyway, and this
      // listener exists to observe, not to act.
      setSamples((prev) => [sample, ...prev].slice(0, MAX_SAMPLES));
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef]);

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
            {samples.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.deltaY.toFixed(2)}</td>
                <td style={tdStyle}>{s.deltaMode}</td>
                <td style={tdStyle}>{s.ctrlKey ? "yes" : "no"}</td>
                <td style={tdStyle}>{s.msSincePrevious === null ? "-" : s.msSincePrevious}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
