import { type ReactElement, type SyntheticEvent, useId, useState } from "react";
import { CORNER_POSITION, type Corner } from "../shared/corner";
import type { Presentation } from "../shared/presentation";
import type { Theme } from "../shared/theme";
import type { LegendEntry } from "./entries";

export interface LegendProps {
  entries: LegendEntry[];
  more: number;
  presentation: Presentation;
  corner: Corner;
  theme: Pick<Theme, "cardBackground" | "cardBorder" | "territoryLabel" | "pointNeutral">;
  onEntry: (id: string) => void;
}

const SWATCH = 12;

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * The map's legend (spec slice D §4): real HTML, so a screen reader reads
 * it; expanded in guided, collapsed behind a "Legend" toggle in dense. A
 * toggle the reader pressed holds only until the presentation changes; an
 * entry press keeps the list open through the change its zoom causes. Every
 * pointer event stops here so a press on the legend never pans the map or
 * resolves a card click underneath.
 */
export function Legend({ entries, more, presentation, corner, theme, onEntry }: LegendProps): ReactElement {
  const listId = useId();
  // A toggle the reader pressed holds until the presentation changes; the
  // reset happens during render (React's "adjust state on a prop change"
  // pattern), so the first render in the new presentation is already right.
  // An entry press zooms, which usually changes the presentation; the list
  // the reader just used stays open through that one change, so the pressed
  // button keeps focus and a second entry is one press away.
  const [override, setOverride] = useState<boolean | null>(null);
  const [overrideFor, setOverrideFor] = useState(presentation);
  const [holdOpen, setHoldOpen] = useState(false);
  if (overrideFor !== presentation) {
    setOverrideFor(presentation);
    setOverride(holdOpen ? true : null);
    setHoldOpen(false);
  }
  const expanded = overrideFor === presentation && override !== null ? override : presentation === "guided";
  const text = { color: theme.territoryLabel, font: "500 13px system-ui, sans-serif" };
  return (
    <section
      aria-label="Map legend"
      data-legend=""
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={stop}
      style={{
        position: "absolute",
        ...CORNER_POSITION[corner],
        maxWidth: 240,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: 8,
        background: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 6,
        ...text,
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => {
          setHoldOpen(false);
          setOverride(!expanded);
        }}
        style={{
          ...text,
          minHeight: 24,
          background: "none",
          border: "none",
          padding: 0,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Legend
      </button>
      {expanded ? (
        <div id={listId}>
          <ul style={{ listStyle: "none", margin: "4px 0", padding: 0 }}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    setHoldOpen(true);
                    onEntry(entry.id);
                  }}
                  style={{
                    ...text,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 24,
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: SWATCH, height: SWATCH, flex: "none", borderRadius: 2, background: entry.colour }}
                  />
                  {entry.name}
                </button>
              </li>
            ))}
            {more > 0 ? <li>{`+${more} more`}</li> : null}
          </ul>
          <ul style={{ listStyle: "none", margin: "4px 0", padding: 0 }}>
            <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg aria-hidden="true" width={SWATCH} height={SWATCH} viewBox="0 0 12 12">
                <circle cx={6} cy={6} r={3.5} fill={theme.pointNeutral} />
              </svg>
              Visited
            </li>
            <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg aria-hidden="true" width={SWATCH} height={SWATCH} viewBox="0 0 12 12">
                <circle cx={6} cy={6} r={2.75} fill="none" stroke={theme.pointNeutral} strokeWidth={1.5} />
              </svg>
              Not visited
            </li>
          </ul>
          <p style={{ margin: 0 }}>Scroll to zoom, drag to pan</p>
        </div>
      ) : null}
    </section>
  );
}
