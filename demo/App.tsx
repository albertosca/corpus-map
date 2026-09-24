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

interface CurrentCorpus {
  id: GalleryEntry["id"];
  spec: MapSpec;
}

export function App() {
  const [corpusId, setCorpusId] = useState<GalleryEntry["id"]>(() => {
    const firstEntry = gallery[0];
    if (!firstEntry) throw new Error("demo gallery is empty");
    return firstEntry.id;
  });
  // Only the async entry (arXiv) ever populates this; every synchronous
  // corpus is read straight from `gallery` below, so switching between them
  // never shows a "Loading corpus…" flash while an effect catches up.
  const [asyncSpec, setAsyncSpec] = useState<CurrentCorpus | null>(null);
  const [view, setView] = useState<CorpusMapView | null>(null);
  const mapRef = useRef<CorpusMapHandle>(null);

  const activeEntry = gallery.find((entry) => entry.id === corpusId);
  if (!activeEntry) throw new Error(`unknown corpus id: ${corpusId}`);

  const current: CurrentCorpus | null =
    "spec" in activeEntry
      ? { id: activeEntry.id, spec: activeEntry.spec }
      : asyncSpec && asyncSpec.id === corpusId
        ? asyncSpec
        : null;

  useEffect(() => {
    const entry = gallery.find((g) => g.id === corpusId);
    if (!entry || "spec" in entry) return;
    let cancelled = false;
    entry.load().then((spec) => {
      if (!cancelled) setAsyncSpec({ id: entry.id, spec });
    });
    return () => {
      cancelled = true;
    };
  }, [corpusId]);

  // A corpus switch invalidates whatever the previous corpus's map reported;
  // the indicator should read nothing until the new map's own mount fires
  // `onViewChange` again, never a stale count from the corpus just left.
  const handleCorpusChange = (id: GalleryEntry["id"]) => {
    setCorpusId(id);
    setView(null);
  };

  return (
    <div data-app-shell style={shellStyle}>
      <div data-map-shell style={mapShellStyle}>
        {current ? (
          <CorpusMap ref={mapRef} spec={current.spec} renderCard={CARDS[current.id]} minimap onViewChange={setView} />
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
