import { memo, type ReactElement, type SyntheticEvent, useId, useState } from "react";
import type { HeadingTag } from "../a11y/headingLevel";
import { CORNER_MARGIN, type Corner, OVERLAY_LAYER } from "../shared/corner";
import { type Insets, NO_INSETS } from "../shared/insets";
import type { Presentation } from "../shared/presentation";
import type { Theme } from "../shared/theme";
import type { TerritoryGroup } from "../territories/groups";
import type { LegendEntry } from "./entries";
import { groupOpen, legendModel } from "./model";

/** Opacity of a row whose territory is off screen; Legend.test.tsx pins 4.5:1 contrast in both themes. */
export const OFF_SCREEN_OPACITY = 0.75;

export interface LegendProps {
  entries: readonly LegendEntry[];
  groups: readonly TerritoryGroup[];
  onScreen: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  presentation: Presentation;
  corner: Corner;
  /** A CSS height ceiling (`legendMaximumHeight`), so the expanded list never runs over the minimap. */
  maximumHeight: string;
  /** The area a consumer overlay covers: the legend sits clear of it on its own side and, on the far side, of the larger of that inset and the minimap's reserve (spec assistant, `insets`). */
  insets?: Insets | undefined;
  theme: Pick<Theme, "cardBackground" | "cardBorder" | "territoryLabel" | "pointNeutral">;
  /** The map's box is narrower than 480 px: start collapsed in every presentation (spec categories §6). */
  narrow: boolean;
  /** The map's box is narrower than 600 px: every control is at least 44 px tall (spec mobile §5). */
  touchTargets?: boolean | undefined;
  /** The element group disclosures sit in, so a screen reader can jump between groups (spec slice B §6). */
  heading?: HeadingTag | undefined;
  onEntry: (id: string) => void;
  onHiddenChange: (ids: string[]) => void;
}

const SWATCH = 12;

const plainButton = { minHeight: 24, background: "none", border: "none", padding: 0, cursor: "pointer" } as const;
/** The native checkbox is 13 px; its label carries the 24 px touch target. */
const checkboxTarget = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "none",
  minWidth: 24,
  minHeight: 24,
  cursor: "pointer",
} as const;

/** A finger-sized control: 44 px tall, its content centred vertically. */
function touch<Style extends object>(style: Style, touchTargets: boolean): Style | (Style & typeof FINGER) {
  return touchTargets ? { ...style, ...FINGER } : style;
}
const FINGER = { minHeight: 44, alignItems: "center" } as const;

/** A corner's two offsets: its margin, pushed in by the overlay's inset on that same side. */
function clearOf(corner: Corner, insets: Insets): Partial<Record<keyof Insets, number>> {
  const [vertical, horizontal] = corner.split("-") as [keyof Insets, keyof Insets];
  return { [vertical]: CORNER_MARGIN + insets[vertical], [horizontal]: CORNER_MARGIN + insets[horizontal] };
}

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * The map's legend (spec slice D §4, spec categories §6): real HTML, so a
 * screen reader reads it; expanded in guided, collapsed behind a "Legend"
 * toggle in dense or in a narrow box. The list is complete and filterable:
 * every territory, under its group when the scene has groups, on-screen rows
 * first. A row's checkbox hides or shows its territory, a group's checkbox
 * all of its members; a group with nothing on screen starts collapsed. A
 * toggle the reader pressed holds only until the presentation changes; an
 * entry press keeps the list open through the change its zoom causes. Every
 * pointer event stops here so a press on the legend never pans the map or
 * resolves a card click underneath.
 */
