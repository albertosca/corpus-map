import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { MapSpec } from "../shared/spec";
import { localSearch, searchIndexAsync } from "./localSearch";
import { labelOf, orderAnswer, orderLocal, type RankRule, type ScoredId } from "./rank";

/** How long the query must rest before it is searched (spec search §4). */
export const SEARCH_DEBOUNCE_MILLISECONDS = 200;
/** How many results the list renders; the rest is one "and N more" line (spec ranking §4). */
export const SEARCH_RESULTS_VISIBLE = 50;

export interface SearchBoxProps {
  /** The corpus the local search runs over; a new spec object clears the box. */
  spec: MapSpec;
  /**
   * Finds ids for a query, replacing the local search (a server, a worker, a vector index). May be asynchronous; ids the map does not know are ignored by it.
   * Return ids to keep the order you ranked them in, or `{ id, score }` entries to have them sorted by score (highest first, equal scores by `rank`, then alphabetically).
   */
  search?: ((query: string) => readonly (string | ScoredId)[] | Promise<readonly (string | ScoredId)[]>) | undefined;
  /** How local matches are ordered, and how ties among a consumer's scores are broken: "connections" (default, most edges first), "alphabetical", or a score function (higher first). Ties are always alphabetical. A consumer's plain id list keeps its own order. */
  rank?: RankRule | undefined;
  /** The matches to draw, best first: a list of ids (empty means no match), or `null` when no search is active. Pass it to `CorpusMap`'s `matches`. */
  onMatches: (ids: readonly string[] | null) => void;
  /** Called with an item's id when the reader presses Enter or picks a result; pair it with `CorpusMapHandle.reveal`. Typing never calls it. */
  onGo?: ((id: string) => void) | undefined;
  /** When given, a "Show on map" button appears beside a non-empty result; pair it with `CorpusMapHandle.revealAll`. */
  onShow?: (() => void) | undefined;
  /** The accessible name of the search landmark and the input; "Search" by default. */
  label?: string | undefined;
  /** A line of help the input is described by, for example where the search runs. */
  hint?: string | undefined;
  /** Gives every control a 44 px target, for a narrow box. */
  touchTargets?: boolean | undefined;
  /** Extra inline styles for the container. */
  style?: CSSProperties | undefined;
}

/** `pad` alternates a trailing no-break space when an answer repeats the previous text, so a live region speaks it again. */
type Status = { kind: "idle" } | { kind: "found"; count: number; pad?: boolean } | { kind: "failed"; pad?: boolean };
const IDLE: Status = { kind: "idle" };

/** The ranked results under the input: the newest answer's ids, the active row (-1 for none) and whether the list is showing. */
interface Results {
  ids: readonly string[];
  active: number;
  open: boolean;
}
const NO_RESULTS: Results = { ids: [], active: -1, open: false };
const TOUCH_TARGET = 44;

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

