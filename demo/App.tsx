import type { CorpusMapHandle, LodThresholds, MapSpec, MapViewport, Tuning } from "corpus-map";
import { CorpusMap, DARK_THEME, DEFAULT_THEME, relatedItems, resolveThresholds, resolveTuning } from "corpus-map";
import { intersectMatches } from "corpus-map/filter";
import type { RankRule } from "corpus-map/search";
import { type CSSProperties, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { CARDS, cardSizeOf, LOADING_CARD_SIZE } from "./cards";
import { AssistantPanel } from "./components/AssistantPanel";
import { DRAWER_MAXIMUM_WIDTH, Drawer } from "./components/Drawer";
import { Footer } from "./components/Footer";
import { ASSISTANT_PANEL_WIDTH, assistantPanelHeight, GUTTER } from "./components/floatingLayout";
import { createViewStore, Indicator } from "./components/Indicator";
import { sheetCollapsedHeight, useNarrowWindow, useViewportHeight, useViewportWidth } from "./components/narrow";
import { type LinkStatus, TopBar } from "./components/TopBar";
import { TuningPanel } from "./components/TuningPanel";
import { useBorderBoxHeight } from "./components/useBorderBoxHeight";
import { ZoomControls } from "./components/ZoomControls";
import { type GalleryEntry, gallery, syntheticLabel } from "./corpora";
import { type CardSize, resolveDisplay } from "./corpora/display";
import { createHashWriter, type DeepLink, parseDeepLink, writeHash } from "./deepLink";
import { token } from "./tokens";
import { useColourScheme } from "./useColourScheme";

const shellStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const mapShellStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
};

/**
 * The narrow window's bottom edge (spec mobile §6): the indicator and the
 * arXiv credit side by side in 12 px text, the credit wrapping to at most a
 * second line in the room the indicator leaves. Fit sits one gutter above it.
 */
const bottomStripStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  maxWidth: "100vw",
  zIndex: 10,
  // One run of text, not a flex row: beside the indicator the credit got
  // the leftover width and took three lines at 320 px; in flow it wraps
  // under the indicator and keeps the strip to two (spec mobile §6).
  display: "block",
  padding: "4px 12px",
  lineHeight: 1.25,
  fontSize: 12,
  background: token("surface"),
  borderTop: `1px solid ${token("border")}`,
  color: token("text"),
};

const loadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: token("text"),
  fontSize: 14,
};

// Static in-flow content, like `loadingStyle` below -- a normal-flow block
// child of `data-map-shell`, never `position: fixed`/`absolute`. Task 7 fix
// round 1 added a `left`/`width` pair here solely to satisfy the overflow
// checker's syntax requirement; fix round 2's re-review called that out as
// inert (a `static` element ignores `left`, and `width: "100%"` compared
// against a <=100 ceiling can never fail regardless of real layout) and the
// wrong fix -- removed here, along with the `data-floating-control` marker
// (`App.tsx`'s render below), rather than kept to please a check that no
// longer treats this block as floating UI at all.
const errorStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  height: "100%",
  color: token("text"),
  fontSize: 14,
};

const retryButtonStyle: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  border: `1px solid ${token("borderStrong")}`,
  background: token("surface"),
  color: token("text"),
  fontSize: 13,
};

interface CurrentCorpus {
  id: GalleryEntry["id"];
  spec: MapSpec;
}

/** What the tuning panel holds for one corpus: the drafts its controls show, the last values that resolved, and why a draft did not. */
interface PanelValues {
  tuningDraft: Tuning;
  appliedTuning: Tuning;
  tuningError: string | null;
  thresholdsDraft: LodThresholds;
  appliedThresholds: LodThresholds;
  thresholdsError: string | null;
  /** Set only by the entry's `display` or an edit; otherwise the computed size, read at render (arXiv's arrives late). */
  cardSize: CardSize | undefined;
}

/**
 * The panel's values for a corpus before any edit: its gallery `display` over
 * the library defaults, through the library's validation. The card size
 * stays the entry's own, if any: the computed one is resolved at render, so
 * an edit made before a spec arrives never pins the loading size.
 */
