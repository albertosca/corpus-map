import type { CorpusMapHandle, CorpusMapView, LodThresholds, MapNode, MapSpec, Tuning } from "corpus-map";
import { CorpusMap, DEFAULT_THRESHOLDS, DEFAULT_TUNING, resolveThresholds, resolveTuning } from "corpus-map";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { Drawer } from "./components/Drawer";
import { Footer } from "./components/Footer";
import { Indicator } from "./components/Indicator";
import { TopBar } from "./components/TopBar";
import { TuningPanel } from "./components/TuningPanel";
import { ZoomControls } from "./components/ZoomControls";
import { type GalleryEntry, gallery, syntheticLabel } from "./corpora";

interface ElementMeta {
  name: string;
  atomicNumber: number;
}

interface StarMeta {
  constellation: string;
  magnitude: number;
}

interface ArxivMeta {
  year: number;
}

function renderElementCard(node: MapNode) {
  const meta = node.meta as ElementMeta;
  return (
    <div style={{ padding: 8, minWidth: 120 }}>
      <strong>{meta.name}</strong>
      <div>#{meta.atomicNumber}</div>
    </div>
  );
}

function renderStarCard(node: MapNode) {
  const meta = node.meta as StarMeta;
  return (
    <div style={{ padding: 8, minWidth: 120 }}>
      <strong>{node.label}</strong>
      <div>{meta.constellation}</div>
      <div>mag {meta.magnitude}</div>
    </div>
  );
}

function renderArxivCard(node: MapNode) {
  const meta = node.meta as ArxivMeta | undefined;
  return (
    <div style={{ padding: 8, minWidth: 160, maxWidth: 240 }}>
      <strong>{node.label}</strong>
      {meta?.year ? <div>{meta.year}</div> : null}
    </div>
  );
}

function renderSyntheticCard(node: MapNode) {
  return (
    <div style={{ padding: 8, minWidth: 120 }}>
      <strong>{node.label}</strong>
    </div>
  );
}

const CARDS: Record<GalleryEntry["id"], (node: MapNode) => ReactNode> = {
  arxiv: renderArxivCard,
  elements: renderElementCard,
  constellations: renderStarCard,
  synthetic: renderSyntheticCard,
};

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

const loadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "#1a1d23",
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
  color: "#1a1d23",
  fontSize: 14,
};

const retryButtonStyle: CSSProperties = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 13,
};

interface CurrentCorpus {
  id: GalleryEntry["id"];
  spec: MapSpec;
}

/**
 * Mirrors `src/cards/CardOverlay.tsx`'s own private `DEFAULT_CARD_SIZE`
 * (160x56) — not re-exported through `corpus-map`'s public door
 * (`src/index.ts`), so this is a demo-side copy rather than an import, the
 * same convention `floatingLayout.ts` already documents for the minimap's
 * own constants.
 */
const DEFAULT_PANEL_CARD_SIZE = { width: 160, height: 56 };

/** The synthetic corpus's own defaults (`demo/corpora/synthetic.ts`): seed 1, 5,000 items. */
const DEFAULT_SYNTHETIC_SIZE = 5000;
const DEFAULT_SYNTHETIC_SEED = 1;

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
   * Overrides the arXiv corpus's loader — the real dynamic import
   * (`gallery`'s own `load`) by default. Exists so a test can drive two
   * independently-controllable, concurrently pending loads of the same
   * corpus id: Vitest/Vite's dynamic-import mocking cannot dedupe two
   * concurrent `import()` calls of the same specifier the way a real
   * browser does (task-5-review.md, Fix round 1, Finding 3), which makes
   * the switch-away-and-back race untestable through module mocking alone.
   * Injecting the loader sidesteps that limitation; the shipped demo never
   * passes this prop, so `build:demo` still resolves the real
   * `import("./arxiv.json")` and emits it as its own chunk.
   */
  loadArxiv?: (() => Promise<MapSpec>) | undefined;
}