export function LegendView(properties: LegendProps): ReactElement {
  const {
    entries,
    groups,
    onScreen,
    hidden,
    presentation,
    corner,
    maximumHeight,
    insets = NO_INSETS,
    theme,
    narrow,
    touchTargets = false,
    onEntry,
    onHiddenChange,
  } = properties;
  const Heading = properties.heading ?? "h3";
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
  const expanded = overrideFor === presentation && override !== null ? override : presentation === "guided" && !narrow;
  const [filter, setFilter] = useState("");
  // The reader's open/closed choice per group, forgotten when the filter changes.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const model = legendModel(entries, groups, onScreen, hidden, filter);
  const setHidden = (next: Iterable<string>) => onHiddenChange([...new Set(next)].sort());
  const toggleRow = (id: string) =>
    setHidden(hidden.has(id) ? [...hidden].filter((other) => other !== id) : [...hidden, id]);
  const toggleGroup = (memberIds: readonly string[], shown: "all" | "none" | "mixed") =>
    setHidden(shown === "all" ? [...hidden, ...memberIds] : [...hidden].filter((other) => !memberIds.includes(other)));
  const text = { color: theme.territoryLabel, font: "500 13px system-ui, sans-serif" };
  const button = touch(plainButton, touchTargets);
  const checkbox = touch(checkboxTarget, touchTargets);
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
        ...clearOf(corner, insets),
        zIndex: OVERLAY_LAYER,
        maxWidth: 280,
        maxHeight: maximumHeight,
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
        style={{ ...text, ...button, fontWeight: 600 }}
      >
        Legend
      </button>
      {expanded ? (
        <div id={listId}>
          {hidden.size > 0 ? (
            <button type="button" onClick={() => onHiddenChange([])} style={{ ...text, ...button }}>
              {`Show all (${hidden.size} hidden)`}
            </button>
          ) : null}
          <input
            type="search"
            name="corpus-map-legend-filter"
            aria-label="Filter categories"
            placeholder="Filter categories"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setManual({});
            }}
            style={{
              ...text,
              width: "100%",
              boxSizing: "border-box",
              minHeight: touchTargets ? FINGER.minHeight : 24,
              margin: "4px 0",
            }}
          />
          {model.groups.length === 0 ? <p style={{ margin: "4px 0" }}>No category matches</p> : null}
          {model.groups.map((group) => {
            const open = model.flat || groupOpen(group, filter, manual[group.id]);
            return (
              <div key={group.id}>
                {model.flat ? null : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={checkbox}>
                      <input
                        type="checkbox"
                        name="corpus-map-legend-group"
                        value={group.id}
                        aria-label={`Show ${group.name}`}
                        checked={group.shown === "all"}
                        ref={(element) => {
                          if (element) element.indeterminate = group.shown === "mixed";
                        }}
                        onChange={() => toggleGroup(group.memberIds, group.shown)}
                        style={{ margin: 0 }}
                      />
                    </label>
                    <Heading style={{ margin: 0, font: "inherit", flex: 1, display: "flex" }}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setManual((previous) => ({ ...previous, [group.id]: !open }))}
                        style={{ ...text, ...button, fontWeight: 600, flex: 1, textAlign: "left" }}
                      >
                        {group.name} <span style={{ fontWeight: 400 }}>{`${group.onScreenCount} on screen`}</span>
                      </button>
                    </Heading>
                  </div>
                )}
                {open ? (
                  <ul style={{ listStyle: "none", margin: "2px 0", padding: model.flat ? 0 : "0 0 0 18px" }}>
                    {group.rows.map((row) => (
                      <li
                        key={row.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          opacity: row.onScreen ? 1 : OFF_SCREEN_OPACITY,
                        }}
                      >
                        {/* A one-member group's header checkbox already toggles this row; a second
                            "Show X" would repeat it. The spacer keeps the swatches aligned. */}
                        {!model.flat && group.memberIds.length === 1 ? (
                          <span aria-hidden="true" style={checkbox} />
                        ) : (
                          <label style={checkbox}>
                            <input
                              type="checkbox"
                              name="corpus-map-legend-territory"
                              value={row.id}
                              aria-label={`Show ${row.name}`}
                              checked={!row.hidden}
                              onChange={() => toggleRow(row.id)}
                              style={{ margin: 0 }}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setHoldOpen(true);
                            onEntry(row.id);
                          }}
                          style={{
                            ...text,
                            ...button,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flex: 1,
                            textAlign: "left",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: SWATCH,
                              height: SWATCH,
                              flex: "none",
                              borderRadius: 2,
                              background: row.colour,
                            }}
                          />
                          {row.name}
                        </button>
                        <span>{row.members}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
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
          <p style={{ margin: 0 }}>Pinch or scroll to zoom, drag to pan</p>
        </div>
      ) : null}
    </section>
  );
}

export const Legend = memo(LegendView);
