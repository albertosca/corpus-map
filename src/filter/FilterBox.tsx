import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MapSpec } from "../shared/spec";
import { buildFilterIndex, type FilterAttribute, idsFromIndex } from "./facets";

export interface FilterBoxProps {
  /** The corpus whose items are filtered; a new spec object clears the selection. */
  spec: MapSpec;
  /** Which value or values an item has. Keep the reference stable: the facets are computed once per `spec` and `attribute` pair. */
  attribute: FilterAttribute;
  /** The ids that pass the filter, or `null` while nothing is selected. Pass it to `CorpusMap`'s `matches`, through `intersectMatches` when a search is also active. */
  onMatches: (ids: readonly string[] | null) => void;
  /** The button's text and the group's accessible name; "Filter" by default. */
  label?: string | undefined;
  /** Gives every control a 44 px target, for a narrow box. */
  touchTargets?: boolean | undefined;
  /** Extra inline styles for the container. */
  style?: CSSProperties | undefined;
}

const TOUCH_TARGET = 44;
/** The space kept between an open panel and the window's edge. */
const WINDOW_MARGIN = 12;
const NOTHING_SELECTED: ReadonlySet<string> = new Set();
const QUIET = { text: "", pad: false };

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

/**
 * A checkbox filter for `CorpusMap`'s `matches` (spec filter §3): one disclosure
 * listing each value of an attribute with its item count, several values at
 * once (any of them passes). It owns its selection, clears it on a new spec and
 * reports through `onMatches`, like `SearchBox`. Neutral inline styles that
 * inherit the colour and the font; the panel uses the page's `Canvas` colours,
 * which follow its `color-scheme`.
 */
export function FilterBox(properties: FilterBoxProps): ReactElement {
  const { spec, attribute, onMatches, touchTargets, style } = properties;
  const label = properties.label ?? "Filter";
  const index = useMemo(() => buildFilterIndex(spec, attribute), [spec, attribute]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NOTHING_SELECTED);
  const [announcement, setAnnouncement] = useState(QUIET);
  // A new spec starts a new filter: reset while rendering, and the effect below reports the clear.
  const [knownSpec, setKnownSpec] = useState(spec);
  if (knownSpec !== spec) {
    setKnownSpec(spec);
    setSelected(NOTHING_SELECTED);
    setAnnouncement(QUIET);
    setOpen(false);
  }
  const buttonReference = useRef<HTMLButtonElement>(null);
  const panelReference = useRef<HTMLFieldSetElement>(null);
  // How far the open panel is moved sideways so it stays inside the window (0 or negative).
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const element = panelReference.current;
    if (!open || !element) return;
    const place = () => {
      const box = element.getBoundingClientRect();
      // No layout (a hidden or detached panel): nothing to measure, so nothing to move.
      if (box.width === 0) return;
      const naturalLeft = box.left - shift;
      const naturalRight = box.right - shift;
      const room = document.documentElement.clientWidth - WINDOW_MARGIN;
      const next = Math.max(Math.min(0, room - naturalRight), WINDOW_MARGIN - naturalLeft);
      if (next !== shift) setShift(next);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, shift]);
  const panelIdentifier = useId();
  const emptyIdentifier = useId();
  // The newest props for the effect below, which reads them after the render that set them.
  const latest = useRef({ index, onMatches });
  useEffect(() => {
    latest.current = { index, onMatches };
  });
  // Whether the consumer holds ids from this box, so a clear is reported once and a mount never is.
  const reported = useRef(false);
  useEffect(() => {
    if (selected.size === 0 && !reported.current) return;
    reported.current = selected.size > 0;
    latest.current.onMatches(idsFromIndex(latest.current.index, selected));
  }, [selected]);

  const choose = (next: ReadonlySet<string>) => {
    setSelected(next);
    const ids = idsFromIndex(index, next);
    const text = ids === null ? "" : `${ids.length} of ${index.items.length} items`;
    // The same text twice alternates a trailing no-break space, so a live region speaks the repeat.
    setAnnouncement((previous) => ({ text, pad: text !== "" && previous.text === text && !previous.pad }));
  };
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    choose(next);
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    buttonReference.current?.focus();
  };

  const empty = index.facets.length === 0;
  const target: CSSProperties = touchTargets ? { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET } : {};
  const control: CSSProperties = {
    font: "inherit",
    color: "inherit",
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 45%, transparent)",
    borderRadius: 6,
    padding: "4px 8px",
    // A control never grows past its container, so a narrow bar cannot be pushed wider by one.
    maxWidth: "100%",
    whiteSpace: "nowrap",
    ...target,
  };
  const panel: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: shift,
    zIndex: 10,
    marginTop: 4,
    display: open ? "flex" : "none",
    flexDirection: "column",
    gap: 2,
    padding: 8,
    // As wide as the longest label, but never past the window: a longer label wraps.
    width: "max-content",
    maxWidth: "calc(100vw - 24px)",
    maxHeight: "min(24rem, 60vh)",
    overflowY: "auto",
    background: "Canvas",
    color: "CanvasText",
    border: "1px solid color-mix(in srgb, currentColor 45%, transparent)",
    borderRadius: 6,
    boxShadow: "0 2px 10px color-mix(in srgb, currentColor 25%, transparent)",
    // A fieldset brings a margin and a content-sized minimum width of its own.
    marginInline: 0,
    marginBottom: 0,
  };
  const row: CSSProperties = { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", ...target };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handler only catches the Escape of the controls inside
    <div
      onKeyDown={closeOnEscape}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%", ...style }}
    >
      <button
        ref={buttonReference}
        type="button"
        disabled={empty}
        aria-expanded={open}
        aria-controls={panelIdentifier}
        aria-describedby={empty ? emptyIdentifier : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        style={{ ...control, cursor: empty ? "default" : "pointer" }}
      >
        {selected.size === 0 ? label : `${label} (${selected.size})`}
      </button>
      {empty ? (
        <span id={emptyIdentifier} style={VISUALLY_HIDDEN}>
          No values to filter by
        </span>
      ) : null}
      <fieldset ref={panelReference} id={panelIdentifier} aria-label={label} hidden={!open} style={panel}>
        {selected.size === 0 ? null : (
          <button
            type="button"
            onClick={() => {
              choose(NOTHING_SELECTED);
              buttonReference.current?.focus();
            }}
            style={{ ...control, cursor: "pointer", alignSelf: "flex-start" }}
          >
            Clear filter
          </button>
        )}
        {index.facets.map((facet) => (
          <label key={facet.value} style={row}>
            <input
              type="checkbox"
              checked={selected.has(facet.value)}
              onChange={() => toggle(facet.value)}
              style={{ width: 24, height: 24, margin: 0, flexShrink: 0 }}
            />
            {`${facet.label} (${facet.count})`}
          </label>
        ))}
      </fieldset>
      <span role="status" style={{ font: "inherit", opacity: 0.8, whiteSpace: "nowrap" }}>
        {announcement.pad ? `${announcement.text} ` : announcement.text}
      </span>
    </div>
  );
}
