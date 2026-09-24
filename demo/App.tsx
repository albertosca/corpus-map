import type { CorpusMapHandle, CorpusMapView, MapNode, MapSpec } from "corpus-map";
import { CorpusMap } from "corpus-map";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Drawer } from "./components/Drawer";
import { Footer } from "./components/Footer";
import { Indicator } from "./components/Indicator";
import { TopBar } from "./components/TopBar";
import { ZoomControls } from "./components/ZoomControls";
import { type GalleryEntry, gallery } from "./corpora";

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
    "spec" in activeEntry
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
            onViewChange={setView}
            onSelect={setSelected}
          />
        ) : hasError ? (
          <div data-load-error data-floating-control role="alert" style={errorStyle}>
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
      <TopBar corpora={gallery} activeId={corpusId} onChange={handleCorpusChange} />
      <ZoomControls mapRef={mapRef} />
      <Indicator view={view} />
      <Footer corpusId={corpusId} />
      <Drawer
        node={selected}
        territoryName={territoryName}
        isArxiv={current?.id === "arxiv"}
        onClose={() => setSelected(null)}
        returnFocusTo={mapShellRef}
      />
    </div>
  );
}
