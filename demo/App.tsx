import type { CorpusMapHandle, CorpusMapView, MapNode, MapSpec } from "corpus-map";
import { CorpusMap } from "corpus-map";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
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
 * The one async corpus's (arXiv's) most recent settled load, tagged with
 * the `retryToken` it was started under — never cleared by a synchronous
 * `setState` at the top of the load effect (that pattern trips ESLint's
 * `react-hooks/set-state-in-effect`, and for good reason: it costs an extra,
 * always-unconditional render on every single effect run). Instead, `attempt`
 * lets render itself decide whether a stored result is still current: a
 * fresh retry bumps `retryToken`, so the *previous* attempt's stored result
 * — success or error — no longer matches and is treated as absent, exactly
 * as if it had been cleared, with no extra render and no extra state.
 */
type AsyncResult =
  | { status: "ready"; id: GalleryEntry["id"]; attempt: number; spec: MapSpec }
  | { status: "error"; id: GalleryEntry["id"]; attempt: number };

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
  // Bumped by the "Try again" button to force the load effect below to
  // re-run for the *same* corpusId (a dependency array only re-fires an
  // effect on a value that actually changed), and to mark any previous
  // attempt's stored result stale (see `AsyncResult`'s own doc comment).
  const [retryToken, setRetryToken] = useState(0);
  const [view, setView] = useState<CorpusMapView | null>(null);
  const mapRef = useRef<CorpusMapHandle>(null);

  const activeEntry = gallery.find((entry) => entry.id === corpusId);
  if (!activeEntry) throw new Error(`unknown corpus id: ${corpusId}`);

  const currentAsync =
    asyncResult && asyncResult.id === corpusId && asyncResult.attempt === retryToken ? asyncResult : null;
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
    const attempt = retryToken;
    load().then(
      (spec) => {
        if (!cancelled) setAsyncResult({ status: "ready", id: entry.id, attempt, spec });
      },
      () => {
        if (!cancelled) setAsyncResult({ status: "error", id: entry.id, attempt });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [corpusId, retryToken, loadArxiv]);

  // A corpus switch invalidates whatever the previous corpus's map reported;
  // the indicator should read nothing until the new map's own mount fires
  // `onViewChange` again, never a stale count from the corpus just left.
  const handleCorpusChange = (id: GalleryEntry["id"]) => {
    setCorpusId(id);
    setView(null);
  };

  const handleRetry = () => {
    setRetryToken((t) => t + 1);
  };

  return (
    <div data-app-shell style={shellStyle}>
      <div data-map-shell style={mapShellStyle}>
        {current ? (
          <CorpusMap ref={mapRef} spec={current.spec} renderCard={CARDS[current.id]} minimap onViewChange={setView} />
        ) : hasError ? (
          <div data-load-error role="alert" style={errorStyle}>
            <p style={{ margin: 0 }}>Could not load the corpus.</p>
            <button type="button" onClick={handleRetry} style={retryButtonStyle}>
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
    </div>
  );
}