// The list floats under the input inside the container, so it never grows the page or the bar that holds the box.
const LIST_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 20,
  margin: "4px 0 0",
  padding: 4,
  listStyle: "none",
  maxHeight: "50vh",
  overflowY: "auto",
  background: "Canvas",
  color: "CanvasText",
  border: "1px solid color-mix(in srgb, currentColor 45%, transparent)",
  borderRadius: 6,
};
const ROW_STYLE: CSSProperties = { padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" };
const ACTIVE_ROW_STYLE: CSSProperties = { background: "color-mix(in srgb, currentColor 14%, transparent)" };
const MORE_STYLE: CSSProperties = { padding: "6px 8px", opacity: 0.8 };

function baseText(status: Status): string {
  if (status.kind === "failed") return "Search failed";
  if (status.kind === "idle") return "";
  if (status.count === 0) return "No results";
  return status.count === 1 ? "1 result" : `${status.count} results`;
}

function statusText(status: Status): string {
  return status.kind !== "idle" && status.pad ? `${baseText(status)}\u00a0` : baseText(status);
}

/** The status to show for an answer: the same text as the one before it is padded, so it is announced again. */
function announced(previous: Status, next: Exclude<Status, { kind: "idle" }>): Status {
  return previous.kind !== "idle" && !previous.pad && baseText(previous) === baseText(next)
    ? { ...next, pad: true }
    : next;
}

/**
 * A search box for `CorpusMap`'s `matches` (spec search §4): debounced, the
 * local search over labels and `meta` unless a `search` is given, one answer
 * at a time (a slow older answer is dropped), cleared by Escape, the clear
 * button or a new spec. Neutral inline styles that inherit the colour and the
 * font, so it follows the page's theme.
 */
export function SearchBox(properties: SearchBoxProps): ReactElement {
  const { spec, search, onMatches, onShow, onGo, hint, touchTargets, style } = properties;
  const rank = properties.rank ?? "connections";
  const label = properties.label ?? "Search";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>(IDLE);
  const [results, setResults] = useState<Results>(NO_RESULTS);
  // A new spec starts a new search: reset while rendering, and the query effect below reports the clear.
  const [knownSpec, setKnownSpec] = useState(spec);
  if (knownSpec !== spec) {
    setKnownSpec(spec);
    setQuery("");
    setStatus(IDLE);
    setResults(NO_RESULTS);
  }
  const inputReference = useRef<HTMLInputElement>(null);
  const showReference = useRef<HTMLButtonElement>(null);
  const hintIdentifier = useId();
  const listIdentifier = useId();
  // The newest props for the timer and the answer, which outlive the render that scheduled them.
  const latest = useRef({ spec, search, rank, onMatches });
  useEffect(() => {
    latest.current = { spec, search, rank, onMatches };
  });
  // Bumped by every change that makes an answer in flight out of date.
  const generation = useRef(0);
  const touched = useRef(false);
  // Whether the consumer holds ids from this box, so unmounting hands them back (a window resized to another layout).
  const holding = useRef(false);

  useEffect(
    () => () => {
      generation.current += 1;
      if (holding.current) latest.current.onMatches(null);
    },
    [],
  );

  useEffect(() => {
    generation.current += 1;
    if (query !== "") touched.current = true;
    else if (!touched.current) return;
    const trimmed = query.trim();
    if (trimmed === "") {
      touched.current = query !== "";
      holding.current = false;
      latest.current.onMatches(null);
      return;
    }
    const mine = generation.current;
    const timer = setTimeout(async () => {
      const current = latest.current;
      // The button that is about to go away hands its focus to the input, so a keyboard user is not dropped on the page.
      const releaseFocus = () => {
        if (showReference.current !== null && document.activeElement === showReference.current)
          inputReference.current?.focus();
      };
      let ids: string[];
      try {
        const found = await (current.search
          ? current.search(trimmed)
          : searchIndexAsync(current.spec).then((index) => localSearch(index, trimmed)));
        // Nothing at all is a broken search, not an empty result; a value that is not a list, or a mixed one, throws in the ordering.
        if (found === undefined || found === null) throw new TypeError("search returned nothing");
        ids = current.search
          ? orderAnswer(current.spec, found, current.rank)
          : orderLocal(current.spec, found as readonly string[], current.rank);
      } catch {
        if (generation.current !== mine) return;
        releaseFocus();
        setStatus((previous) => announced(previous, { kind: "failed" }));
        setResults(NO_RESULTS);
        holding.current = false;
        latest.current.onMatches(null);
        return;
      }
      if (generation.current !== mine) return;
      if (ids.length === 0) releaseFocus();
      setStatus((previous) => announced(previous, { kind: "found", count: ids.length }));
      setResults(ids.length === 0 ? NO_RESULTS : { ids, active: -1, open: true });
      holding.current = true;
      latest.current.onMatches(ids);
    }, SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [query]);

  const changeQuery = (next: string) => {
    setQuery(next);
    if (next.trim() === "") {
      setStatus(IDLE);
      setResults(NO_RESULTS);
    }
  };
  const goToResult = (id: string) => {
    setResults((previous) => ({ ...previous, open: false }));
    onGo?.(id);
  };
  const showing = results.open && results.ids.length > 0;
  const optionIdentifier = (position: number) => `${listIdentifier}-${position}`;
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

  return (
    <search
      aria-label={label}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        maxWidth: "100%",
        ...style,
      }}
    >
      <input
        ref={inputReference}
        type="text"
        name="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showing}
        aria-controls={showing ? listIdentifier : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showing && results.active >= 0 ? optionIdentifier(results.active) : undefined}
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintIdentifier}
        value={query}
        onChange={(event: ChangeEvent<HTMLInputElement>) => changeQuery(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") {
            if (query === "") return;
            event.preventDefault();
            event.stopPropagation();
            changeQuery("");
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (results.ids.length === 0) return;
            event.preventDefault();
            if (!results.open) {
              setResults({ ...results, open: true });
              return;
            }
            const last = Math.min(results.ids.length, SEARCH_RESULTS_VISIBLE) - 1;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setResults({ ...results, active: Math.min(Math.max(results.active + step, 0), last) });
            return;
          }
          if (event.key === "Enter" && showing && onGo !== undefined) {
            event.preventDefault();
            goToResult(results.ids[Math.max(results.active, 0)] as string);
          }
        }}
        style={{ ...control, flex: "1 1 4rem", minWidth: 0 }}
      />
      {hint === undefined ? null : (
        <span id={hintIdentifier} style={VISUALLY_HIDDEN}>
          {hint}
        </span>
      )}
      {query === "" ? null : (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            changeQuery("");
            inputReference.current?.focus();
          }}
          style={{ ...control, cursor: "pointer" }}
        >
          ×
        </button>
      )}
      <span role="status" style={{ font: "inherit", opacity: 0.8, whiteSpace: "nowrap" }}>
        {statusText(status)}
      </span>
      {onShow !== undefined && status.kind === "found" && status.count > 0 ? (
        <button ref={showReference} type="button" onClick={onShow} style={{ ...control, cursor: "pointer" }}>
          Show on map
        </button>
      ) : null}
      {showing ? (
        // A mouse press on a row must not take focus from the input, so the keyboard keeps working.
        <div
          id={listIdentifier}
          role="listbox"
          aria-label={`${label} results`}
          onMouseDown={(event) => event.preventDefault()}
          style={LIST_STYLE}
        >
          {results.ids.slice(0, SEARCH_RESULTS_VISIBLE).map((id, position) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the input owns the keyboard (aria-activedescendant); a row is a pointer target only.
            <div
              key={id}
              id={optionIdentifier(position)}
              role="option"
              tabIndex={-1}
              aria-selected={position === results.active}
              onClick={() => goToResult(id)}
              style={{
                ...ROW_STYLE,
                ...(position === results.active ? ACTIVE_ROW_STYLE : {}),
                ...(touchTargets ? { minHeight: TOUCH_TARGET } : {}),
              }}
            >
              {labelOf(spec, id)}
            </div>
          ))}
          {results.ids.length > SEARCH_RESULTS_VISIBLE ? (
            <div role="presentation" style={MORE_STYLE}>
              {`and ${results.ids.length - SEARCH_RESULTS_VISIBLE} more`}
            </div>
          ) : null}
        </div>
      ) : null}
    </search>
  );
}