function usePanelBaseline(display: GalleryEntry["display"]): PanelValues {
  return useMemo(() => {
    const values = resolveDisplay(display, LOADING_CARD_SIZE);
    const tuning = resolveTuning(values.tuning);
    const thresholds = resolveThresholds(values.thresholds);
    return {
      tuningDraft: tuning,
      appliedTuning: tuning,
      tuningError: null,
      thresholdsDraft: thresholds,
      appliedThresholds: thresholds,
      thresholdsError: null,
      cardSize: display?.cardSize,
    };
  }, [display]);
}

/** The synthetic corpus's own defaults (`demo/corpora/synthetic.ts`): seed 1, 5,000 items. */
const DEFAULT_SYNTHETIC_SIZE = 5000;
const DEFAULT_SYNTHETIC_SEED = 1;
// One empty list, so the related memo does not recompute on every render.
const NOTHING_HIDDEN: readonly string[] = [];

/** What the search box holds while no corpus is on screen; one object, so the box is not reset by a new spec every render. */
const NOTHING_TO_SEARCH: MapSpec = { version: "1", territories: [], nodes: [] };
/** A picked search result is shown at this multiple of the near threshold, so its label is drawn with a little margin. */
const NEAR_MARGIN = 1.25;
// Larger than any item's edge count, so a lit item always outranks a dimmed one.
const FILTER_LIT_BONUS = 1_000_000;

/**
 * What a search or an answer is framed on: the part of it the filter lets through, so the view lands on what is lit.
 * When the filter excludes all of it nothing is lit, and the press still answers by framing the items themselves.
 */
function framing(ids: readonly string[], filterMatches: readonly string[] | null): readonly string[] {
  const lit = intersectMatches(ids, filterMatches);
  return lit !== null && lit.length > 0 ? lit : ids;
}

/**
 * The one async corpus's (arXiv's) most recently settled load.
 *
 * Fix round 2: this used to carry an `attempt` number tagged with the
 * `retryToken` a load was started under, filtered by `attempt === retryToken`
 * in render. That scheme missed a real case a re-review caught: switching
 * away from arXiv after a failed load, then switching *back*, starts a
 * fresh load without ever touching `retryToken` — so the fresh attempt's
 * tag was identical to the stale, already-settled error's tag, and the
 * stale error kept showing while the fresh load was genuinely in flight.
 * `App` now clears this outright, during render (see `renderedLoadKey`
 * below), the moment the rendered `(corpusId, retryToken)` pair itself
 * changes from what was rendered last — true on every corpus switch and
 * every retry, round trips included, with nothing to keep in sync by hand.
 * The load effect's own `cancelled` closure (unchanged) still separately
 * protects against a stale promise being *written* late; this protects
 * against an already-written stale result still being *shown*.
 */
type AsyncResult =
  | { status: "ready"; id: GalleryEntry["id"]; spec: MapSpec }
  | { status: "error"; id: GalleryEntry["id"] };

export interface AppProps {
  /**
   * Overrides the arXiv corpus's loader — the real `fetch` of the JSON
   * asset (`gallery`'s own `load`) by default. Exists so a test can drive
   * two independently-controllable, concurrently pending loads of the same
   * corpus id (task-5-review.md, Fix round 1, Finding 3), which makes the
   * switch-away-and-back race testable without stubbing the network. The
   * shipped demo never passes this prop, so `build:demo` still emits
   * `arxiv.json` as its own asset and the demo fetches it.
   */
  loadArxiv?: (() => Promise<MapSpec>) | undefined;
}

