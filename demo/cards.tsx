import type { CardSizeOptions, MapNode, MapSpec } from "corpus-map";
import { cardSizeFor } from "corpus-map";
import type { CSSProperties, ReactNode } from "react";
import type { CorpusId } from "./corpora";
import type { CardSize } from "./corpora/display";

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

/** The text one corpus's card shows: its title, and the lines `cardSizeFor` sizes the frame for. */
interface CardText {
  title: (node: MapNode) => string;
  options: CardSizeOptions & { titleLines: number; extraLines: number };
}

// The cards inherit the shell's system-ui at the browser's 16 px; the frame
// sets the 1.25 line height and 8 px padding `cardSizeFor` assumes.
const CARD_FONT = "16px system-ui";

export const CARD_TEXT: Record<CorpusId, CardText> = {
  arxiv: { title: (node) => node.label, options: { font: CARD_FONT, titleLines: 3, extraLines: 1 } },
  elements: {
    title: (node) => (node.meta as ElementMeta).name,
    options: { font: CARD_FONT, titleLines: 1, extraLines: 1 },
  },
  constellations: { title: (node) => node.label, options: { font: CARD_FONT, titleLines: 1, extraLines: 2 } },
  synthetic: { title: (node) => node.label, options: { font: CARD_FONT, titleLines: 1, extraLines: 0 } },
};

/** `CorpusMap`'s own default, for a corpus whose spec has not arrived yet. */
export const LOADING_CARD_SIZE: CardSize = { width: 160, height: 56 };

// One size per spec object: the demo asks on every render, and a spec only
// changes identity when its corpus (or the synthetic size and seed) changes.
const sizes = new WeakMap<MapSpec, CardSize>();

/** The card size fitted to the titles this corpus's cards show (an element's name, not its symbol). */
export function cardSizeOf(id: CorpusId, spec: MapSpec): CardSize {
  const known = sizes.get(spec);
  if (known) return known;
  const { title, options } = CARD_TEXT[id];
  const size = cardSizeFor({ ...spec, nodes: spec.nodes.map((node) => ({ ...node, label: title(node) })) }, options);
  sizes.set(spec, size);
  return size;
}

const frameStyle: CSSProperties = { padding: 8, width: "100%", boxSizing: "border-box", lineHeight: 1.25 };

function titleStyle(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  };
}

function renderElementCard(node: MapNode) {
  const meta = node.meta as ElementMeta;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.elements.options.titleLines)}>{CARD_TEXT.elements.title(node)}</strong>
      <div>#{meta.atomicNumber}</div>
    </div>
  );
}

function renderStarCard(node: MapNode) {
  const meta = node.meta as StarMeta;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.constellations.options.titleLines)}>{node.label}</strong>
      <div>{meta.constellation}</div>
      <div>mag {meta.magnitude}</div>
    </div>
  );
}

function renderArxivCard(node: MapNode) {
  const meta = node.meta as ArxivMeta | undefined;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.arxiv.options.titleLines)}>{node.label}</strong>
      {meta?.year ? <div>{meta.year}</div> : null}
    </div>
  );
}

function renderSyntheticCard(node: MapNode) {
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.synthetic.options.titleLines)}>{node.label}</strong>
    </div>
  );
}

export const CARDS: Record<CorpusId, (node: MapNode) => ReactNode> = {
  arxiv: renderArxivCard,
  elements: renderElementCard,
  constellations: renderStarCard,
  synthetic: renderSyntheticCard,
};