export function App({ loadArxiv }: AppProps = {}) {
  const [corpusId, setCorpusId] = useState<GalleryEntry["id"]>(() => {
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
  const [view, setView] = useState<CorpusMapView | null>(null);
  // The selected node's drawer (showcase Task 6). `null` until an
  // `onSelect` fires; a corpus switch clears it in `handleCorpusChange`
  // below so a stale selection from the corpus just left can never show.
  const [selected, setSelected] = useState<MapNode | null>(null);
  const mapRef = useRef<CorpusMapHandle>(null);
  // Not part of the library's own DOM (it wraps `CorpusMap`, whose own
  // `[data-map-surface]` root carries no tabIndex/role of its own) — made
  // programmatically focusable here (`tabIndex={-1}`: never in the Tab
  // order, only reachable via `.focus()`) so the drawer has somewhere to
  // return focus to when it closes.
  const mapShellRef = useRef<HTMLDivElement>(null);

  // The hidden tuning panel (showcase Task 7). `tuningDraft`/`thresholdsDraft`
  // mirror every control in the panel, including combinations the library
  // would reject; `appliedTuning`/`appliedThresholds` are what actually
  // reaches `CorpusMap` -- only ever a value that has already passed
  // `resolveTuning`/`resolveThresholds`, so the map itself never sees, and
  // never throws on, an invalid combination. `cardSize` has no such split:
  // every field's own range input is already bounded to a valid interval
  // (`TuningPanel`'s `CARD_SIZE_FIELDS`), so there is no combination left
  // for the library to reject.
  const [panelOpen, setPanelOpen] = useState(false);
  const [tuningDraft, setTuningDraft] = useState<Tuning>(DEFAULT_TUNING);
  const [appliedTuning, setAppliedTuning] = useState<Tuning>(DEFAULT_TUNING);
  const [tuningError, setTuningError] = useState<string | null>(null);
  const [thresholdsDraft, setThresholdsDraft] = useState<LodThresholds>(DEFAULT_THRESHOLDS);
  const [appliedThresholds, setAppliedThresholds] = useState<LodThresholds>(DEFAULT_THRESHOLDS);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState(DEFAULT_PANEL_CARD_SIZE);
  const [syntheticSize, setSyntheticSize] = useState(DEFAULT_SYNTHETIC_SIZE);
  const [syntheticSeed, setSyntheticSeed] = useState(DEFAULT_SYNTHETIC_SEED);
  // Focused when the panel closes -- the gear button in `TopBar`, the same
  // return-focus pattern `mapShellRef`/`Drawer` already use.
  const gearButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    const entry = gallery.find((g) => g.id === corpusId);
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
  // and `setSelected` are `useState` setters (stable identity), so this
  // effect never needs to re-subscribe when other state changes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
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
        if (next) setSelected(null);
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
  const handleCorpusChange = (id: GalleryEntry["id"]) => {
    setCorpusId(id);
    setView(null);
    setSelected(null);
  };

  const handleRetry = () => {
    setRetryToken((t) => t + 1);
  };

  // Selecting a node opens the drawer and closes the panel -- the mutual
  // exclusion `TuningPanel`'s own doc comment describes, from the other
  // direction (the `t`-key/gear-button handlers close the drawer when the
  // panel opens; this closes the panel when the drawer opens).
  const handleSelect = (node: MapNode) => {
    setSelected(node);
    setPanelOpen(false);
  };

  const handleTogglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) setSelected(null);
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
    setTuningDraft(next);
    try {
      setAppliedTuning(resolveTuning(next));
      setTuningError(null);
    } catch (err) {
      setTuningError(err instanceof RangeError ? err.message : String(err));
    }
  };

  // Same shape as `handleTuningDraftChange`, for `resolveThresholds` --
  // this is the path the brief's own test scenario exercises directly:
  // `midAt > nearAt` throws, `appliedThresholds` stays put, and the
  // message shows in the panel.
  const handleThresholdsDraftChange = (next: LodThresholds) => {
    setThresholdsDraft(next);
    try {
      setAppliedThresholds(resolveThresholds(next));
      setThresholdsError(null);
    } catch (err) {
      setThresholdsError(err instanceof RangeError ? err.message : String(err));
    }
  };

  const handleReset = () => {
    setTuningDraft(DEFAULT_TUNING);
    setAppliedTuning(DEFAULT_TUNING);
    setTuningError(null);
    setThresholdsDraft(DEFAULT_THRESHOLDS);
    setAppliedThresholds(DEFAULT_THRESHOLDS);
    setThresholdsError(null);
    setCardSize(DEFAULT_PANEL_CARD_SIZE);
    setSyntheticSize(DEFAULT_SYNTHETIC_SIZE);
    setSyntheticSeed(DEFAULT_SYNTHETIC_SEED);
  };

  // The territory a selected node belongs to, by full name
  // (`spec.territories[].name`) rather than its id — resolved here, once,
  // from whichever spec is actually on screen, so `Drawer` itself never
  // needs to know how a `MapSpec` is shaped.
  const territoryName =
    selected && current ? (current.spec.territories.find((t) => t.id === selected.territory)?.name ?? null) : null;

  return (
    <div data-app-shell style={shellStyle}>
      <div ref={mapShellRef} tabIndex={-1} data-map-shell style={mapShellStyle}>
        {current ? (
          <CorpusMap
            ref={mapRef}
            spec={current.spec}
            renderCard={CARDS[current.id]}
            minimap
            tuning={appliedTuning}
            thresholds={appliedThresholds}
            cardSize={cardSize}
            onViewChange={setView}
            onSelect={handleSelect}
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
      <TopBar
        corpora={corpora}
        activeId={corpusId}
        onChange={handleCorpusChange}
        tuningOpen={panelOpen}
        onToggleTuning={handleTogglePanel}
        gearButtonRef={gearButtonRef}
      />
      {/* The panel occupies the same right-side slot as the drawer (mutually
          exclusive, `TuningPanel`'s own doc comment) -- `ZoomControls` shifts
          clear of whichever of the two is open, exactly as it already does
          for the drawer alone. */}
      <ZoomControls mapRef={mapRef} drawerOpen={selected !== null || panelOpen} />
      <Indicator view={view} />
      <Footer corpusId={corpusId} />
      <Drawer
        node={selected}
        territoryName={territoryName}
        isArxiv={current?.id === "arxiv"}
        onClose={() => setSelected(null)}
        returnFocusTo={mapShellRef}
      />
      <TuningPanel
        open={panelOpen}
        tuning={tuningDraft}
        onTuningChange={handleTuningDraftChange}
        tuningError={tuningError}
        thresholds={thresholdsDraft}
        onThresholdsChange={handleThresholdsDraftChange}
        thresholdsError={thresholdsError}
        cardSize={cardSize}
        onCardSizeChange={setCardSize}
        isSynthetic={corpusId === "synthetic"}
        syntheticSize={syntheticSize}
        onSyntheticSizeChange={setSyntheticSize}
        syntheticSeed={syntheticSeed}
        onSyntheticSeedChange={setSyntheticSeed}
        onReset={handleReset}
        onClose={handleClosePanel}
        returnFocusTo={gearButtonRef}
        mapContainerRef={mapShellRef}
      />
    </div>
  );
}
