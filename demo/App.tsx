import { CorpusMap, type MapNode, type MapSpec } from "corpus-map";
import { useState } from "react";
import { constellationsSpec } from "./corpora/constellations";
import { elementsSpec } from "./corpora/elements";

type CorpusKey = "elements" | "constellations";

interface ElementMeta {
  name: string;
  atomicNumber: number;
}

interface StarMeta {
  constellation: string;
  magnitude: number;
}

const CORPORA: Record<CorpusKey, { label: string; spec: MapSpec }> = {
  elements: { label: "Periodic Table", spec: elementsSpec },
  constellations: { label: "Constellations", spec: constellationsSpec },
};

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

export function App() {
  const [corpus, setCorpus] = useState<CorpusKey>("elements");
  const active = CORPORA[corpus];
  const renderCard = corpus === "elements" ? renderElementCard : renderStarCard;

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      <h1>corpus-map demo</h1>
      <div style={{ marginBottom: 16 }}>
        {(Object.keys(CORPORA) as CorpusKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCorpus(key)}
            disabled={corpus === key}
            style={{ marginRight: 8 }}
          >
            {CORPORA[key].label}
          </button>
        ))}
      </div>
      {/* Remount on corpus change so the viewport refits the new spec's extent. */}
      <CorpusMap key={corpus} spec={active.spec} renderCard={renderCard} width={960} height={640} />
    </div>
  );
}
