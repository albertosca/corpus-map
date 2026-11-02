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

/** How long the query must rest before it is searched (spec search §4). */
export const SEARCH_DEBOUNCE_MILLISECONDS = 200;

export interface SearchBoxProps {
  /** The corpus the local search runs over; a new spec object clears the box. */
  spec: MapSpec;
  /** Finds ids for a query, replacing the local search (a server, a worker, a vector index). May be asynchronous; ids the map does not know are ignored by it. */
  search?: ((query: string) => readonly string[] | Promise<readonly string[]>) | undefined;
  /** The matches to draw: a list of ids (empty means no match), or `null` when no search is active. Pass it to `CorpusMap`'s `matches`. */
  onMatches: (ids: readonly string[] | null) => void;
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

type Status = { kind: "idle" } | { kind: "found"; count: number } | { kind: "failed" };
const IDLE: Status = { kind: "idle" };
const TOUCH_TARGET = 44;

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

function statusText(status: Status): string {
  if (status.kind === "failed") return "Search failed";
  if (status.kind === "idle") return "";
  if (status.count === 0) return "No results";
  return status.count === 1 ? "1 result" : `${status.count} results`;
}

/**
 * A search box for `CorpusMap`'s `matches` (spec search §4): debounced, the
 * local search over labels and `meta` unless a `search` is given, one answer
 * at a time (a slow older answer is dropped), cleared by Escape, the clear
 * button or a new spec. Neutral inline styles that inherit the colour and the
 * font, so it follows the page's theme.
 */
export function SearchBox(properties: SearchBoxProps): ReactElement {
  const { spec, search, onMatches, onShow, hint, touchTargets, style } = properties;
  const label = properties.label ?? "Search";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>(IDLE);
  // A new spec starts a new search: reset while rendering, and the query effect below reports the clear.
  const [knownSpec, setKnownSpec] = useState(spec);
  if (knownSpec !== spec) {
    setKnownSpec(spec);
    setQuery("");
    setStatus(IDLE);
  }
  const inputReference = useRef<HTMLInputElement>(null);
  const hintIdentifier = useId();
  // The newest props for the timer and the answer, which outlive the render that scheduled them.
  const latest = useRef({ spec, search, onMatches });
  useEffect(() => {
    latest.current = { spec, search, onMatches };
  });
  // Bumped by every change that makes an answer in flight out of date.
  const generation = useRef(0);
  const touched = useRef(false);

  useEffect(
    () => () => {
      generation.current += 1;
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
      latest.current.onMatches(null);
      return;
    }
    const mine = generation.current;
    const timer = setTimeout(async () => {
      const current = latest.current;
      let found: readonly string[];
      try {
        found = await (current.search
          ? current.search(trimmed)
          : searchIndexAsync(current.spec).then((index) => localSearch(index, trimmed)));
      } catch {
        if (generation.current !== mine) return;
        setStatus({ kind: "failed" });
        latest.current.onMatches(null);
        return;
      }
      if (generation.current !== mine) return;
      const ids = [...new Set(found)];
      setStatus({ kind: "found", count: ids.length });
      latest.current.onMatches(ids);
    }, SEARCH_DEBOUNCE_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [query]);

  const changeQuery = (next: string) => {
    setQuery(next);
    if (next.trim() === "") setStatus(IDLE);
  };
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
    ...target,
  };

  return (
    <search
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", maxWidth: "100%", ...style }}
    >
      <input
        ref={inputReference}
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintIdentifier}
        value={query}
        onChange={(event: ChangeEvent<HTMLInputElement>) => changeQuery(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Escape" || query === "") return;
          event.preventDefault();
          event.stopPropagation();
          changeQuery("");
        }}
        style={{ ...control, flex: "1 1 8rem", minWidth: 0 }}
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
      <span role="status" style={{ font: "inherit", opacity: 0.8 }}>
        {statusText(status)}
      </span>
      {onShow !== undefined && status.kind === "found" && status.count > 0 ? (
        <button type="button" onClick={onShow} style={{ ...control, cursor: "pointer" }}>
          Show on map
        </button>
      ) : null}
    </search>
  );
}
