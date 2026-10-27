import type { CardContext, CardSizeOptions, MapNode, MapSpec } from "corpus-map";
import { cardSizeFor } from "corpus-map";
import type { CSSProperties, ReactNode } from "react";
import type { CorpusId } from "./corpora";
import type { ArxivCategory } from "./corpora/compact";
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
  category?: ArxivCategory;
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

// The library's group badge ("+N", 4 px padding each side) sits over the
// card's top-right corner; a grouped card's title stays out from under it.
function badgeReserve(badgeCount: number): string | undefined {
  return badgeCount > 0 ? `calc(${String(badgeCount).length + 1}ch + 8px)` : undefined;
}

function titleStyle(lines: number, context: CardContext): CSSProperties {
  return {
    paddingRight: badgeReserve(context.badgeCount),
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  };
}

function renderElementCard(node: MapNode, context: CardContext) {
  const meta = node.meta as ElementMeta;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.elements.options.titleLines, context)}>
        {CARD_TEXT.elements.title(node)}
      </strong>
      <div>#{meta.atomicNumber}</div>
    </div>
  );
}

function renderStarCard(node: MapNode, context: CardContext) {
  const meta = node.meta as StarMeta;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.constellations.options.titleLines, context)}>{node.label}</strong>
      <div>{meta.constellation}</div>
      <div>mag {meta.magnitude}</div>
    </div>
  );
}

// The year and the category share the card's one detail line; a long
// category name ends in an ellipsis instead of wrapping past the frame.
const detailLineStyle: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function renderArxivCard(node: MapNode, context: CardContext) {
  const meta = node.meta as ArxivMeta | undefined;
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.arxiv.options.titleLines, context)}>{node.label}</strong>
      {meta?.year ? (
        <div style={detailLineStyle}>{meta.category ? `${meta.year} · ${meta.category.name}` : meta.year}</div>
      ) : null}
    </div>
  );
}

function renderSyntheticCard(node: MapNode, context: CardContext) {
  return (
    <div style={frameStyle}>
      <strong style={titleStyle(CARD_TEXT.synthetic.options.titleLines, context)}>{node.label}</strong>
    </div>
  );
}

export const CARDS: Record<CorpusId, (node: MapNode, context: CardContext) => ReactNode> = {
  arxiv: renderArxivCard,
  elements: renderElementCard,
  constellations: renderStarCard,
  synthetic: renderSyntheticCard,
};
