import { CorpusMap, type MapNode } from "corpus-map";
import { type ReactNode, useState } from "react";
import { type GalleryEntry, gallery } from "./corpora";

interface ElementMeta {
  name: string;
  atomicNumber: number;
}

interface StarMeta {
  constellation: string;
  magnitude: number;
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

const CARDS: Record<GalleryEntry["id"], (node: MapNode) => ReactNode> = {
  elements: renderElementCard,
  constellations: renderStarCard,
};

export function App() {
  const [active, setActive] = useState<GalleryEntry>(gallery[0]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      <h1>corpus-map demo</h1>
      <div style={{ marginBottom: 16 }}>
        {gallery.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setActive(entry)}
            disabled={active.id === entry.id}
            style={{ marginRight: 8 }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {/* No `key=` remount: CorpusMap refits its viewport when `spec` changes. */}
      <CorpusMap spec={active.spec} renderCard={CARDS[active.id]} width={960} height={640} />
    </div>
  );
}
