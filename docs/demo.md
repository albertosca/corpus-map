# The demo

Run `npm run dev` to open it, or use the [live demo](https://albertosca.github.io/corpus-map/). It is a full-window showcase, not a component preview.

## What is on screen

- The map fills the browser window (`CorpusMap` with no `width`/`height`, filling its parent).
- A top bar picks the corpus.
- A bottom-left minimap and an indicator (`regime · ratio× · N items`, read straight from `onViewChange`) sit above it.
- Bottom-right zoom controls drive the map's own `CorpusMapHandle`: "Zoom in", "Zoom out", "Fit".
- A footer shows a data-source disclosure for the corpora that need one.

## Selecting an item

Selecting a node opens a drawer with its label and territory.

- For arXiv, it also shows the publication year, the arXiv category and a link to the paper's abstract page.
- Every other corpus gets a generic field list from its `meta`.
- When the item has edges (arXiv ships each paper's most similar papers, linked by corpus-cartographer), the drawer lists them under Related, each with the title words the two share when they share any. Pressing one selects and reveals it.

## Links

The URL hash carries the corpus, the view and the selection:

```
#corpus=arxiv&view=x,y,zoom&selected=id
```

It is written through a debounced `replaceState`, so a link reopens where it was saved. "Copy link" in the top bar copies it.

## Ask AI

"Ask AI" opens the dialogue panel, collapsed until pressed. Its answers come from the local search and say so in a notice: they are not from an AI.

## The gallery

Four corpora, arXiv first and selected by default:

| Corpus | Notes |
|---|---|
| Computer-science papers (arXiv metadata) | Real-world, about 8,000 papers |
| Chemical elements | |
| Constellations | Bright stars grouped by constellation |
| Synthetic (5,000 items) | The count follows the tuning panel's size control. Footer: "Synthetic corpus, generated for scale testing." |

The four are deliberately unrelated, and deliberately not food. A map spec validated by a single domain would be an unverified abstraction. These show that the spec and the `renderCard` extension point are domain-agnostic.

### The arXiv corpus

- Fetched lazily from `demo/corpora/arxiv.json`. The build emits it as its own asset, so its ~1.5 MB never blocks the shell's first paint, and a failed load can be retried without reloading the page.
- The footer credits it verbatim: "Thank you to arXiv for use of its open access interoperability."
- Papers and territories come from [pipeline/arxiv/](../pipeline/arxiv/README.md); positions and links from [corpus-cartographer](https://github.com/albertosca/corpus-cartographer/blob/main/docs/usage.md).
- Its territories are the map's own clusters: 18 named topics in 5 families, named by Claude and held to a blind test.
- Each paper's arXiv category is on its card and in the drawer.

## The tuning panel

Press `t` to open it. The key is ignored while typing in a field, or with Ctrl/Cmd/Alt held.

It holds:

- one range input per `Tuning` field;
- the two level-of-detail thresholds;
- the card frame size;
- for the synthetic corpus, its size and seed.

Every value is validated through the library's own exported `resolveTuning`/`resolveThresholds` before it reaches the map. The thrown `RangeError` message is shown inline on an invalid combination.

### Wheel capture

The same panel holds a wheel-event capture:

- a read-only, passive listener on the map container;
- it records the last 50 wheel events (`deltaY`, `deltaMode`, `ctrlKey`, milliseconds since the previous one);
- a "Copy" button copies them.

It exists for reading what a trackpad or mouse actually sends, so the library's tuning defaults (taken from d3-zoom and MapLibre, see `src/shared/tuning.ts`) can be checked against real devices.

### Layout

The panel and the selected-item drawer share the same right-hand slot and are mutually exclusive: opening one closes the other. The zoom controls shift left to clear whichever is open wherever there is room. On narrower viewports they are covered by it instead, reversibly, with one tap or Escape.

## How the demo consumes the library

During development the demo consumes the library through a Vite alias to `src/`, not the built package.

What proves the built package is usable is CI. It runs `npm run build` and checks that the emitted `dist/index.d.ts` exists where `package.json` says it does.