export function App({ loadArxiv }: AppProps = {}) {
  // The link the page was opened with (spec slice C §6), read once.
  const [initialLink] = useState(() => parseDeepLink(window.location.hash));
  const [corpusId, setCorpusId] = useState<GalleryEntry["id"]>(() => {
    const linked = gallery.find((entry) => entry.id === initialLink.corpus);
    if (linked) return linked.id;
    const firstEntry = gallery[0];
    if (!firstEntry) throw new Error("demo gallery is empty");
    return firstEntry.id;
  });
  // Only the async entry (arXiv) ever populates this; every synchronous
  // corpus is read straight from `gallery` below, so switching between them
  // never shows a "Loading corpus…" flash while an effect catches up.
  const [asyncResult, setAsyncResult] = useState<AsyncResult | null>(null);
  // The `(corpusId, retryToken)` pair `asyncResult` was last kept for — see
  // `AsyncResult`'s own doc comment.
  const [renderedLoadKey, setRenderedLoadKey] = useState<string | null>(null);
  // Bumped by the "Try again" button to force the load effect below to
  // re-run for the *same* corpusId (a dependency array only re-fires an
  // effect on a value that actually changed).
  const [retryToken, setRetryToken] = useState(0);
  // The indicator reads the map's view from this store, not from `App` state,
  // so a view change re-renders only the indicator (`ViewStore`).
  const [viewStore] = useState(createViewStore);
  const scheme = useColourScheme();
  const mapReference = useRef<CorpusMapHandle>(null);
  // The ids the search (or the dialogue's answer) found, and the ids the filter lets through (spec filter §6); null
  // while none is active. Each belongs to the corpus it was made in, and the map gets their intersection.
  const [searchMatches, setSearchMatches] = useState<readonly string[] | null>(null);
  const [filterMatches, setFilterMatches] = useState<readonly string[] | null>(null);
  const matches = useMemo(() => intersectMatches(searchMatches, filterMatches), [searchMatches, filterMatches]);
  // The dialogue (spec assistant §7): collapsed until asked. The view it compares is kept in a ref and
  // copied to state only while the panel is open, so a pan re-renders the page only for a reader who is asking.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantView, setAssistantView] = useState<MapViewport | undefined>(undefined);
  const latestView = useRef<MapViewport | undefined>(undefined);
  const assistantOpenReference = useRef(false);
  // Wraps `CorpusMap` (or the loading/error state); programmatically
  // focusable (`tabIndex={-1}`: never in the Tab order) as the fallback
  // focus target when no map is mounted.
  const mapShellReference = useRef<HTMLDivElement>(null);
  // Where the drawer returns focus: the map's own surface, whose key
  // handlers (Escape, +/-, arrows) listen only there, so a keyboard user
  // who closes the drawer keeps driving the map. The shell when the map
  // is not mounted.
  const [mapFocusTarget] = useState(() => ({
    get current(): HTMLElement | null {
      return mapShellReference.current?.querySelector<HTMLElement>("[data-map-surface]") ?? mapShellReference.current;
    },
  }));

  // The hidden tuning panel (showcase Task 7). `tuningDraft`/`thresholdsDraft`
  // mirror every control in the panel, including combinations the library
  // would reject; `appliedTuning`/`appliedThresholds` are what actually
  // reaches `CorpusMap` -- only ever a value that has already passed
  // `resolveTuning`/`resolveThresholds`, so the map itself never sees, and
  // never throws on, an invalid combination. `cardSize` has no such split:
  // every field's own range input is already bounded to a valid interval
  // (`TuningPanel`'s `CARD_SIZE_FIELDS`), so there is no combination left
  // for the library to reject.
  //
  // Each corpus keeps its own set (slice G): `edits` holds only the corpora
  // the panel has changed, and a corpus without an entry shows its gallery
  // baseline (`panelBaseline` below). Nothing is persisted.
  const [panelOpen, setPanelOpen] = useState(false);
  const [edits, setEdits] = useState<Partial<Record<GalleryEntry["id"], PanelValues>>>({});
  const [syntheticSize, setSyntheticSize] = useState(DEFAULT_SYNTHETIC_SIZE);
  const [syntheticSeed, setSyntheticSeed] = useState(DEFAULT_SYNTHETIC_SEED);
  // Focused when the panel closes -- the gear button in `TopBar`, the same
  // return-focus pattern `mapShellReference`/`Drawer` already use.
  const gearButtonReference = useRef<HTMLButtonElement>(null);
  // The map, the drawer and the tuning panel start below the top bar, whose
  // height is measured because it wraps onto more rows on a narrow screen. A
  // map under the bar hid the legend's toggle and the fitted names' top row.
  const topBarReference = useRef<HTMLElement>(null);
  const topBarHeight = useBorderBoxHeight(topBarReference);
  // The drawer's rendered width is `min(90vw, DRAWER_MAXIMUM_WIDTH)`.
  const viewportWidth = useViewportWidth();
  // Below 600 px the demo lays itself out for a phone (spec mobile §6).
  const narrow = useNarrowWindow();
  const windowHeight = useViewportHeight();
  const collapsedSheetHeight = sheetCollapsedHeight(windowHeight);

  // The linked view and selection apply while the page still shows the
  // corpus the link named. A user switch ends that for good: the map refits
  // (spec slice C §6), and returning to arXiv, which remounts the map after
  // its load, must not reopen the old link.
  const [linkApplies, setLinkApplies] = useState(() => initialLink.corpus === corpusId);
  // The one selection the map (controlled `selectedId`), the drawer and the
  // link all read: closing the drawer clears the ring, and a press that
  // clears the ring closes the drawer (2026-10-24 browser pass). A corpus
  // switch clears it in `handleCorpusChange` below so a stale selection from
  // the corpus just left can never show.
  const [selectedId, setSelectedId] = useState<string | null>(() => (linkApplies ? initialLink.selected : null));
  // The hash mirrors what is on screen; writes are debounced (spec slice C §6).
  const [hashWriter] = useState(() => createHashWriter(writeHash));
  useEffect(() => () => hashWriter.cancel(), [hashWriter]);
  const linkReference = useRef<DeepLink>({
    corpus: null,
    view: linkApplies ? initialLink.view : null,
    selected: linkApplies ? initialLink.selected : null,
  });
  // What Copy link last did; any later change to the link clears it.
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(null);
  const updateLink = (change: Partial<DeepLink>) => {
    linkReference.current = { ...linkReference.current, corpus: corpusId, ...change };
    hashWriter.schedule(linkReference.current);
    setLinkStatus(null);
  };
  // Every path that changes the selection (the map, the drawer, the panel)
  // sets `selectedId` only; the link follows here.
  const syncSelectionToLink = useEffectEvent((id: string | null) => {
    if (linkReference.current.selected !== id) updateLink({ selected: id });
  });
  useEffect(() => syncSelectionToLink(selectedId), [selectedId]);
  const handleCopyLink = () => {
    hashWriter.flush();
    // No clipboard (an insecure origin, an old browser) or a refusal: say so,
    // and point at the address bar, which already holds the link.
    if (navigator.clipboard === undefined) {
      setLinkStatus("failed");
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(
      () => setLinkStatus("copied"),
      () => setLinkStatus("failed"),
    );
  };

  // Regenerated only when the panel's own size/seed controls change --
  // never on an unrelated render -- because a plain object literal would
  // otherwise be a fresh `useMemo` dependency every render. Deterministic:
  // at the defaults (5,000, seed 1) this is byte-identical to
  // `demo/corpora/synthetic.ts`'s own module-level `syntheticSpec`, the
  // same `generateCorpus` call with the same arguments.
  const syntheticGenerated = useMemo(
    () => generateCorpus({ seed: syntheticSeed, size: syntheticSize }),
    [syntheticSeed, syntheticSize],
  );

  // The picker's synthetic label follows the panel's size control.
  const corpora = useMemo(
    () =>
      gallery.map((entry) => (entry.id === "synthetic" ? { ...entry, label: syntheticLabel(syntheticSize) } : entry)),
    [syntheticSize],
  );

  const activeEntry = gallery.find((entry) => entry.id === corpusId);
  if (!activeEntry) throw new Error(`unknown corpus id: ${corpusId}`);

  // Adjusted during render, not in an effect — the same pattern
  // `CorpusMap.tsx` itself uses for its own `fitBasis` (compare a stored
  // basis against what render is about to show, react synchronously before
  // anything paints), rather than an effect whose entire synchronous body
  // would be an unconditional `setState` call (Fix round 1 hit exactly that
  // ESLint error, `react-hooks/set-state-in-effect`, trying to do this
  // inside the load effect). `effectiveAsyncResult` — not the raw
  // `asyncResult` state — is what the rest of this render uses, so a
  // just-detected transition is reflected in *this* render's output too,
  // not only the next one.
  const loadKey = `${corpusId}:${retryToken}`;
  const isFreshLoadKey = renderedLoadKey !== loadKey;
  if (isFreshLoadKey) {
    setRenderedLoadKey(loadKey);
    if (asyncResult !== null) setAsyncResult(null);
  }
  const effectiveAsyncResult = isFreshLoadKey ? null : asyncResult;

  const currentAsync = effectiveAsyncResult && effectiveAsyncResult.id === corpusId ? effectiveAsyncResult : null;
  const current: CurrentCorpus | null =
    corpusId === "synthetic"
      ? { id: "synthetic", spec: syntheticGenerated }
      : "spec" in activeEntry
        ? { id: activeEntry.id, spec: activeEntry.spec }
        : currentAsync?.status === "ready"
          ? { id: currentAsync.id, spec: currentAsync.spec }
          : null;
  const hasError = currentAsync?.status === "error";

  // The corpus's own values before any edit: its gallery `display` over the
  // library defaults, through the library's validation, so an entry whose
  // values do not resolve fails the gallery test rather than a visitor.
  // The computed card size follows whichever spec is on screen (arXiv's
  // arrives late; until then the library's own default).
  const computedCardSize = current ? cardSizeOf(current.id, current.spec) : LOADING_CARD_SIZE;
  const panelBaseline = usePanelBaseline(activeEntry.display);
  const panelValues = edits[corpusId] ?? panelBaseline;
  const cardSize = panelValues.cardSize ?? computedCardSize;
  const updatePanelValues = (change: Partial<PanelValues>) => {
    setEdits((previous) => ({ ...previous, [corpusId]: { ...(previous[corpusId] ?? panelBaseline), ...change } }));
  };

  useEffect(() => {
    const entry = gallery.find((candidate) => candidate.id === corpusId);
    if (!entry || "spec" in entry) return;
    const load = loadArxiv ?? entry.load;
    let cancelled = false;
    load().then(
      (spec) => {
        if (!cancelled) setAsyncResult({ status: "ready", id: entry.id, spec });
      },
      () => {
        if (!cancelled) setAsyncResult({ status: "error", id: entry.id });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [corpusId, retryToken, loadArxiv]);

  // `t` toggles the tuning panel (showcase Task 7, spec 4 §2), ignored
  // while typing in a field (input/select/textarea/contenteditable) and
  // ignored with a modifier (Ctrl/Meta/Alt) so browser shortcuts still
  // work -- Shift is deliberately not in that list, since Shift+t is still
  // just "t" from a text-entry point of view, not a shortcut. `setPanelOpen`
  // and `setSelectedId` are `useState` setters (stable identity), so this
  // effect never needs to re-subscribe when other state changes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "t" && event.key !== "T") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      setPanelOpen((open) => {
        const next = !open;
        // Mutual exclusion with the drawer (`TuningPanel`'s own doc
        // comment): the two share the right side of the screen, and
        // opening one always closes the other, so each has an
        // uncontested Escape listener and neither ever fights the other.
        if (next) setSelectedId(null);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A corpus switch invalidates whatever the previous corpus's map reported;
  // the indicator should read nothing until the new map's own mount fires
  // `onViewChange` again, never a stale count from the corpus just left.
  // The drawer closes too — a selection belongs to the corpus it was made
  // in, and must never keep showing once that corpus is gone.
  const handleToggleAssistant = () => {
    const next = !assistantOpen;
    assistantOpenReference.current = next;
    setAssistantOpen(next);
    if (next) setAssistantView(latestView.current ?? mapReference.current?.getView());
  };

  const handleCloseAssistant = () => {
    assistantOpenReference.current = false;
    setAssistantOpen(false);
    // The focused control is about to hide: hand focus to what stays (the toggle, or the map under a sheet).
    const next = narrow ? mapFocusTarget.current : document.querySelector<HTMLElement>("[data-assistant-toggle]");
    next?.focus();
  };

  const handleMapViewport = (view: MapViewport) => {
    latestView.current = view;
    if (assistantOpenReference.current) setAssistantView(view);
    updateLink({ view });
  };

  const handleCorpusChange = (id: GalleryEntry["id"]) => {
    latestView.current = undefined;
    setAssistantView(undefined);
    setCorpusId(id);
    viewStore.set(null);
    setSelectedId(null);
    setSearchMatches(null);
    setFilterMatches(null);
    setLinkApplies(false);
    linkReference.current = { corpus: id, view: null, selected: null };
    hashWriter.schedule(linkReference.current);
    setLinkStatus(null);
  };

  const handleRetry = () => {
    setRetryToken((token) => token + 1);
  };

  // Selecting a node opens the drawer and closes the panel -- the mutual
  // exclusion `TuningPanel`'s own doc comment describes, from the other
  // direction (the `t`-key/gear-button handlers close the drawer when the
  // panel opens; this closes the panel when the drawer opens).
  const handleSelectedChange = (id: string | null) => {
    setSelectedId(id);
    if (id !== null) setPanelOpen(false);
  };

  const handleTogglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) setSelectedId(null);
      return next;
    });
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
  };

  // Every value the panel sets goes through the library's own validation
  // (spec 4 §2) before it can reach `CorpusMap`: `tuningDraft` always
  // mirrors the panel's controls, even mid-invalid-combination, but
  // `appliedTuning` -- the prop `CorpusMap` actually receives -- only ever
  // advances past a successful `resolveTuning`. An invalid combination
  // (`labelClasses.medium > large`) leaves `appliedTuning` exactly where it
  // was and surfaces the thrown `RangeError`'s own message.
  const handleTuningDraftChange = (next: Tuning) => {
    try {
      updatePanelValues({ tuningDraft: next, appliedTuning: resolveTuning(next), tuningError: null });
    } catch (error) {
      updatePanelValues({
        tuningDraft: next,
        tuningError: error instanceof RangeError ? error.message : String(error),
      });
    }
  };

  // Same shape as `handleTuningDraftChange`, for `resolveThresholds` --
  // this is the path the brief's own test scenario exercises directly:
  // `midAt > nearAt` throws, `appliedThresholds` stays put, and the
  // message shows in the panel.
  const handleThresholdsDraftChange = (next: LodThresholds) => {
    try {
      updatePanelValues({ thresholdsDraft: next, appliedThresholds: resolveThresholds(next), thresholdsError: null });
    } catch (error) {
      updatePanelValues({
        thresholdsDraft: next,
        thresholdsError: error instanceof RangeError ? error.message : String(error),
      });
    }
  };

  // What the filter lights comes first in the list, then the most connected, so Enter never centres a dimmed paper
  // while a lit one matches.
  const searchRank = useMemo<RankRule>(() => {
    const lit = filterMatches === null ? null : new Set(filterMatches);
    return (item, context) => (lit === null || lit.has(item.id) ? FILTER_LIT_BONUS : 0) + context.connections(item.id);
  }, [filterMatches]);

  // A result picked from the search list: zoom in to where item labels are drawn when the view is further out (about the
  // current centre, so `insets` stay out of it), then centre on the item inside the area the drawer leaves free.
  const handleGoToResult = (id: string) => {
    const handle = mapReference.current;
    if (!handle) return;
    const view = handle.getView();
    const readable = panelValues.appliedThresholds.nearAt * NEAR_MARGIN;
    if (view !== undefined && view.zoom < readable) handle.setView({ centre: view.centre, zoom: readable });
    handle.reveal(id);
  };

  // Back to the current corpus's own values; every other corpus keeps its edits.
  const handleReset = () => {
    setEdits(({ [corpusId]: _discarded, ...kept }) => kept);
    if (corpusId !== "synthetic") return;
    setSyntheticSize(DEFAULT_SYNTHETIC_SIZE);
    setSyntheticSeed(DEFAULT_SYNTHETIC_SEED);
  };

  // The territory a selected node belongs to, by full name
  // (`spec.territories[].name`) rather than its id — resolved here, once,
  // from whichever spec is actually on screen, so `Drawer` itself never
  // needs to know how a `MapSpec` is shaped.
  const selected = selectedId === null ? null : (current?.spec.nodes.find((node) => node.id === selectedId) ?? null);
  // On a narrow window the dialogue sheet and the item sheet take turns (they would share the screen's height):
  // the selection stays, and the item's sheet comes back when the dialogue closes.
  // Beside the open drawer the wide panel narrows rather than reach under it (a window just over 600 px).
  const drawerWidth = selected !== null || panelOpen ? Math.min(0.9 * viewportWidth, DRAWER_MAXIMUM_WIDTH) : 0;
  const assistantWidth = Math.min(ASSISTANT_PANEL_WIDTH, Math.max(0, viewportWidth - drawerWidth - 3 * GUTTER));
  const itemSheetShown = selected !== null && !(narrow && assistantOpen);
  const territoryName =
    selected && current
      ? (current.spec.territories.find((territory) => territory.id === selected.territory)?.name ?? null)
      : null;

  const mapKey = current?.id === "synthetic" ? `synthetic:${syntheticSize}:${syntheticSeed}` : current?.id;
  // A new map (a corpus switch, a regenerated synthetic one) starts at its fit, which it does not report: read it.
  // The previous map's view must not outlive it, open or not: the next open would seed from it.
  useEffect(() => {
    if (mapKey === undefined) return;
    const fit = mapReference.current?.getView();
    latestView.current = fit;
    if (assistantOpenReference.current) setAssistantView(fit);
  }, [mapKey]);
  // A large corpus builds its scene in slices, so its first fit exists only later: read it when the map reports.
  const handleViewChange = (info: Parameters<typeof viewStore.set>[0]) => {
    viewStore.set(info);
    if (latestView.current !== undefined) return;
    const fit = mapReference.current?.getView();
    if (fit === undefined) return;
    latestView.current = fit;
    if (assistantOpenReference.current) setAssistantView(fit);
  };
  // The map keeps its hidden categories itself; the demo only watches them so
  // the drawer leaves out what the map dims. They belong to the map they were
  // hidden on: a new key mounts a map with nothing hidden.
  const [hiddenOnMap, setHiddenOnMap] = useState<{ mapKey: string | undefined; ids: readonly string[] }>({
    mapKey: undefined,
    ids: [],
  });
  const hiddenIds = hiddenOnMap.mapKey === mapKey ? hiddenOnMap.ids : NOTHING_HIDDEN;
  // The drawer's Related list (slice E): one index over the spec's edges, kept
  // while the spec and the selection stay the same.
  const currentSpec = current?.spec;
  const related = useMemo(() => {
    if (!currentSpec || selectedId === null) return [];
    const hidden = new Set(hiddenIds);
    return relatedItems(currentSpec, selectedId).filter(
      (item) => item.node.territory === null || !hidden.has(item.node.territory),
    );
  }, [currentSpec, selectedId, hiddenIds]);

  return (
    <div data-app-shell style={shellStyle}>
      {/* First in the DOM: the h1 precedes the map's h2s, and Tab meets the demo controls before the map. */}
      <TopBar
        corpora={corpora}
        activeId={corpusId}
        onChange={handleCorpusChange}
        tuningOpen={panelOpen}
        onToggleTuning={handleTogglePanel}
        gearButtonRef={gearButtonReference}
        barRef={topBarReference}
        onCopyLink={handleCopyLink}
        linkStatus={linkStatus}
        narrow={narrow}
        assistant={{ open: assistantOpen, onToggle: handleToggleAssistant }}
        search={{
          // While the corpus loads there is nothing to search: an empty spec keeps the box (and the bar's height) in place.
          spec: current?.spec ?? NOTHING_TO_SEARCH,
          onMatches: setSearchMatches,
          onShow: () => mapReference.current?.revealAll(framing(searchMatches ?? [], filterMatches)),
          onGo: handleGoToResult,
          rank: searchRank,
        }}
        filter={
          // Like the search, mounted with an empty spec while the corpus loads, so a retry clears it.
          activeEntry.filter
            ? { spec: current?.spec ?? NOTHING_TO_SEARCH, attribute: activeEntry.filter, onMatches: setFilterMatches }
            : undefined
        }
      />
      <div ref={mapShellReference} tabIndex={-1} data-map-shell style={{ ...mapShellStyle, top: topBarHeight }}>
        {current ? (
          <CorpusMap
            // A selection belongs to the corpus it was made in: the map keeps
            // an uncontrolled one across a spec swap, so a new corpus (or a
            // regenerated synthetic one, whose ids repeat) gets a fresh map.
            key={mapKey}
            ref={mapReference}
            spec={current.spec}
            renderCard={CARDS[current.id]}
            minimap={!narrow}
            legend
            headingLevel={2}
            theme={scheme === "dark" ? DARK_THEME : DEFAULT_THEME}
            tuning={panelValues.appliedTuning}
            thresholds={panelValues.appliedThresholds}
            cardSize={cardSize}
            onViewChange={handleViewChange}
            defaultViewport={linkApplies ? (initialLink.view ?? undefined) : undefined}
            selectedId={selectedId}
            matches={matches}
            onViewportChange={handleMapViewport}
            onSelectedChange={handleSelectedChange}
            onHiddenTerritoriesChange={(ids) => setHiddenOnMap({ mapKey, ids })}
            // The drawer and the panel cover the map's right edge, so edge
            // markers and a related paper's reveal stay left of them. On a
            // narrow window the item sheet covers the bottom edge instead: the
            // collapsed height even while it is expanded, since an expanded
            // sheet hides the whole map and the item is then already in sight
            // when it collapses again.
            insets={
              narrow
                ? {
                    bottom: itemSheetShown ? collapsedSheetHeight : 0,
                    // The dialogue sheet hangs under the top bar while it is open.
                    top: assistantOpen ? assistantPanelHeight(windowHeight, true) + GUTTER : 0,
                  }
                : {
                    right: selected !== null || panelOpen ? Math.min(0.9 * viewportWidth, DRAWER_MAXIMUM_WIDTH) : 0,
                    left: assistantOpen ? assistantWidth + 2 * GUTTER : 0,
                  }
            }
          />
        ) : hasError ? (
          <div data-load-error role="alert" style={errorStyle}>
            <p style={{ margin: 0 }}>Could not load the corpus.</p>
            <button type="button" data-retry onClick={handleRetry} style={retryButtonStyle}>
              Try again
            </button>
          </div>
        ) : (
          <div data-loading role="status" style={loadingStyle}>
            Loading corpus…
          </div>
        )}
      </div>
      {/* The panel occupies the same right-side slot as the drawer (mutually
          exclusive, `TuningPanel`'s own doc comment) -- `ZoomControls` shifts
          clear of whichever of the two is open, exactly as it already does
          for the drawer alone. */}
      <ZoomControls
        mapRef={mapReference}
        drawerOpen={selected !== null || panelOpen}
        narrow={narrow}
        {...(narrow && itemSheetShown ? { coveredBottom: collapsedSheetHeight } : {})}
      />
      {narrow ? (
        <div data-bottom-strip data-floating-control style={bottomStripStyle}>
          <Indicator store={viewStore} inline /> <Footer corpusId={corpusId} inline />
        </div>
      ) : (
        <>
          <Indicator store={viewStore} />
          <Footer corpusId={corpusId} drawerOpen={selected !== null || panelOpen} />
        </>
      )}
      <AssistantPanel
        open={assistantOpen}
        narrow={narrow}
        topInset={topBarHeight}
        windowHeight={windowHeight}
        spec={current?.spec ?? NOTHING_TO_SEARCH}
        selectedId={selectedId}
        // Closed, the dialogue is not watching the view: an answer that lands then never frames.
        view={assistantOpen ? assistantView : undefined}
        width={assistantWidth}
        onMatches={setSearchMatches}
        onReveal={(ids) => mapReference.current?.revealAll(framing(ids, filterMatches))}
        onRestore={(view) => mapReference.current?.setView(view)}
        onSelect={(id) => {
          setSelectedId(id);
          mapReference.current?.reveal(id);
          // The item's sheet takes the narrow screen back: the answer waits behind Ask AI.
          if (narrow) handleCloseAssistant();
        }}
        onClose={handleCloseAssistant}
      />
      <Drawer
        layout={narrow ? "sheet" : "side"}
        node={narrow && assistantOpen ? null : selected}
        territoryName={territoryName}
        isArxiv={current?.id === "arxiv"}
        onClose={() => setSelectedId(null)}
        returnFocusTo={mapFocusTarget}
        topInset={topBarHeight}
        related={related}
        onOpenRelated={(id) => {
          setSelectedId(id);
          mapReference.current?.reveal(id);
        }}
      />
      <TuningPanel
        open={panelOpen}
        corpusLabel={corpora.find((entry) => entry.id === corpusId)?.label ?? activeEntry.label}
        tuning={panelValues.tuningDraft}
        appliedTuning={panelValues.appliedTuning}
        onTuningChange={handleTuningDraftChange}
        tuningError={panelValues.tuningError}
        thresholds={panelValues.thresholdsDraft}
        appliedThresholds={panelValues.appliedThresholds}
        onThresholdsChange={handleThresholdsDraftChange}
        thresholdsError={panelValues.thresholdsError}
        cardSize={cardSize}
        computedCardSize={computedCardSize}
        onCardSizeChange={(cardSize) => updatePanelValues({ cardSize })}
        isSynthetic={corpusId === "synthetic"}
        syntheticSize={syntheticSize}
        onSyntheticSizeChange={setSyntheticSize}
        syntheticSeed={syntheticSeed}
        onSyntheticSeedChange={setSyntheticSeed}
        onReset={handleReset}
        onClose={handleClosePanel}
        returnFocusTo={gearButtonReference}
        mapContainerRef={mapShellReference}
        topInset={topBarHeight}
        layout={narrow ? "sheet" : "side"}
      />
    </div>
  );
}
