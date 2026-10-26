import { render } from "@testing-library/react";
import { cardSizeFor, type MapNode, type MapSpec } from "corpus-map";
import { describe, expect, it } from "vitest";
import { CARD_BORDER_WIDTH, CARD_STRIPE_WIDTH, DEFAULT_CARD_SIZE } from "../src/cards/CardOverlay";
import { CARD_TEXT, CARDS, cardSizeOf, LOADING_CARD_SIZE } from "./cards";
import { arxivSpec, type CorpusId } from "./corpora";
import arxivJson from "./corpora/arxiv.json";
import { constellationsSpec } from "./corpora/constellations";
import { elementsSpec } from "./corpora/elements";
import { syntheticSpec } from "./corpora/synthetic";

const CORPUS_IDS: readonly CorpusId[] = ["arxiv", "elements", "constellations", "synthetic"];

const SAMPLE_NODES: Record<CorpusId, MapNode> = {
  arxiv: { id: "a", label: "A very long paper title", x: 0, y: 0, territory: "t", meta: { year: 2024 } },
  elements: { id: "e", label: "Rf", x: 0, y: 0, territory: "t", meta: { name: "Rutherfordium", atomicNumber: 104 } },
  constellations: {
    id: "c",
    label: "Betelgeuse",
    x: 0,
    y: 0,
    territory: "t",
    meta: { constellation: "Orion", magnitude: 0.5 },
  },
  synthetic: { id: "s", label: "Item 1", x: 0, y: 0, territory: "t" },
};

describe("CARD_TEXT", () => {
  it("describes the lines each renderer shows: arXiv three title lines and the year, elements the name and its number, constellations the name and two lines, synthetic the label alone", () => {
    expect(CARD_TEXT.arxiv.options).toMatchObject({ titleLines: 3, extraLines: 1 });
    expect(CARD_TEXT.elements.options).toMatchObject({ titleLines: 1, extraLines: 1 });
    expect(CARD_TEXT.constellations.options).toMatchObject({ titleLines: 1, extraLines: 2 });
    expect(CARD_TEXT.synthetic.options).toMatchObject({ titleLines: 1, extraLines: 0 });
  });

  it("takes an element's card title from its name, not its symbol", () => {
    expect(CARD_TEXT.elements.title(SAMPLE_NODES.elements)).toBe("Rutherfordium");
    expect(CARD_TEXT.arxiv.title(SAMPLE_NODES.arxiv)).toBe("A very long paper title");
  });
});

describe("CARDS", () => {
  it.each(CORPUS_IDS)("%s fills the frame, sets no minimum width and clamps its title to CARD_TEXT's lines", (id) => {
    const { container } = render(CARDS[id](SAMPLE_NODES[id]));
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe("100%");
    expect(frame.style.minWidth).toBe("");
    expect(frame.style.maxWidth).toBe("");
    const title = frame.querySelector("strong") as HTMLElement;
    expect(title.textContent).toBe(CARD_TEXT[id].title(SAMPLE_NODES[id]));
    expect(title.style.webkitLineClamp).toBe(String(CARD_TEXT[id].options.titleLines));
    expect(title.style.overflow).toBe("hidden");
  });
});

describe("cardSizeOf", () => {
  it.each<[CorpusId, MapSpec]>([
    ["arxiv", arxivSpec(arxivJson)],
    ["elements", elementsSpec],
    ["constellations", constellationsSpec],
    ["synthetic", syntheticSpec],
  ])("sizes %s from its own card titles", (id, spec) => {
    const titled: MapSpec = {
      ...spec,
      nodes: spec.nodes.map((node) => ({ ...node, label: CARD_TEXT[id].title(node) })),
    };
    expect(cardSizeOf(id, spec)).toEqual(cardSizeFor(titled, CARD_TEXT[id].options));
  });

  it("fits nine element names in ten on the elements card's one title line (16 px at 0.6 em per character)", () => {
    const column = cardSizeOf("elements", elementsSpec).width - 2 * 8 - CARD_STRIPE_WIDTH - CARD_BORDER_WIDTH;
    const names = elementsSpec.nodes.map((node) => CARD_TEXT.elements.title(node));
    const fitting = names.filter((name) => name.length * 9.6 <= column).length;
    expect(fitting / names.length).toBeGreaterThanOrEqual(0.9);
  });

  it("uses the library's default card size while a corpus is still loading", () => {
    expect(LOADING_CARD_SIZE).toEqual(DEFAULT_CARD_SIZE);
  });
});
