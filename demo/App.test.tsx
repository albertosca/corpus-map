import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MapSpec } from "corpus-map";
import { DARK_THEME, DEFAULT_THEME, DEFAULT_THRESHOLDS, DEFAULT_TUNING } from "corpus-map";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditAccessibility, violationIds } from "../test/audit";
// Type-only: safe to import statically even though every test imports the
// component itself dynamically (`await import("./App")`), per-test, so each
// gets its own fresh module graph for `vi.doMock`/`vi.resetModules`.
import type { AppProps } from "./App";
import { cardSizeOf } from "./cards";
import { DRAWER_MAXIMUM_WIDTH } from "./components/Drawer";
import {
  BOTTOM_LEFT_COLUMN_WIDTH,
  GUTTER,
  INDICATOR_HEIGHT_ESTIMATE,
  INDICATOR_LEFT,
  INDICATOR_MAXIMUM_CONTENT_WIDTH,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  STRIP_HEIGHT_ESTIMATE,
  ZOOM_CONTROLS_HEIGHT_ESTIMATE,
} from "./components/floatingLayout";
import { NARROW_WINDOW_WIDTH, sheetCollapsedHeight } from "./components/narrow";
import { BUTTON_WIDTH } from "./components/ZoomControls";
import { arxivSpec, type CorpusId, gallery } from "./corpora";
import arxivJson from "./corpora/arxiv.json";
import { constellationsSpec } from "./corpora/constellations";
import { elementsSpec } from "./corpora/elements";
import { syntheticSpec } from "./corpora/synthetic";

/** A tiny, valid arXiv-shaped spec — stands in for the real 1.5 MB arxiv.json in every test but the loading-state one. */
const TINY_ARXIV_SPEC: MapSpec = {
  version: "1",
  territories: [{ id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2"], centroid: [0, 0] }],
  nodes: [
    {
      id: "p1",
      label: "A Tiny Paper About Testing",
      x: -1,
      y: 0,
      territory: "cs.AI",
      meta: { year: 2026, url: "https://arxiv.org/abs/0000.00001" },
    },
    {
      id: "p2",
      label: "Another Tiny Paper",
      x: 1,
      y: 0,
      territory: "cs.AI",
      meta: { year: 2025, url: "https://arxiv.org/abs/0000.00002" },
    },
  ],
};

/** The shipped arXiv corpus as the demo loads it: the file leaves out members, meta and full edges (`demo/corpora/compact.ts`), so it is not a `MapSpec` until expanded. */
const ARXIV_TERRITORIES: Pick<MapSpec, "territories"> = arxivSpec(arxivJson);

/** The exact text a far-regime territory button carries (`AccessibleTree`): `"<name>, <count> item(s)"`. */
// Only a leaf is a button in the accessible tree: a family (some territory's
// parent, no members of its own) renders as a heading.
function territoryButtonText(spec: Pick<MapSpec, "territories">, index = 0): string {
  const leaves = spec.territories.filter(
    (candidate) => !spec.territories.some((other) => other.parent === candidate.id),
  );
  const territory = leaves[index];
  if (!territory) throw new Error(`spec has no leaf territory at index ${index}`);
  const count = territory.members.length;
  return `${territory.name}, ${count} ${count === 1 ? "item" : "items"}`;
}

/** A gallery entry's own `display`, the shape Copy settings produces at that corpus's values. */
function entryDisplay(id: CorpusId) {
  return gallery.find((entry) => entry.id === id)?.display ?? {};
}

const VIEWPORT_WIDTH_PX = 375;
const GUTTER_PX = 16;
const MAXIMUM_CONTENT_PX = VIEWPORT_WIDTH_PX - 2 * GUTTER_PX; // 343
const WIDTH_PROPERTIES = ["width", "maxWidth", "minWidth"] as const;
const OFFSET_PROPERTIES = ["left", "right"] as const;

/**
 * Parses one inline CSS length (`vw`/`%`/`px`) from a floating control and
 * asserts it cannot push content past a 375px-wide viewport. Fix round 1,
 * Finding 2: the previous version of this check only asserted the *unit*
 * was `"vw"`, which a planted `maxWidth: "250vw"` passed straight through —
 * this reads the actual number. `width`/`maxWidth`/`minWidth` are checked
 * against the viewport itself (`vw`/`%` <= 100) or the usable width once
 * both 16px gutters are subtracted (`px`, <= 343); `left`/`right` are
 * additionally checked for a negative value, which would push the element
 * outside the viewport on that side regardless of its own width.
 */
function checkNoOverflowAt375(element: HTMLElement, label: string): void {
  for (const property of [...WIDTH_PROPERTIES, ...OFFSET_PROPERTIES]) {
    const raw = element.style[property];
    if (!raw || raw === "auto") continue;
    const match = /^(-?[\d.]+)(vw|px|%)$/.exec(raw.trim());
    if (!match) {
      throw new Error(
        `${label}.${property} = "${raw}" is not a recognised vw/px/% length — extend checkNoOverflowAt375 before trusting this control`,
      );
    }
    const value = Number(match[1]);
    const unit = match[2];

    if (unit === "vw" || unit === "%") {
      expect(
        value,
        `${label}.${property} = ${raw} would exceed the 375px viewport (unit is ${unit}, must be <= 100)`,
      ).toBeLessThanOrEqual(100);
    } else if ((WIDTH_PROPERTIES as readonly string[]).includes(property)) {
      expect(
        value,
        `${label}.${property} = ${raw} would exceed the viewport once both 16px gutters are subtracted (max ${MAXIMUM_CONTENT_PX}px)`,
      ).toBeLessThanOrEqual(MAXIMUM_CONTENT_PX);
    }
    if ((OFFSET_PROPERTIES as readonly string[]).includes(property)) {
      expect(
        value,
        `${label}.${property} = ${raw} is negative, which pushes the element outside the viewport on that side`,
      ).toBeGreaterThanOrEqual(0);
    }
  }
}

/** The element's own identifying `data-*` attribute name (besides `data-floating-control`), or its tag name if it has none. */
function labelFor(element: HTMLElement): string {
  const dataAttribute = Array.from(element.attributes).find(
    (attribute) => attribute.name.startsWith("data-") && attribute.name !== "data-floating-control",
  );
  return dataAttribute ? dataAttribute.name.slice("data-".length) : element.tagName.toLowerCase();
}

/**
 * `checkNoOverflowAt375` silently skips any of the five width/offset
 * properties an element simply never set (`if (!raw || raw === "auto")
 * continue`) — correct for the properties a control legitimately leaves
 * unset (e.g. something anchored only by `right`, never `left`), but wrong
 * when NONE of them are set: that element has nothing for the check to
 * measure at all, and the loop still reports "checked" without asserting
 * anything. Task 7 review's [Important] finding caught exactly this: the
 * "Tuning" gear button set none of `width`/`maxWidth`/`minWidth`/`left`/
 * `right`, so a test named "keeps ... its gear button within the
 * floating-control overflow check" performed zero assertions on it.
 *
 * Every `data-floating-control` element must declare a `width` or
 * `maxWidth` (something `checkNoOverflowAt375` can bound) AND a `left` or
 * `right` (a horizontal anchor — every floating control here is meant to be
 * `position: fixed`/`absolute`, anchored to a side, never centred by
 * margin alone). Missing either one fails immediately, naming the element,
 * instead of the previous silent no-op.
 *
 * Task 7 fix round 2: also requires `position` to be `fixed` or
 * `absolute`. Fix round 1's re-review caught the gap this closes from the
 * other side — an in-flow (`static`) element cannot be genuinely floating
 * UI no matter what `left`/`width` values it carries (a normal-flow block
 * ignores them), so a `data-floating-control` marker on one would let the
 * two checks above pass on values that do nothing. This is what makes
 * `data-load-error` correctly *not* eligible any more (fix round 2 removes
 * its marker instead of feeding it inert geometry — see `App.tsx`'s
 * `errorStyle`).
 */
function assertDeclaresOwnBox(element: HTMLElement, label: string): void {
  const position = element.style.position;
  expect(
    position === "fixed" || position === "absolute",
    `${label} is position:"${position || "static"}", not fixed/absolute — an in-flow element cannot be genuinely floating UI and must not carry data-floating-control`,
  ).toBe(true);
  const declaresWidth = (["width", "maxWidth"] as const).some((property) => {
    const raw = element.style[property];
    return !!raw && raw !== "auto";
  });
  expect(declaresWidth, `${label} declares no width/maxWidth — the overflow check has nothing to measure it with`).toBe(
    true,
  );
  const declaresAnchor = (["left", "right"] as const).some((property) => {
    const raw = element.style[property];
    return !!raw && raw !== "auto";
  });
  expect(declaresAnchor, `${label} declares no left/right — the overflow check has nothing to measure it with`).toBe(
    true,
  );
}

/**
 * A descendant `button`/`select` inside a floating container is bounded in
 * real CSS terms one of two ways: an inline `maxWidth: "100%"` (a
 * percentage resolves against the containing block, so this genuinely caps
 * the descendant at its container's width — unlike `flexWrap`, which only
 * wraps a line of items onto a new row and neither shrinks nor clips a
 * single item wider than its container), or its own `width`/`maxWidth` as
 * a `px`/`vw` value, in which case that value itself still has to clear
 * `checkNoOverflowAt375`'s usual ceiling. A descendant with neither —
 * nothing at all, or a `px`/`vw` value past the ceiling — fails by name.
 */
function assertDescendantIsBounded(element: HTMLElement, label: string): void {
  if (element.style.maxWidth === "100%") return; // genuinely bounded by its container, nothing further to check
  const declaresPxOrVwBound = (["width", "maxWidth"] as const).some((property) => {
    const raw = element.style[property];
    return !!raw && /^[\d.]+(px|vw)$/.test(raw.trim());
  });
  expect(
    declaresPxOrVwBound,
    `${label} is not bounded: no maxWidth:"100%" and no px/vw width/maxWidth of its own`,
  ).toBe(true);
  checkNoOverflowAt375(element, label);
}

/**
 * Walks every element `App` marks `data-floating-control` (the map's own
 * top bar, zoom controls, indicator, footer, the tuning panel — the
 * load-error block no longer qualifies, fix round 2) and, for each one,
 * first requires it to declare enough of its own geometry to be measured
 * at all, including genuinely being positioned (`assertDeclaresOwnBox`),
 * then overflow-checks it (`checkNoOverflowAt375`), then walks every
 * `button`/`select` descendant and requires each one to be bounded too
 * (`assertDescendantIsBounded`). Fix round 2, Finding 2: the previous
 * version of this test hand-picked which elements to check; discovering
 * them from the DOM instead means a future one can't slip past unnoticed.
 *
 * Task 7 fix round 1 removed the descendant walk on the claim that a
 * container's own `width`/`maxWidth` already bounds whatever is inside
 * it — **wrong**, per fix round 1's own re-review: `flexWrap: "wrap"`
 * wraps a *line* of items onto a new row once their combined width
 * exceeds the container, it does not shrink or clip a single item that is
 * itself wider than the container, and nothing here sets
 * `overflow: hidden` to clip one either. Restored the walk (fix round 2),
 * now checking each descendant against real CSS containment
 * (`assertDescendantIsBounded`) rather than skipping it as "covered by the
 * parent." A real browser layout assertion (whether a descendant's
 * *rendered* box, not just its inline style, ever exceeds its container)
 * is still out of reach here — jsdom has no layout engine — and stays a
 * `BACKLOG.md` item, not simulated.
 */
function checkAllFloatingControls(container: HTMLElement): void {
  const controls = Array.from(container.querySelectorAll<HTMLElement>("[data-floating-control]"));
  expect(controls.length, "expected at least one [data-floating-control] element to check").toBeGreaterThan(0);
  for (const element of controls) {
    const label = labelFor(element);
    assertDeclaresOwnBox(element, label);
    checkNoOverflowAt375(element, label);
    for (const child of Array.from(element.querySelectorAll<HTMLElement>("button, select"))) {
      assertDescendantIsBounded(child, `${label} > ${labelFor(child)}`);
    }
  }
}

/**
 * A rectangle in viewport coordinates: `x0`/`x1` from the viewport's own
 * left edge, `yFromBottom0`/`yFromBottom1` as distance from the viewport's
 * bottom edge (matching how every box here is actually anchored — `bottom`,
 * not `top` — except the assumed-fixed-height `VIEWPORT_HEIGHT_PX` used
 * only for the one top-anchored control, the top bar).
 */
interface Box {
  label: string;
  x0: number;
  x1: number;
  yFromBottom0: number;
  yFromBottom1: number;
}

/** Same parsing `checkNoOverflowAt375` already does (px/vw/%, no layout engine), pulled out so the pairwise sweep below can reuse it against widths other than 375. */
function toPx(raw: string | undefined, viewportWidth: number): number {
  if (!raw || raw === "auto") return 0;
  const match = /^(-?[\d.]+)(vw|px|%)$/.exec(raw.trim());
  if (!match) throw new Error(`"${raw}" is not a recognised vw/px/% length — extend toPx before trusting this box`);
  const value = Number(match[1]);
  return match[2] === "px" ? value : (value / 100) * viewportWidth; // every box here is `position: fixed`, so vw and % both resolve against the viewport
}

/** A fixed test viewport height (matches `FakeResizeObserver`'s own size, used throughout this file) — only needed to place the top-anchored top bar; nothing else in this sweep varies by height. */
const VIEWPORT_HEIGHT_PX = 800;

/**
 * Height estimates for elements whose real height is content-driven and
 * therefore not literally present as a single inline value (jsdom has no
 * layout engine to measure it) — each derived from the same fixed
 * ingredients (padding, border, font size) `task-6-rereview.md`'s own
 * finding used to verify the zoom controls' overlap by hand, kept here so
 * the pairwise sweep below can place a box on the y-axis too, not just x.
 * The zoom controls' and the indicator's live in `floatingLayout.ts`, since
 * `Footer` places itself from them too.
 */
/**
 * The footer's height with its text wrapped inside its declared box: the
 * longest disclosure (the arXiv sentence, ~370px at 12px system-ui) takes at
 * most three lines at the narrowest band `Footer` ever sits in between the
 * bottom-row columns (`FOOTER_MINIMUM_BAND_WIDTH`, 200px, less 28px of padding),
 * so 3 × ~15px lines + 8px padding + 2px border ≈ 55, rounded up.
 */
const FOOTER_HEIGHT_ESTIMATE = 60;

/**
 * Only for a footer centred by `left: 50%` + `translateX(-50%)` (the style
 * before the 2026-09-25 browser review, kept measurable so a regression to it
 * is caught by geometry, not by a missing property): its rendered width is
 * its text's, capped by its `maxWidth`. ~370px measured for the arXiv
 * sentence at 12px, plus 28px padding, rounded up.
 */
const CENTRED_FOOTER_WIDTH_ESTIMATE = 400;

/**
 * `[data-footer]`'s box. A footer that declares both `left` and `right` owns
 * the band between them (its text wraps inside it; the band is a superset of
 * the visible chip, so the check is conservative); a transform-centred one is
 * modelled from its text width (see `CENTRED_FOOTER_WIDTH_ESTIMATE`).
 */
function footerBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-footer]");
  // Inside the narrow window's bottom strip the credit has no box of its own: the strip is the box (`stripBox`).
  if (!element || element.closest("[data-bottom-strip]")) return null;
  const bottom = toPx(element.style.bottom, viewportWidth);
  let leftEdge: number;
  let rightEdge: number;
  if (element.style.left && element.style.right) {
    leftEdge = toPx(element.style.left, viewportWidth);
    rightEdge = viewportWidth - toPx(element.style.right, viewportWidth);
  } else if (element.style.left && element.style.transform === "translateX(-50%)") {
    const width = Math.min(toPx(element.style.maxWidth, viewportWidth), CENTRED_FOOTER_WIDTH_ESTIMATE);
    const centre = toPx(element.style.left, viewportWidth);
    leftEdge = centre - width / 2;
    rightEdge = centre + width / 2;
  } else {
    throw new Error("footer declares neither left + right nor a left + translateX(-50%) centring");
  }
  return {
    label: "footer",
    x0: leftEdge,
    x1: rightEdge,
    yFromBottom0: bottom,
    yFromBottom1: bottom + FOOTER_HEIGHT_ESTIMATE,
  };
}

/**
 * `[data-zoom-controls]`'s box: `right`/`bottom` are its own inline values; width comes from its first `<button>` child (the wrapper itself sets no `width`, only its buttons do — `flex-direction: column` sizes the wrapper to them).
 * On a narrow window the wrapper holds Fit alone, whose declared `minHeight` is its height.
 */
function zoomControlsBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-zoom-controls]");
  const buttons = element ? Array.from(element.querySelectorAll<HTMLElement>("button")) : [];
  const button = buttons[0];
  if (!element || !button) return null;
  const right = toPx(element.style.right, viewportWidth);
  const bottom = toPx(element.style.bottom, viewportWidth);
  const width = toPx(button.style.width, viewportWidth);
  const height = buttons.length === 1 ? toPx(button.style.minHeight, viewportWidth) : ZOOM_CONTROLS_HEIGHT_ESTIMATE;
  return {
    label: "zoom-controls",
    x0: viewportWidth - right - width,
    x1: viewportWidth - right,
    yFromBottom0: bottom,
    yFromBottom1: bottom + height,
  };
}

/** `[data-bottom-strip]`'s box (narrow window only): `left`/`right`/`bottom` are its own inline values; its height is `STRIP_HEIGHT_ESTIMATE`, two 12 px lines plus padding. */
function stripBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-bottom-strip]");
  if (!element) return null;
  const bottom = toPx(element.style.bottom, viewportWidth);
  return {
    label: "bottom-strip",
    x0: toPx(element.style.left, viewportWidth),
    x1: viewportWidth - toPx(element.style.right, viewportWidth),
    yFromBottom0: bottom,
    yFromBottom1: bottom + STRIP_HEIGHT_ESTIMATE,
  };
}

/**
 * A right-side sheet's box — the drawer (`[data-drawer]`) or the tuning panel
 * (`[data-tuning-panel]`), present only while open: `right`/`width`/`maxWidth`
 * for x, and from its `top` offset down to `bottom: 0` for y.
 */
function sheetBox(container: HTMLElement, selector: string, label: string, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const right = toPx(element.style.right, viewportWidth);
  const width = Math.min(toPx(element.style.width, viewportWidth), toPx(element.style.maxWidth, viewportWidth));
  return {
    label,
    x0: viewportWidth - right - width,
    x1: viewportWidth - right,
    yFromBottom0: 0,
    yFromBottom1: VIEWPORT_HEIGHT_PX - toPx(element.style.top, viewportWidth),
  };
}

/**
 * The drawer's box. On a narrow window it is a bottom sheet (`data-sheet-state`) spanning the width: collapsed, it
 * reaches `sheetCollapsedHeight` of the window's height up from the bottom edge (the same function `App` and `Drawer`
 * size it with); expanded, up to its `top`.
 */
function drawerBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-drawer]");
  const state = element?.getAttribute("data-sheet-state");
  if (!element || !state) return sheetBox(container, "[data-drawer]", "drawer", viewportWidth);
  return {
    label: `drawer (${state} sheet)`,
    x0: 0,
    x1: viewportWidth,
    yFromBottom0: 0,
    yFromBottom1:
      state === "collapsed"
        ? sheetCollapsedHeight(window.innerHeight)
        : VIEWPORT_HEIGHT_PX - toPx(element.style.top, viewportWidth),
  };
}

/** `[data-indicator]`'s box: `left`/`bottom` are its own inline values; width is `min(its own maxWidth, INDICATOR_MAXIMUM_CONTENT_WIDTH)` — the same model `ZoomControls`' own breakpoint is built from (`floatingLayout.ts`), so the test and the runtime code agree on what "wide enough" means. */
function indicatorBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-indicator]");
  if (!element || element.closest("[data-bottom-strip]")) return null;
  const left = toPx(element.style.left, viewportWidth);
  const bottom = toPx(element.style.bottom, viewportWidth);
  const width = Math.min(toPx(element.style.maxWidth, viewportWidth), INDICATOR_MAXIMUM_CONTENT_WIDTH);
  return {
    label: "indicator",
    x0: left,
    x1: left + width,
    yFromBottom0: bottom,
    yFromBottom1: bottom + INDICATOR_HEIGHT_ESTIMATE,
  };
}

/** `[data-topbar]`'s box: `left: 0; right: 0` spans the full width; its height is the one `FakeResizeObserver` reports for it at this width (it wraps taller on a narrow screen), placed from `VIEWPORT_HEIGHT_PX`, since it is the one top-anchored control among an otherwise bottom-anchored set. */
function topBarBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-topbar]");
  if (!element) return null;
  return {
    label: "topbar",
    x0: 0,
    x1: Number.POSITIVE_INFINITY,
    yFromBottom0: VIEWPORT_HEIGHT_PX - FakeResizeObserver.topBarHeight(viewportWidth),
    yFromBottom1: VIEWPORT_HEIGHT_PX,
  };
}

/**
 * The minimap's footprint, as a hard-coded "known box" (the controller's
 * own framing) rather than read from the library's internal
 * `[data-minimap]` element — `src/minimap/Minimap.tsx` is not part of the
 * public API (`data-minimap` is an implementation detail, never documented
 * or exported), so this test deliberately does not couple itself to that
 * internal DOM shape. `MINIMAP_WIDTH`/`MINIMAP_HEIGHT`/`MINIMAP_MARGIN`
 * (`floatingLayout.ts`) are the same constants `ZoomControls`' own
 * breakpoint is built from.
 */
function minimapBox(): Box {
  return {
    label: "minimap (known box)",
    x0: MINIMAP_MARGIN,
    x1: MINIMAP_MARGIN + MINIMAP_WIDTH,
    yFromBottom0: MINIMAP_MARGIN,
    yFromBottom1: MINIMAP_MARGIN + MINIMAP_HEIGHT,
  };
}

/**
 * `[data-assistant-panel]`'s box, present only while open: wide, a column at `left` above the bottom row (`bottom` +
 * `maxHeight`); narrow, a sheet under the top bar (`top` + `maxHeight`), spanning `left`/`right`.
 */
function assistantPanelBox(container: HTMLElement, viewportWidth: number): Box | null {
  const element = container.querySelector<HTMLElement>("[data-assistant-panel]");
  if (!element || element.hidden) return null;
  const height = toPx(element.style.maxHeight, viewportWidth);
  const left = toPx(element.style.left, viewportWidth);
  if (element.style.top) {
    const top = toPx(element.style.top, viewportWidth);
    return {
      label: "assistant-panel (sheet)",
      x0: left,
      x1: viewportWidth - toPx(element.style.right, viewportWidth),
      yFromBottom0: VIEWPORT_HEIGHT_PX - top - height,
      yFromBottom1: VIEWPORT_HEIGHT_PX - top,
    };
  }
  const bottom = toPx(element.style.bottom, viewportWidth);
  const width = Math.min(toPx(element.style.width, viewportWidth), toPx(element.style.maxWidth, viewportWidth));
  return { label: "assistant-panel", x0: left, x1: left + width, yFromBottom0: bottom, yFromBottom1: bottom + height };
}

function boxesIntersect(first: Box, second: Box): boolean {
  const horizontalOverlap = first.x0 < second.x1 && second.x0 < first.x1;
  const verticalOverlap = first.yFromBottom0 < second.yFromBottom1 && second.yFromBottom0 < first.yFromBottom1;
  return horizontalOverlap && verticalOverlap;
}

/**
 * Every pair of the demo's *underlying* floating boxes — the zoom
 * controls, the indicator, the top bar, and the minimap's known footprint
 * — must not intersect, at the given viewport width, whether the drawer is
 * open or closed. Computed entirely from inline values (`toPx`, the same
 * technique `checkNoOverflowAt375` uses for a single element's own
 * overflow), no layout engine involved (showcase Task 6 fix round 2).
 *
 * The drawer's own box is deliberately never one of the boxes checked
 * here, even though it is `data-floating-control` too and `drawerBox`
 * above can compute it: `task-6-rereview.md`'s own "Checked and clean"
 * section explicitly confirms the drawer covering the *unshifted* zoom
 * controls at a narrow width is the intended fallback, not a bug — a
 * one-tap-reversible overlay is allowed to sit on top of whatever is
 * beneath it, the same way it is allowed to sit on top of the map itself
 * (`Drawer.tsx`'s own doc comment). What this check is actually for is the
 * relationship *between* the controls that are not the drawer — in
 * particular, whether the zoom controls' *shifted* position (only reached
 * while the drawer is open and the viewport is wide) lands somewhere it
 * shouldn't among them; the caller still sweeps both drawer states because
 * that is what decides whether the controls are in their unshifted or
 * shifted position, even though the drawer's own box plays no part in the
 * assertion below.
 *
 * `[data-footer]` is included (2026-09-25 browser review, B9: the old
 * centred footer covered the minimap at 375-600px and Fit at 768px with the
 * drawer open): it declares its own band (`footerBox`), so it is checked
 * against every other box here like the rest.
 *
 * The one pair the drawer (and the tuning panel, which takes the same slot)
 * is checked in: against the top bar. The review found the open sheet
 * covering the Tuning button and the corpus picker at 1440 and 768, which
 * is not a reversible-overlay fallback — the picker must stay usable while a
 * sheet is open — so each sheet has to start below the bar's measured height.
 */
function checkNoFloatingBoxIntersections(container: HTMLElement, viewportWidth: number): void {
  const narrow = viewportWidth < NARROW_WINDOW_WIDTH;
  const boxes = [
    zoomControlsBox(container, viewportWidth),
    indicatorBox(container, viewportWidth),
    topBarBox(container, viewportWidth),
    // A narrow window drops the minimap (spec mobile §6).
    narrow ? null : minimapBox(),
    footerBox(container, viewportWidth),
    stripBox(container, viewportWidth),
    assistantPanelBox(container, viewportWidth),
  ].filter((box): box is Box => box !== null);
  const pairs: Array<[Box, Box]> = [];
  for (let index = 0; index < boxes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < boxes.length; otherIndex += 1)
      pairs.push([boxes[index] as Box, boxes[otherIndex] as Box]);
  }
  const topBar = topBarBox(container, viewportWidth);
  for (const sheet of [
    drawerBox(container, viewportWidth),
    sheetBox(container, "[data-tuning-panel]", "tuning-panel", viewportWidth),
  ]) {
    if (sheet && topBar) pairs.push([topBar, sheet]);
  }
  // A collapsed bottom sheet must leave Fit above it, pressable (spec mobile §6); the strip it covers is reached again on close.
  const zoom = zoomControlsBox(container, viewportWidth);
  const drawer = drawerBox(container, viewportWidth);
  if (narrow && zoom && drawer?.label === "drawer (collapsed sheet)") pairs.push([zoom, drawer]);
  // The dialogue sheet and the item sheet must not share the narrow screen while the item sheet is collapsed.
  const dialogue = assistantPanelBox(container, viewportWidth);
  if (narrow && dialogue && drawer?.label === "drawer (collapsed sheet)") pairs.push([dialogue, drawer]);

  for (const [first, second] of pairs) {
    expect(
      boxesIntersect(first, second),
      `${first.label} [${first.x0.toFixed(1)},${first.x1.toFixed(1)}]x[${first.yFromBottom0},${first.yFromBottom1}] and ${second.label} [${second.x0.toFixed(1)},${second.x1.toFixed(1)}]x[${second.yFromBottom0},${second.yFromBottom1}] intersect at viewport width ${viewportWidth}`,
    ).toBe(false);
  }
}

/** A successful response for the arXiv asset request, carrying `payload` as its JSON body. */
function arxivResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Stubs the arXiv asset `fetch` with an already-resolved payload, then imports and renders a fresh `App`. */
async function renderApp(arxivPayload: unknown = TINY_ARXIV_SPEC) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => arxivResponse(arxivPayload)),
  );
  const { App } = await import("./App");
  return render(createElement(App));
}

/**
 * jsdom has no `ResizeObserver`. The demo's `App` never passes explicit
 * `width`/`height` to `CorpusMap` — it fills the window (showcase Task 5) —
 * so without this fake `useElementSize` never measures a box and the map
 * never renders anything (`ready` stays false forever). A real observer
 * reports the observed element's current size as soon as `observe()`
 * starts (the same fact `src/viewport/useElementSize.test.tsx` documents);
 * this fake does the same, with a fixed size standing in for the window.
 */
class FakeResizeObserver {
  static readonly size = { width: 1280, height: 800 };

  /**
   * The top bar's border-box height at a viewport width, standing in for
   * the browser's layout: one row (~50px) when wide, two rows once its
   * contents wrap on a narrow screen (the review measured the wrap at 375).
   * The numbers are this fake's world, not a claim about real pixels — what
   * the tests check is that the right-side sheets start below whatever the
   * bar reports.
   */
  static topBarHeight(viewportWidth: number): number {
    return viewportWidth < 600 ? 90 : 50;
  }

  private static readonly live = new Set<FakeResizeObserver>();

  /** Re-reports every observed element, as a real observer does after a layout change (a window resize). */
  static fireAll(): void {
    for (const observer of FakeResizeObserver.live) observer.report();
  }

  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.targets.add(target);
    FakeResizeObserver.live.add(this);
    this.report();
  }

  private report(): void {
    const entries = [...this.targets].map((target) => {
      const size = target.hasAttribute("data-topbar")
        ? { width: window.innerWidth, height: FakeResizeObserver.topBarHeight(window.innerWidth) }
        : FakeResizeObserver.size;
      return {
        target,
        contentRect: size,
        borderBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
      } as unknown as ResizeObserverEntry;
    });
    if (entries.length > 0) this.callback(entries, this as unknown as ResizeObserver);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    FakeResizeObserver.live.delete(this);
  }
}

describe("App (showcase Task 5)", () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    vi.resetModules();
    originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    // The demo mirrors its view into the hash (spec slice C §6) and the next
    // App reads its corpus from there: a hash a test leaves behind would open
    // the next test on the wrong corpus.
    window.history.replaceState(null, "", window.location.pathname);
    vi.unstubAllGlobals();
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver | undefined }).ResizeObserver =
      originalResizeObserver;
  });

  it("shows a loading state, then the map, for the default arXiv corpus (stubbed fetch)", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const { App } = await import("./App");
    render(createElement(App));

    expect(screen.getByText("Loading corpus…")).not.toBeNull();
    expect(screen.queryByText(territoryButtonText(TINY_ARXIV_SPEC))).toBeNull();

    await act(async () => {
      resolveFetch(arxivResponse(TINY_ARXIV_SPEC));
    });

    // Mounting the map itself (the `ResizeObserver`'s first report, the
    // scene build) is a further step past the corpus resolving, so wait for
    // its own content rather than just the loading text's disappearance.
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    expect(screen.queryByText("Loading corpus…")).toBeNull();
  });

  it("switches the rendered corpus and the exact footer text through the corpus select", async () => {
    await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    expect(screen.getByText("Thank you to arXiv for use of its open access interoperability.")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
    await screen.findByText(territoryButtonText(elementsSpec));
    expect(screen.queryByText("Thank you to arXiv for use of its open access interoperability.")).toBeNull();
    expect(screen.queryByText(/^Synthetic corpus,/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
    await screen.findByText(territoryButtonText(syntheticSpec));
    expect(screen.getByText("Synthetic corpus, generated for scale testing.")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "constellations" } });
    await screen.findByText(territoryButtonText(constellationsSpec));
    expect(screen.queryByText(/^Synthetic corpus,/)).toBeNull();
  });

  it("passes the accessibility audit with the real arXiv corpus loaded", async () => {
    const { container } = await renderApp(arxivJson);
    // The real corpus builds an 8000-item scene; under a loaded suite that takes longer than the default 1 s.
    await screen.findByText(territoryButtonText(ARXIV_TERRITORIES), undefined, { timeout: 10_000 });
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
  });

  it("puts the top bar before the map, so headings read h1 then h2 and Tab reaches the demo controls first", async () => {
    await renderApp(arxivJson);
    await screen.findByText(territoryButtonText(ARXIV_TERRITORIES), undefined, { timeout: 10_000 });
    const title = screen.getByRole("heading", { level: 1 });
    const sectionHeadings = screen.getAllByRole("heading", { level: 2 });
    expect(sectionHeadings.length).toBeGreaterThan(0);
    for (const heading of sectionHeadings) {
      expect(title.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const surface = document.querySelector("[data-map-shell] [tabindex='0']");
    expect(surface).not.toBeNull();
    expect(
      screen.getByLabelText("Corpus").compareDocumentPosition(surface as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls the zoom handle from the Zoom in button and the indicator reflects the new ratio", async () => {
    await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    await screen.findByText("far · 1.0× · 2 items");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    await waitFor(() => {
      expect(screen.queryByText("far · 1.0× · 2 items")).toBeNull();
    });
  });

  it("renders the indicator from onViewChange's own values on mount", async () => {
    await renderApp();
    await screen.findByText("far · 1.0× · 2 items");
  });

  it.each([
    [true, DARK_THEME],
    [false, DEFAULT_THEME],
  ])("shows the map legend in the theme that matches prefers-color-scheme (dark: %s)", async (dark, theme) => {
    vi.stubGlobal("matchMedia", () => ({
      matches: dark,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await renderApp();
    const legend = await screen.findByRole("region", { name: "Map legend" });
    const probe = document.createElement("div");
    probe.style.background = theme.cardBackground;
    expect(legend.style.background).toBe(probe.style.background);
  });

  it("keeps every floating control out of document flow and bounded to the viewport (style checks, not pixels)", async () => {
    const { container } = await renderApp();
    await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    // The indicator only appears once `onViewChange` has committed — a
    // separate effect from the one that renders the territory list above —
    // so wait for it by name before reading anyone's style, rather than
    // assuming the two are always in the same commit.
    await screen.findByText("far · 1.0× · 2 items");

    const shell = container.querySelector<HTMLElement>("[data-app-shell]");
    expect(shell?.style.overflow).toBe("hidden");

    const topbar = container.querySelector<HTMLElement>("[data-topbar]");
    expect(topbar?.style.position).toBe("fixed");
    expect(topbar?.style.flexWrap).toBe("wrap");

    const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
    expect(zoom?.style.position).toBe("fixed");

    const indicator = container.querySelector<HTMLElement>("[data-indicator]");
    expect(indicator?.style.position).toBe("fixed");

    const footer = container.querySelector<HTMLElement>("[data-footer]");
    expect(footer?.style.position).toBe("fixed");

    checkAllFloatingControls(container);
  });

  describe("Fix round 1 — failed arXiv load recovers, and the switch-away-and-back race", () => {
    it("shows a plain error and a Try again button when the arXiv import rejects; retrying loads the map", async () => {
      let resolveRetry!: (spec: MapSpec) => void;
      const retryPromise = new Promise<MapSpec>((resolve) => {
        resolveRetry = resolve;
      });
      const loadArxiv = vi
        .fn<() => Promise<MapSpec>>()
        .mockRejectedValueOnce(new Error("network drop"))
        .mockReturnValueOnce(retryPromise);
      const { App } = await import("./App");
      const { container } = render(createElement<AppProps>(App, { loadArxiv }));

      await screen.findByText("Could not load the corpus.");
      // No apology, no jargon, and it says what to do next.
      expect(screen.queryByText(/sorry/i)).toBeNull();

      // The corpus select stays usable even while the map failed to load.
      expect((screen.getByLabelText("Corpus") as HTMLSelectElement).disabled).toBe(false);

      // Fix round 2, Finding 2 (Task 6): originally added because the
      // load-error block was itself marked `data-floating-control` and
      // walked here. Task 7 fix round 2 removed that marker (it's static
      // in-flow content, not floating UI — see `App.tsx`'s `errorStyle`);
      // this call is kept because the *other* floating controls (top bar,
      // zoom controls, indicator, footer) are still on screen while the
      // error state shows, and the general layout-sanity test never
      // triggers this branch.
      checkAllFloatingControls(container);

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      // The stale error must not linger while the retry itself is still in
      // flight — this is what proves clearing on a fresh load key (not just
      // the retry's eventual success) is what makes it stop showing.
      await waitFor(() => {
        expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      });
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      await act(async () => {
        resolveRetry(TINY_ARXIV_SPEC);
      });

      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      expect(loadArxiv).toHaveBeenCalledTimes(2);
    });

    it("a late-resolving stale load never overwrites the corpus after switching away and back before it settles", async () => {
      const resolvers: Array<(spec: MapSpec) => void> = [];
      const loadArxiv = vi.fn<() => Promise<MapSpec>>(
        () =>
          new Promise<MapSpec>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const STALE_SPEC: MapSpec = {
        version: "1",
        territories: [{ id: "stale", name: "Stale Territory", members: ["s1"], centroid: [0, 0] }],
        nodes: [{ id: "s1", label: "Stale paper", x: 0, y: 0, territory: "stale" }],
      };
      const FRESH_SPEC: MapSpec = {
        version: "1",
        territories: [{ id: "fresh", name: "Fresh Territory", members: ["f1"], centroid: [0, 0] }],
        nodes: [{ id: "f1", label: "Fresh paper", x: 0, y: 0, territory: "fresh" }],
      };

      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      // First load in flight (arxiv is the default corpus).
      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));

      // Switch away, then back to arxiv, before that first load resolves.
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));
      expect(resolvers).toHaveLength(2);

      // Resolve the FIRST (now-stale) promise late, with a spec that must
      // never reach the screen — it belongs to an abandoned load attempt.
      await act(async () => {
        const stale = resolvers[0];
        if (!stale) throw new Error("expected the first resolver to exist");
        stale(STALE_SPEC);
      });
      expect(screen.queryByText(territoryButtonText(STALE_SPEC))).toBeNull();
      // Still showing the loading state for the second (current) attempt.
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      // Now resolve the SECOND (current) promise — this is the one that must win.
      await act(async () => {
        const fresh = resolvers[1];
        if (!fresh) throw new Error("expected the second resolver to exist");
        fresh(FRESH_SPEC);
      });
      await screen.findByText(territoryButtonText(FRESH_SPEC));
      expect(screen.queryByText(territoryButtonText(STALE_SPEC))).toBeNull();
    });
  });

  describe("Fix round 2 — every load start gets its own attempt identity", () => {
    /** A `loadArxiv` mock whose Nth call's controls (resolve/reject) are pushed to `controls` in call order. */
    function controllableLoader(): {
      loadArxiv: () => Promise<MapSpec>;
      controls: Array<{ resolve: (spec: MapSpec) => void; reject: (error: Error) => void }>;
    } {
      const controls: Array<{ resolve: (spec: MapSpec) => void; reject: (error: Error) => void }> = [];
      const loadArxiv = vi.fn<() => Promise<MapSpec>>(
        () =>
          new Promise<MapSpec>((resolve, reject) => {
            controls.push({ resolve, reject });
          }),
      );
      return { loadArxiv, controls };
    }

    it("switching away from a failed load and back shows Loading, not the stale error, while the fresh load is in flight", async () => {
      const { loadArxiv, controls } = controllableLoader();
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));
      const first = controls[0];
      if (!first) throw new Error("expected the first load's controls to exist");
      await act(async () => {
        first.reject(new Error("network drop"));
      });
      await screen.findByText("Could not load the corpus.");

      // Switch away, then back to arXiv, before the fresh load settles —
      // the re-reviewer's exact scenario: this is an *implicit* retry
      // (never touches `retryToken`), so a scheme that only tags a fresh
      // attempt on "Try again" clicks misses it entirely.
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));
      // A genuinely fresh load is now in flight; the previous, already-
      // settled error must not still be on screen.
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
      expect(screen.getByText("Loading corpus…")).not.toBeNull();

      const second = controls[1];
      if (!second) throw new Error("expected the second load's controls to exist");
      await act(async () => {
        second.resolve(TINY_ARXIV_SPEC);
      });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
    });

    it("pins: switching away from a loaded corpus and back re-imports rather than reusing the cached spec", async () => {
      const loadArxiv = vi.fn<() => Promise<MapSpec>>().mockResolvedValue(TINY_ARXIV_SPEC);
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      expect(loadArxiv).toHaveBeenCalledTimes(1);

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      // Pinned, not asserted as "the only correct choice": every switch
      // back into arXiv calls the loader again rather than reusing a spec
      // held by `App`. The real loader this stands in for is itself cheap
      // to call again — it keeps a successful load in memory and only goes
      // back to the network after a failure — so `App` needs no caching
      // layer of its own that could quietly go stale.
      expect(loadArxiv).toHaveBeenCalledTimes(2);
    });

    it("pins: a stale failure that arrives after a later success does not override it", async () => {
      const { loadArxiv, controls } = controllableLoader();
      const { App } = await import("./App");
      render(createElement<AppProps>(App, { loadArxiv }));

      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });
      await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(2));

      const second = controls[1];
      if (!second) throw new Error("expected the second load's controls to exist");
      await act(async () => {
        second.resolve(TINY_ARXIV_SPEC);
      });
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      // The stale FIRST attempt now fails, late — must not override the
      // success already on screen.
      const first = controls[0];
      if (!first) throw new Error("expected the first load's controls to exist");
      await act(async () => {
        first.reject(new Error("stale network drop"));
      });
      expect(screen.getByText(territoryButtonText(TINY_ARXIV_SPEC))).not.toBeNull();
      expect(screen.queryByText("Could not load the corpus.")).toBeNull();
    });
  });

  describe("Selected-item drawer (showcase Task 6)", () => {
    /**
     * Selection only reaches `onSelect` through the accessible tree's own
     * per-node buttons, which only exist at the "near" regime
     * (`AccessibleTree`), for whichever nodes `visibleNodes` currently
     * considers on screen. `TINY_ARXIV_SPEC`'s own two nodes sit exactly at
     * its world bounds' extremes, so `fit`'s view just barely contains them
     * at ratio 1 and *any* further zoom-in (which shrinks the view about
     * the box centre) pushes both out of view before "near" is even
     * reached — there is no zoom level where they are both in view and in
     * the near regime. `SELECT_SPEC` below carries the same two papers
     * (same ids, labels and meta as `TINY_ARXIV_SPEC`'s `p1`/`p2`, so every
     * assertion below reads the same) placed a hair off dead centre
     * instead, plus two filler nodes far out at the bounds' actual extremes
     * — the fit still centres on (0, 0), so `p1`/`p2` stay on screen no
     * matter how far in the box zooms.
     */
    const SELECT_SPEC: MapSpec = {
      version: "1",
      territories: [
        { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2", "west", "east"], centroid: [0, 0] },
      ],
      nodes: [
        {
          id: "p1",
          label: "A Tiny Paper About Testing",
          x: -0.0001,
          y: 0,
          territory: "cs.AI",
          meta: { year: 2026, url: "https://arxiv.org/abs/0000.00001" },
        },
        {
          id: "p2",
          label: "Another Tiny Paper",
          x: 0.0001,
          y: 0,
          territory: "cs.AI",
          meta: { year: 2025, url: "https://arxiv.org/abs/0000.00002" },
        },
        { id: "west", label: "West filler", x: -1, y: 0, territory: "cs.AI" },
        { id: "east", label: "East filler", x: 1, y: 0, territory: "cs.AI" },
      ],
    };

    /**
     * Each "Zoom in" click multiplies the ratio by
     * `exp(120 * DEFAULT_TUNING.wheelSensitivity)` (~1.27x); ten clicks
     * clears the default `nearAt` threshold of 6 with room to spare, well
     * under the `MAX_ZOOM_IN` clamp of 64x.
     */
    function zoomToNear(): void {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
    }

    it("opens the drawer with the exact label and the arXiv link on selecting a node, and passes the floating-control overflow check", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      expect(screen.queryByRole("dialog")).toBeNull();

      zoomToNear();
      const nodeButton = await screen.findByRole("button", { name: "A Tiny Paper About Testing" });
      fireEvent.click(nodeButton);

      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      const link = within(dialog).getByRole("link", { name: "Open on arXiv" });
      expect(link.getAttribute("href")).toBe("https://arxiv.org/abs/0000.00001");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(within(dialog).getByText("Published 2026")).not.toBeNull();
      expect(within(dialog).getByText("Artificial Intelligence")).not.toBeNull();

      // The drawer is floating UI like every other demo control — this is
      // the same style-based check the rest of the shell already passes,
      // now walking the drawer too because it carries `data-floating-control`.
      checkAllFloatingControls(container);
    });

    it("selecting a different node while open updates the drawer in place instead of closing it", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();

      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.click(screen.getByRole("button", { name: "Another Tiny Paper" }));
      await screen.findByRole("dialog", { name: "Another Tiny Paper" });
      expect(screen.queryByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeNull();
    });

    it("lists the selected paper's related papers (compact edges from the payload) and opens one on press (slice E)", async () => {
      const relatedSpec = {
        ...SELECT_SPEC,
        territories: [
          { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "west"], centroid: [-0.5, 0] },
          { id: "cs.SE", name: "Software Engineering", members: ["p2", "east"], centroid: [0.5, 0] },
        ],
        nodes: SELECT_SPEC.nodes.map((node) =>
          node.id === "p2" || node.id === "east" ? { ...node, territory: "cs.SE" } : node,
        ),
        edges: [[0, 1, 90]],
      };
      await renderApp(relatedSpec);
      await screen.findByText("Artificial Intelligence, 2 items");
      zoomToNear();

      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      expect(within(dialog).getByRole("heading", { name: "Related" })).not.toBeNull();
      const relatedButtons = within(within(dialog).getByRole("list")).getAllByRole("button");
      expect(relatedButtons).toHaveLength(1);
      expect(relatedButtons[0]?.textContent).toContain("Another Tiny Paper");
      expect(relatedButtons[0]?.textContent).toContain("tiny, paper");

      fireEvent.click(relatedButtons[0] as HTMLElement);
      await screen.findByRole("dialog", { name: "Another Tiny Paper" });
      await waitFor(() => expect(window.location.hash).toContain("selected=p2"));
    });

    it("reveals a related paper left of the open drawer, not under it (insets)", async () => {
      const relatedSpec = {
        ...SELECT_SPEC,
        territories: [
          { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "west"], centroid: [-0.5, 0] },
          { id: "cs.SE", name: "Software Engineering", members: ["p2", "east"], centroid: [0.5, 0] },
        ],
        nodes: SELECT_SPEC.nodes.map((node) =>
          node.id === "p2" || node.id === "east" ? { ...node, territory: "cs.SE" } : node,
        ),
        edges: [[0, 1, 90]],
      };
      await renderApp(relatedSpec);
      await screen.findByText("Artificial Intelligence, 2 items");
      zoomToNear();

      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      fireEvent.click(within(within(dialog).getByRole("list")).getByRole("button"));
      await waitFor(() => expect(window.location.hash).toContain("selected=p2"));
      // The drawer covers the map's right edge, so the paper (x 0.0001) is
      // centred in the uncovered area: the box centre then shows a point to
      // its right. Without the inset the view's centre would be the paper.
      const view = new URLSearchParams(window.location.hash.slice(1)).get("view")?.split(",").map(Number);
      expect(view?.[0]).toBeGreaterThan(0.0001 * 1.01);
    });

    it("leaves a related paper out of the drawer while its category is hidden (slice E)", async () => {
      const relatedSpec = {
        ...SELECT_SPEC,
        territories: [
          { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "west"], centroid: [-0.5, 0] },
          { id: "cs.SE", name: "Software Engineering", members: ["p2", "east"], centroid: [0.5, 0] },
        ],
        nodes: SELECT_SPEC.nodes.map((node) =>
          node.id === "p2" || node.id === "east" ? { ...node, territory: "cs.SE" } : node,
        ),
        edges: [[0, 1, 90]],
      };
      await renderApp(relatedSpec);
      await screen.findByText("Artificial Intelligence, 2 items");
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      expect(within(dialog).queryByRole("heading", { name: "Related" })).not.toBeNull();

      const legend = screen.getByRole("region", { name: "Map legend" });
      if (within(legend).queryByRole("checkbox", { name: "Show Software Engineering" }) === null)
        fireEvent.click(within(legend).getByRole("button", { name: "Legend" }));
      fireEvent.click(within(legend).getByRole("checkbox", { name: "Show Software Engineering" }));
      await waitFor(() => expect(within(dialog).queryByRole("heading", { name: "Related" })).toBeNull());
    });

    it("switching corpus while the drawer is open closes it — a stale selection from the corpus just left must never show", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Escape closes the drawer and returns focus to the map surface", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      // The surface itself, not its shell: the map's keys (a second Escape,
      // +/-, arrows) only listen on the surface (2026-10-24 browser pass).
      expect(document.activeElement).toBe(container.querySelector("[data-map-shell] [data-map-surface]"));
    });

    it("the drawer's Close button returns focus to the map surface", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(container.querySelector("[data-map-shell] [data-map-surface]"));
    });

    it("a view change while the drawer is open leaves focus where the user put it (Zoom in click)", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      const zoomIn = screen.getByRole("button", { name: "Zoom in" });
      zoomIn.focus();
      fireEvent.click(zoomIn);
      expect(document.activeElement).toBe(zoomIn);
    });

    it("a wheel zoom on the map while the drawer is open leaves focus on the corpus picker", async () => {
      const { container } = await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      const select = screen.getByLabelText("Corpus");
      select.focus();
      const surface = container.querySelector<HTMLElement>("[data-map-surface]");
      expect(surface).not.toBeNull();
      if (surface) fireEvent.wheel(surface, { deltaY: -100, clientX: 640, clientY: 400 });
      expect(document.activeElement).toBe(select);
    });

    it("Escape still closes the drawer after the app re-rendered while it was open (the latest onClose is used)", async () => {
      await renderApp(SELECT_SPEC);
      await screen.findByText(territoryButtonText(SELECT_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    describe("keeping the zoom controls reachable beside the drawer (fix round 1)", () => {
      const originalInnerWidth = window.innerWidth;

      /** `window.innerWidth` is read at mount by `ZoomControls`' lazy `useState` initializer — must be set before `renderApp`. */
      function setViewportWidth(width: number): void {
        Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      }

      afterEach(() => {
        setViewportWidth(originalInnerWidth);
      });

      async function openDrawer(): Promise<void> {
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        zoomToNear();
        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      }

      it("on a wide viewport, shifts the zoom controls' right edge left of the drawer's left edge while the drawer is open", async () => {
        setViewportWidth(1280);
        const { container } = await renderApp(SELECT_SPEC);
        await openDrawer();

        // Parsed the same way `checkNoOverflowAt375` reads inline values —
        // no layout engine in jsdom. The drawer's `right` is `0` and its
        // rendered width, at this viewport, is capped at `DRAWER_MAXIMUM_WIDTH`
        // by its own `maxWidth` (its `width: 90vw` would be far larger), so
        // its left edge sits at `right + DRAWER_MAXIMUM_WIDTH` from the
        // viewport's own right edge. The controls' right edge sits left of
        // that exactly when their own `right` offset is greater.
        const drawer = container.querySelector<HTMLElement>("[data-drawer]");
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        const drawerRight = Number.parseFloat(drawer?.style.right ?? "");
        const drawerLeftFromViewportRight = drawerRight + DRAWER_MAXIMUM_WIDTH;
        const zoomRight = Number.parseFloat(zoom?.style.right ?? "");
        expect(zoomRight).toBeGreaterThan(drawerLeftFromViewportRight);
      });

      it("at 375px the drawer is a bottom sheet and Fit stays at its default right offset, lifted above the sheet (spec mobile §6)", async () => {
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        // Zoom in/out are gone on a narrow window, so the map is zoomed to near before the window narrows.
        zoomToNear();
        setViewportWidth(375);
        fireEvent(window, new Event("resize"));
        act(() => FakeResizeObserver.fireAll());
        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

        checkAllFloatingControls(container);
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        expect(zoom?.style.right).toBe("12px");
        expect(zoom?.style.bottom).toBe(`${sheetCollapsedHeight(window.innerHeight) + GUTTER}px`);
      });
    });

    describe("a narrow window (spec mobile §6)", () => {
      const originalInnerWidth = window.innerWidth;

      function setViewportWidth(width: number): void {
        Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      }

      afterEach(() => {
        setViewportWidth(originalInnerWidth);
      });

      /** Every button and select inside a floating control declares an inline `minHeight` of at least 44 px. */
      function checkTouchTargets(container: HTMLElement): void {
        for (const control of Array.from(container.querySelectorAll<HTMLElement>("[data-floating-control]"))) {
          for (const child of Array.from(control.querySelectorAll<HTMLElement>("button, select, a[href]"))) {
            const name = `${labelFor(control)} > ${child.getAttribute("aria-label") ?? child.textContent}`;
            expect(
              Number.parseFloat(child.style.minHeight),
              `${name} has no inline minHeight of 44 px`,
            ).toBeGreaterThanOrEqual(44);
          }
        }
      }

      /** Renders wide, zooms to near (Zoom in is gone below 600 px), then narrows the window to 375. */
      async function renderNarrow(spec: MapSpec = SELECT_SPEC): Promise<HTMLElement> {
        const { container } = await renderApp(spec);
        await screen.findByText(territoryButtonText(spec));
        expect(container.querySelector("[data-minimap]")).not.toBeNull();
        zoomToNear();
        setViewportWidth(375);
        fireEvent(window, new Event("resize"));
        act(() => FakeResizeObserver.fireAll());
        return container;
      }

      it("opens the dialogue from the Menu as a sheet that fits 375 px, and a pressed citation hands the screen to the item", async () => {
        const container = await renderNarrow();
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
        const region = screen.getByRole("region", { name: "Assistant" });
        checkAllFloatingControls(container);
        checkTouchTargets(container);
        fireEvent.change(within(region).getByRole("textbox", { name: "Assistant" }), { target: { value: "testing" } });
        fireEvent.submit(within(region).getByRole("textbox", { name: "Assistant" }).closest("form") as HTMLFormElement);
        const citation = await within(region).findByRole(
          "button",
          { name: "A Tiny Paper About Testing" },
          { timeout: 3000 },
        );
        fireEvent.click(citation);
        expect(container.querySelector<HTMLElement>("[data-assistant-panel]")?.hidden).toBe(true);
        expect(await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeTruthy();
      });

      it("folds the top bar into a Menu and keeps only Fit, 44 × 44, with no minimap", async () => {
        const container = await renderNarrow();
        expect(screen.getByRole("button", { name: "Menu" })).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Tuning" })).toBeNull();
        expect(container.querySelector("[data-minimap]")).toBeNull();
        const buttons = Array.from(container.querySelectorAll<HTMLElement>("[data-zoom-controls] button"));
        expect(buttons.map((button) => button.textContent)).toEqual(["Fit"]);
        expect(buttons[0]?.style.width).toBe("44px");
        expect(buttons[0]?.style.minHeight).toBe("44px");
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        expect(zoom?.style.bottom).toBe(`${STRIP_HEIGHT_ESTIMATE + GUTTER}px`);
      });

      it("shares one bottom strip between the indicator and the arXiv credit, in 12 px text", async () => {
        const container = await renderNarrow();
        const strip = container.querySelector<HTMLElement>("[data-bottom-strip]");
        expect(strip).not.toBeNull();
        expect(strip?.style.fontSize).toBe("12px");
        const indicator = strip?.querySelector<HTMLElement>("[data-indicator]");
        const footer = strip?.querySelector<HTMLElement>("[data-footer]");
        expect(indicator).not.toBeNull();
        expect(footer?.textContent).toContain("Thank you to arXiv");
        // In flow inside the strip, not floating boxes of their own.
        for (const element of [indicator, footer]) {
          expect(element?.style.position).toBe("");
          expect(element?.hasAttribute("data-floating-control")).toBe(false);
        }
      });

      it("flows the indicator and the credit as one run of text, so the credit wraps under the indicator and not beside it (two lines at 320 px, spec mobile §6)", async () => {
        const container = await renderNarrow();
        const strip = container.querySelector<HTMLElement>("[data-bottom-strip]");
        // Side by side (a flex row), the credit got the width left of the
        // indicator and took three lines at 320 px in the browser pass.
        expect(strip?.style.display).toBe("block");
        const indicator = strip?.querySelector<HTMLElement>("[data-indicator]");
        const footer = strip?.querySelector<HTMLElement>("[data-footer]");
        expect(indicator?.style.display).toBe("inline");
        expect(indicator?.style.whiteSpace).toBe("nowrap");
        expect(footer?.style.display).toBe("inline");
        // A margin alone reads as "itemsThank": a real space keeps two words apart for a screen reader.
        expect(strip?.textContent).toMatch(/items Thank you to arXiv/);
      });

      it("opens a selected item in a collapsed bottom sheet and keeps a revealed item above it (insets.bottom)", async () => {
        const relatedSpec = {
          ...SELECT_SPEC,
          territories: [
            { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "west"], centroid: [-0.5, 0] },
            { id: "cs.SE", name: "Software Engineering", members: ["p2", "east"], centroid: [0.5, 0] },
          ],
          nodes: SELECT_SPEC.nodes.map((node) =>
            node.id === "p2" || node.id === "east" ? { ...node, territory: "cs.SE" } : node,
          ),
          edges: [[0, 1, 90]],
        };
        const { container } = await renderApp(relatedSpec);
        await screen.findByText("Artificial Intelligence, 2 items");
        zoomToNear();
        setViewportWidth(375);
        fireEvent(window, new Event("resize"));
        act(() => FakeResizeObserver.fireAll());

        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        const dialog = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
        expect(container.querySelector("[data-drawer]")?.getAttribute("data-sheet-state")).toBe("collapsed");
        fireEvent.click(within(within(dialog).getByRole("list")).getByRole("button"));
        await waitFor(() => expect(window.location.hash).toContain("selected=p2"));
        // The sheet covers the map's bottom edge, so the paper (y 0) is centred
        // in the area above it: the box centre then shows a point below the
        // paper. Without the inset the view's centre would be the paper.
        const view = new URLSearchParams(window.location.hash.slice(1)).get("view")?.split(",").map(Number);
        expect(Math.abs(view?.[1] ?? 0)).toBeGreaterThan(0);
      });

      it("opens Tuning from the Menu as an expanded sheet below the top bar", async () => {
        const container = await renderNarrow();
        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        await screen.findByRole("dialog", { name: "Tuning" });
        const panel = container.querySelector<HTMLElement>("[data-tuning-panel]");
        expect(panel?.getAttribute("data-sheet-state")).toBe("expanded");
        expect(panel?.style.left).toBe("0px");
        expect(panel?.style.right).toBe("0px");
        expect(panel?.style.top).toBe(`${FakeResizeObserver.topBarHeight(375)}px`);
        checkAllFloatingControls(container);
      });

      it("gives every button, select and link inside a floating control a 44 px minimum height", async () => {
        const container = await renderNarrow();
        checkTouchTargets(container);

        fireEvent.click(screen.getByRole("button", { name: "Menu" }));
        checkTouchTargets(container);
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        await screen.findByRole("dialog", { name: "Tuning" });
        checkTouchTargets(container);
        fireEvent.keyDown(document, { key: "Escape" });

        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
        checkTouchTargets(container);
      });

      it("restores the wide layout when the window widens again", async () => {
        const container = await renderNarrow();
        setViewportWidth(1024);
        fireEvent(window, new Event("resize"));
        act(() => FakeResizeObserver.fireAll());
        expect(container.querySelector("[data-bottom-strip]")).toBeNull();
        expect(container.querySelector("[data-minimap]")).not.toBeNull();
        expect(screen.getByRole("button", { name: "Zoom in" })).not.toBeNull();
        expect(screen.getByRole("button", { name: "Tuning" })).not.toBeNull();
      });
    });

    describe("clearing the minimap and indicator too, not just the drawer (fix round 2)", () => {
      const originalInnerWidth = window.innerWidth;

      /** `window.innerWidth` is read at mount and kept live via a `resize` listener (`ZoomControls`). */
      function setViewportWidth(width: number): void {
        Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      }

      afterEach(() => {
        setViewportWidth(originalInnerWidth);
      });

      /**
       * `task-6-rereview.md`'s own sweep, reproduced here so it runs on
       * every future change rather than once during review: two widths
       * below `WIDE_ENOUGH_TO_SHIFT_PX`'s old (fix round 1) value of 440,
       * the whole 440-588 band the finding named as colliding with the
       * minimap under that old threshold, then a spread up through a
       * clearly-wide desktop width.
       */
      const SWEEP_WIDTHS = [375, 440, 480, 588, 600, 768, 1024, 1280, 1440];

      it("no two floating boxes intersect at any swept width, with the drawer open or with it closed", async () => {
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        zoomToNear();
        const nodeButton = await screen.findByRole("button", { name: "A Tiny Paper About Testing" });
        // The arXiv footer is one of the checked boxes; without it the sweep would skip it silently.
        expect(container.querySelector("[data-footer]")).not.toBeNull();

        for (const width of SWEEP_WIDTHS) {
          setViewportWidth(width);
          fireEvent(window, new Event("resize"));
          // The top bar re-wraps at the new width; a real observer reports it.
          act(() => FakeResizeObserver.fireAll());

          // Drawer closed — trivially safe (the unshifted `right: 12` never
          // reaches the bottom-left column at these widths), checked anyway
          // so a future change to the unshifted position is covered too.
          checkNoFloatingBoxIntersections(container, width);

          // Drawer open — the actual case fix round 1 broke and this round fixes.
          fireEvent.click(nodeButton);
          await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
          checkNoFloatingBoxIntersections(container, width);

          fireEvent.keyDown(document, { key: "Escape" });
          expect(screen.queryByRole("dialog")).toBeNull();
        }
      });

      it("the open dialogue panel clears every other floating box at every swept width, with the drawer open or closed", async () => {
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        zoomToNear();
        const nodeButton = await screen.findByRole("button", { name: "A Tiny Paper About Testing" });

        for (const width of SWEEP_WIDTHS) {
          setViewportWidth(width);
          fireEvent(window, new Event("resize"));
          act(() => FakeResizeObserver.fireAll());

          // Below 600 px Ask AI sits behind the top bar's Menu (spec mobile §6).
          if (width < NARROW_WINDOW_WIDTH) fireEvent.click(screen.getByRole("button", { name: "Menu" }));
          fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
          expect(container.querySelector<HTMLElement>("[data-assistant-panel]")?.hidden).toBe(false);
          expect(assistantPanelBox(container, width), `no panel box at ${width}`).not.toBeNull();
          checkNoFloatingBoxIntersections(container, width);

          fireEvent.click(nodeButton);
          if (width < NARROW_WINDOW_WIDTH) {
            // The dialogue sheet and the item sheet take turns on a narrow window.
            expect(screen.queryByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeNull();
          } else {
            await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
          }
          checkNoFloatingBoxIntersections(container, width);
          fireEvent.keyDown(document, { key: "Escape" });

          if (width < NARROW_WINDOW_WIDTH) fireEvent.click(screen.getByRole("button", { name: "Menu" }));
          fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
          expect(container.querySelector<HTMLElement>("[data-assistant-panel]")?.hidden).toBe(true);
        }
      });

      it("the open tuning panel starts below the top bar at every swept width (2026-09-25 review)", async () => {
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));

        for (const width of SWEEP_WIDTHS) {
          setViewportWidth(width);
          fireEvent(window, new Event("resize"));
          act(() => FakeResizeObserver.fireAll());

          // Below 600 px Tuning sits behind the top bar's Menu (spec mobile §6).
          if (width < NARROW_WINDOW_WIDTH) fireEvent.click(screen.getByRole("button", { name: "Menu" }));
          fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
          await screen.findByRole("dialog", { name: "Tuning" });
          checkNoFloatingBoxIntersections(container, width);

          fireEvent.keyDown(document, { key: "Escape" });
          expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
        }
      });

      it("the map starts below the top bar at every swept width, so the legend's toggle and the fitted names are never under it (slice D browser check)", async () => {
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));

        for (const width of SWEEP_WIDTHS) {
          setViewportWidth(width);
          fireEvent(window, new Event("resize"));
          act(() => FakeResizeObserver.fireAll());
          const mapShell = container.querySelector<HTMLElement>("[data-map-shell]");
          expect(mapShell?.style.top).toBe(`${FakeResizeObserver.topBarHeight(width)}px`);
        }
      });

      it("the breakpoint itself is derived from BOTTOM_LEFT_COLUMN_WIDTH, not just the drawer, and clears both it and the drawer", async () => {
        const breakpoint = BOTTOM_LEFT_COLUMN_WIDTH + GUTTER + BUTTON_WIDTH + GUTTER + DRAWER_MAXIMUM_WIDTH + GUTTER;
        setViewportWidth(breakpoint);
        const { container } = await renderApp(SELECT_SPEC);
        await screen.findByText(territoryButtonText(SELECT_SPEC));
        zoomToNear();
        fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
        await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

        const zoom = zoomControlsBox(container, breakpoint);
        const drawer = drawerBox(container, breakpoint);
        const minimap = minimapBox();
        expect(zoom).not.toBeNull();
        expect(drawer).not.toBeNull();
        const zoomBox = zoom as NonNullable<typeof zoom>;
        const openDrawerBox = drawer as NonNullable<typeof drawer>;

        // The breakpoint's own formula has one GUTTER for the column
        // clearance and, separately, one GUTTER on each side of the
        // shifted position's own footprint (before the drawer, and after
        // the button width) — so at this exact boundary the shifted
        // controls clear the minimap/indicator column by 2×GUTTER, not
        // just one; the important part is that it is strictly more than
        // zero (a real, positive margin), parsed from inline values, no
        // layout engine.
        const columnRight = Math.max(minimap.x1, INDICATOR_LEFT + INDICATOR_MAXIMUM_CONTENT_WIDTH);
        expect(zoomBox.x0 - columnRight).toBe(2 * GUTTER);
        // And, unchanged from fix round 1, still clears the drawer's own
        // left edge by exactly one GUTTER.
        expect(openDrawerBox.x0 - zoomBox.x1).toBe(GUTTER);
      });
    });
  });

  describe("Tuning panel and wheel capture (showcase Task 7)", () => {
    /** Same two-filler-plus-centre-pair shape as `SELECT_SPEC` above, kept local to this describe block. */
    const PANEL_SPEC: MapSpec = {
      version: "1",
      territories: [
        { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "west", "east"], centroid: [0, 0] },
      ],
      nodes: [
        {
          id: "p1",
          label: "A Tiny Paper About Testing",
          x: -0.0001,
          y: 0,
          territory: "cs.AI",
          meta: { year: 2026, url: "https://arxiv.org/abs/0000.00001" },
        },
        { id: "west", label: "West filler", x: -1, y: 0, territory: "cs.AI" },
        { id: "east", label: "East filler", x: 1, y: 0, territory: "cs.AI" },
      ],
    };

    function zoomToNear(): void {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
    }

    function mapSurface(container: HTMLElement): HTMLElement {
      const element = container.querySelector<HTMLElement>("[data-map-surface]");
      if (!element) throw new Error("expected the map surface to be mounted");
      return element;
    }

    it("the gear button toggles the tuning panel", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(screen.getByRole("dialog", { name: "Tuning" })).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
    });

    it("'t' opens and closes the tuning panel", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      fireEvent.keyDown(document, { key: "t" });
      expect(screen.getByRole("dialog", { name: "Tuning" })).not.toBeNull();

      fireEvent.keyDown(document, { key: "t" });
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
    });

    it("'t' typed with a modifier, or while a panel input has focus, does not toggle the panel", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      fireEvent.keyDown(document, { key: "t", ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(screen.getByRole("dialog", { name: "Tuning" })).not.toBeNull();

      // Revert-check target: dropping the input/select/textarea guard in
      // App.tsx's keydown handler must fail this assertion (the panel would
      // close instead of staying open).
      const pinchGainInput = screen.getByLabelText(/Pinch gain/);
      fireEvent.keyDown(pinchGainInput, { key: "t" });
      expect(screen.getByRole("dialog", { name: "Tuning" })).not.toBeNull();
    });

    it("opening the panel closes the drawer, and selecting a node closes the panel (mutual exclusion)", async () => {
      await renderApp(PANEL_SPEC);
      await screen.findByText(territoryButtonText(PANEL_SPEC));
      zoomToNear();
      const nodeButton = await screen.findByRole("button", { name: "A Tiny Paper About Testing" });

      fireEvent.click(nodeButton);
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(screen.getByRole("dialog", { name: "Tuning" })).not.toBeNull();
      expect(screen.queryByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeNull();

      fireEvent.click(nodeButton);
      await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
    });

    it("changing pinchGain via the panel reaches the map's own tuning prop (observed through a ctrl-wheel zoom)", async () => {
      const { container } = await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      await screen.findByText("far · 1.0× · 2 items");

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      // Revert-check target: if this change never reached `CorpusMap`'s own
      // `tuning` prop, the ratio below would settle at the default
      // pinchGain's factor (exp(50×5×0.002) ≈ 1.65, never reaching the
      // `maxZoomPerEvent` clamp) instead of the clamp itself.
      fireEvent.change(screen.getByLabelText(/Pinch gain/), { target: { value: "20" } });

      // Default pinchGain (5): factor = exp(50×5×0.002) = exp(0.5) ≈ 1.65,
      // below `maxZoomPerEvent`'s clamp of 2. pinchGain 20 pushes the same
      // event past the clamp (exp(50×20×0.002) = exp(2) ≈ 7.39, clamped to
      // 2) — ratio 2.0 is reachable in one event only once the new
      // pinchGain actually took effect.
      fireEvent.wheel(mapSurface(container), { deltaY: -50, deltaMode: 0, ctrlKey: true });
      await screen.findByText(/mid · 2\.0×/);
    });

    it("an invalid thresholds combination (midAt > nearAt) shows the error and the map keeps the previous thresholds", async () => {
      const { container } = await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      await screen.findByText("far · 1.0× · 2 items");

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.change(screen.getByLabelText(/Mid at/), { target: { value: "10" } });

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        `thresholds.midAt (10) must be <= thresholds.nearAt (${entryDisplay("arxiv")?.thresholds?.nearAt})`,
      );

      // One full-clamp wheel-in event (capped at `maxZoomPerEvent`'s default
      // of 2×) lands at ratio 2 — inside arXiv's mid band (midAt 2 up to its
      // own nearAt). If the invalid draft (midAt=10) had reached the map
      // instead of being rejected, ratio 2 would still read "far".
      fireEvent.wheel(mapSurface(container), { deltaY: -600, deltaMode: 0, ctrlKey: false });
      await screen.findByText(/mid · 2\.0×/);
    });

    it("Copy settings leaves out an invalid draft: it copies the thresholds the map is using, arXiv's own", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.change(screen.getByLabelText(/Mid at/), { target: { value: "10" } });
      expect(screen.getByRole("alert")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({ display: entryDisplay("arxiv") });
    });

    describe("per-corpus values (slice G)", () => {
      async function openOn(corpus: "elements" | "constellations"): Promise<void> {
        fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: corpus } });
        await screen.findByText(territoryButtonText(corpus === "elements" ? elementsSpec : constellationsSpec));
      }

      function cardWidth(): string {
        return (screen.getByLabelText(/Card width/) as HTMLInputElement).value;
      }

      it("an edit on one corpus survives a switch away and back, and does not leak into another", async () => {
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        await openOn("elements");
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        const baselineWidth = cardWidth();
        fireEvent.change(screen.getByLabelText(/Card width/), { target: { value: "280" } });

        await openOn("constellations");
        expect(cardWidth()).toBe(baselineWidth);
        await openOn("elements");
        expect(cardWidth()).toBe("280");
      });

      it("a draft error stays on the corpus it was made on", async () => {
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        await openOn("elements");
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        fireEvent.change(screen.getByLabelText(/Mid at/), { target: { value: "10" } });
        expect(screen.getByRole("alert")).not.toBeNull();

        await openOn("constellations");
        expect(screen.queryByRole("alert")).toBeNull();
        await openOn("elements");
        expect(screen.getByRole("alert")).not.toBeNull();
      });

      it("Reset returns only the current corpus to its own values", async () => {
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        await openOn("constellations");
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        fireEvent.change(screen.getByLabelText(/Card width/), { target: { value: "300" } });
        await openOn("elements");
        const baselineWidth = cardWidth();
        fireEvent.change(screen.getByLabelText(/Card width/), { target: { value: "280" } });

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        expect(cardWidth()).toBe(baselineWidth);
        await openOn("constellations");
        expect(cardWidth()).toBe("300");
      });

      it("the panel names the corpus it edits", async () => {
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        await openOn("elements");
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        expect(screen.getByText("Editing: Chemical elements")).not.toBeNull();
      });

      it("Copy settings copies the entry's own display at the corpus's values, then only what changed", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        // Constellations: its nearAt differs from the library default, so the copy has a value to carry.
        await openOn("constellations");
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));

        fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
        await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({ display: entryDisplay("constellations") });

        fireEvent.change(screen.getByLabelText(/Fade band/), { target: { value: "0.4" } });
        fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
        await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(JSON.parse(writeText.mock.calls[1]?.[0] as string)).toEqual({
          display: { ...entryDisplay("constellations"), tuning: { fadeBand: 0.4 } },
        });
      });

      it("Copy settings says it could not copy when there is no clipboard", async () => {
        Object.assign(navigator, { clipboard: undefined });
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));

        expect(() => fireEvent.click(screen.getByRole("button", { name: "Copy settings" }))).not.toThrow();
        await screen.findByText("Could not copy to clipboard.");
      });
    });

    it("Reset restores the panel's tuning/thresholds controls to their defaults and clears the error", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));

      fireEvent.change(screen.getByLabelText(/Pinch gain/), { target: { value: "12" } });
      fireEvent.change(screen.getByLabelText(/Mid at/), { target: { value: "10" } });
      expect(screen.getByRole("alert")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect((screen.getByLabelText(/Pinch gain/) as HTMLInputElement).value).toBe(String(DEFAULT_TUNING.pinchGain));
      expect((screen.getByLabelText(/Mid at/) as HTMLInputElement).value).toBe(String(DEFAULT_THRESHOLDS.midAt));
    });

    // task-7-review.md Minor finding #2: the only committed Reset test
    // checked `pinchGain`/`midAt` alone, leaving `cardSize` and the
    // synthetic size/seed controls unguarded against a regression.
    it("Reset also restores cardSize, synthetic size and seed to their defaults", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
      await screen.findByText(territoryButtonText(syntheticSpec));

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.change(screen.getByLabelText(/Card width/), { target: { value: "280" } });
      fireEvent.change(screen.getByLabelText(/Card height/), { target: { value: "140" } });
      // The smallest size the control allows: any non-default value proves the
      // reset, and each change regenerates and repaints the corpus, which at
      // 9000 nodes ran this test close to its 15 s timeout under suite load.
      fireEvent.change(screen.getByLabelText(/Synthetic size/), { target: { value: "1000" } });
      fireEvent.change(screen.getByLabelText(/Seed/), { target: { value: "77" } });
      expect((screen.getByLabelText(/Synthetic size/) as HTMLInputElement).value).toBe("1000");
      expect((screen.getByLabelText(/Card width/) as HTMLInputElement).value).toBe("280");
      expect((screen.getByLabelText(/Seed/) as HTMLInputElement).value).toBe("77");

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      const computed = cardSizeOf("synthetic", syntheticSpec);
      expect((screen.getByLabelText(/Card width/) as HTMLInputElement).value).toBe(String(computed.width));
      expect((screen.getByLabelText(/Card height/) as HTMLInputElement).value).toBe(String(computed.height));
      expect((screen.getByLabelText(/Synthetic size/) as HTMLInputElement).value).toBe("5000");
      expect((screen.getByLabelText(/Seed/) as HTMLInputElement).value).toBe("1");
    });

    it("Reset on another corpus leaves the synthetic corpus's size and seed alone", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
      await screen.findByText(territoryButtonText(syntheticSpec));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.change(screen.getByLabelText(/Synthetic size/), { target: { value: "1000" } });
      fireEvent.change(screen.getByLabelText(/Seed/), { target: { value: "77" } });

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await screen.findByText(territoryButtonText(elementsSpec));
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });

      expect((screen.getByLabelText(/Synthetic size/) as HTMLInputElement).value).toBe("1000");
      expect((screen.getByLabelText(/Seed/) as HTMLInputElement).value).toBe("77");
    });

    describe("computed card size (slice G)", () => {
      function panelCardSize(): { width: number; height: number } {
        return {
          width: Number((screen.getByLabelText(/Card width/) as HTMLInputElement).value),
          height: Number((screen.getByLabelText(/Card height/) as HTMLInputElement).value),
        };
      }

      it("each corpus's panel starts at the card size computed from its own card titles", async () => {
        await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        expect(panelCardSize()).toEqual(cardSizeOf("arxiv", TINY_ARXIV_SPEC));

        fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
        await screen.findByText(territoryButtonText(elementsSpec));
        expect(panelCardSize()).toEqual(cardSizeOf("elements", elementsSpec));

        fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "constellations" } });
        await screen.findByText(territoryButtonText(constellationsSpec));
        expect(panelCardSize()).toEqual(cardSizeOf("constellations", constellationsSpec));
      });

      it("before arXiv's spec arrives, the panel opens on the library's default 160 x 56", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(() => new Promise<Response>(() => {})),
        );
        const { App } = await import("./App");
        render(createElement(App));
        expect(screen.getByText("Loading corpus…")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        expect(panelCardSize()).toEqual({ width: 160, height: 56 });
      });

      // An edit made while arXiv loads must not pin the loading size: the
      // card size follows the computed one until someone sets it.
      it("an edit made while arXiv loads keeps the card size computed once its spec arrives", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        let resolveLoad: (spec: MapSpec) => void = () => {};
        const loadArxiv = vi.fn(
          () =>
            new Promise<MapSpec>((resolve) => {
              resolveLoad = resolve;
            }),
        );
        const { App } = await import("./App");
        render(createElement<AppProps>(App, { loadArxiv }));
        await waitFor(() => expect(loadArxiv).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        fireEvent.change(screen.getByLabelText(/Fade band/), { target: { value: "0.4" } });
        await act(async () => resolveLoad(TINY_ARXIV_SPEC));
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

        expect(panelCardSize()).toEqual(cardSizeOf("arxiv", TINY_ARXIV_SPEC));
        fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
        await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual({
          display: { ...entryDisplay("arxiv"), tuning: { fadeBand: 0.4 } },
        });
      });
    });

    // task-7-review.md Minor finding #3: "regenerates only on a size/seed
    // change" was true (verified live by the reviewer with a throwaway
    // probe) but unguarded in the committed suite. Spies on the real
    // `generateCorpus` (never replaces its behaviour) to count calls
    // rather than asserting anything about its output.
    it("regenerates the synthetic corpus only when its size or seed control changes, not on a panel toggle or a wheel zoom", async () => {
      vi.doMock("../fixtures/synthetic/generate", async (importOriginal) => {
        const actual = await importOriginal<typeof import("../fixtures/synthetic/generate")>();
        return { ...actual, generateCorpus: vi.fn(actual.generateCorpus) };
      });
      const generateModule = await import("../fixtures/synthetic/generate");
      const generateCorpusSpy = generateModule.generateCorpus as unknown as ReturnType<typeof vi.fn>;

      const { container } = await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
      await screen.findByText(territoryButtonText(syntheticSpec));

      const callsAfterMount = generateCorpusSpy.mock.calls.length;
      expect(callsAfterMount).toBeGreaterThan(0);

      // Panel open, close, reopen, plus a wheel zoom on the real map
      // surface -- none of these touch `syntheticSize`/`syntheticSeed`,
      // so the memo must not re-run.
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.wheel(mapSurface(container), { deltaY: -20, deltaMode: 0, ctrlKey: false });
      expect(generateCorpusSpy.mock.calls.length).toBe(callsAfterMount);

      fireEvent.change(screen.getByLabelText(/Synthetic size/), { target: { value: "9000" } });
      expect(generateCorpusSpy.mock.calls.length).toBe(callsAfterMount + 1);

      vi.doUnmock("../fixtures/synthetic/generate");
    });

    it("the synthetic corpus's picker label shows the current size, following the panel and Reset", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      const option = (): string | null =>
        (screen.getByLabelText("Corpus") as HTMLSelectElement).querySelector('option[value="synthetic"]')
          ?.textContent ?? null;
      expect(option()).toBe("Synthetic (5,000 items)");

      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "synthetic" } });
      await screen.findByText(territoryButtonText(syntheticSpec));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      fireEvent.change(screen.getByLabelText(/Synthetic size/), { target: { value: "9000" } });
      expect(option()).toBe("Synthetic (9,000 items)");

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(option()).toBe("Synthetic (5,000 items)");
    });

    it("the wheel capture table inside the panel records a real wheel event on the map surface", async () => {
      const { container } = await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));

      fireEvent.wheel(mapSurface(container), { deltaY: -33, deltaMode: 0, ctrlKey: true });

      const table = screen.getByRole("table");
      const rows = within(table).getAllByRole("row");
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const firstDataRow = rows[1] as HTMLElement;
      const cells = within(firstDataRow).getAllByRole("cell");
      expect(cells.map((cell) => cell.textContent)).toEqual(["-33.00", "0", "yes", "-"]);
    });

    it("the panel's own Close button and Escape both close it and return focus to the gear button", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      await screen.findByRole("dialog", { name: "Tuning" });
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tuning" }));

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      await screen.findByRole("dialog", { name: "Tuning" });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tuning" }));
    });

    it("opening the panel (gear button or 't') moves focus into it", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      const dialog = screen.getByRole("dialog", { name: "Tuning" });
      expect(dialog.contains(document.activeElement)).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
      fireEvent.keyDown(document.body, { key: "t" });
      expect(screen.getByRole("dialog", { name: "Tuning" }).contains(document.activeElement)).toBe(true);
    });

    it("opening the panel from the drawer's Close button moves focus into the panel, not to the page body", async () => {
      await renderApp(PANEL_SPEC);
      await screen.findByText(territoryButtonText(PANEL_SPEC));
      zoomToNear();
      fireEvent.click(await screen.findByRole("button", { name: "A Tiny Paper About Testing" }));
      const drawer = await screen.findByRole("dialog", { name: "A Tiny Paper About Testing" });
      const drawerClose = within(drawer).getByRole("button", { name: "Close" });
      expect(document.activeElement).toBe(drawerClose);

      fireEvent.keyDown(drawerClose, { key: "t" });
      expect(screen.queryByRole("dialog", { name: "A Tiny Paper About Testing" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Tuning" }).contains(document.activeElement)).toBe(true);
    });

    it("closing the panel with 't' while focus is inside it returns focus to the gear button", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      const reset = screen.getByRole("button", { name: "Reset" });
      reset.focus();

      fireEvent.keyDown(reset, { key: "t" });
      expect(screen.queryByRole("dialog", { name: "Tuning" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tuning" }));
    });

    it("an invalid Tuning combination (labelClasses.medium > large) shows the tuning error without crashing the map", async () => {
      await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));

      fireEvent.change(screen.getByLabelText(/Label class: large/), { target: { value: "0.2" } });
      fireEvent.change(screen.getByLabelText(/Label class: medium/), { target: { value: "0.9" } });

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/tuning\.labelClasses\.medium/);
      // The map itself must still be on screen, not crashed by an invalid
      // `tuning` prop reaching `CorpusMap`.
      expect(screen.getByText(territoryButtonText(TINY_ARXIV_SPEC))).not.toBeNull();
    });

    // Renamed (Task 7 fix round 1): the previous name ("...and its gear
    // button...") overclaimed — the gear button itself is nested inside
    // the top bar and carries no geometry of its own on purpose
    // (`checkAllFloatingControls` no longer walks descendants at all).
    // What this actually proves is that the open tuning panel, and the
    // top bar that bounds the gear button, both declare enough geometry
    // to be measured and don't overflow at 375px — named accordingly.
    it("keeps the open tuning panel, and the top bar that bounds its gear button, within the floating-control overflow check", async () => {
      const { container } = await renderApp();
      await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
      fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
      await screen.findByRole("dialog", { name: "Tuning" });
      checkAllFloatingControls(container);
    });

    describe("keeping the zoom controls reachable beside the tuning panel", () => {
      const originalInnerWidth = window.innerWidth;

      function setViewportWidth(width: number): void {
        Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      }

      afterEach(() => {
        setViewportWidth(originalInnerWidth);
      });

      it("on a wide viewport, shifts the zoom controls' right edge left of the panel's left edge while the panel is open", async () => {
        setViewportWidth(1280);
        const { container } = await renderApp();
        await screen.findByText(territoryButtonText(TINY_ARXIV_SPEC));
        fireEvent.click(screen.getByRole("button", { name: "Tuning" }));
        await screen.findByRole("dialog", { name: "Tuning" });

        // Revert-check target: dropping `|| panelOpen` from `App.tsx`'s
        // `<ZoomControls drawerOpen={...} />` wiring must fail this
        // assertion — the controls would stay at their unshifted `right`
        // offset, directly under the open panel.
        const panel = container.querySelector<HTMLElement>("[data-tuning-panel]");
        const zoom = container.querySelector<HTMLElement>("[data-zoom-controls]");
        const panelRight = Number.parseFloat(panel?.style.right ?? "");
        const panelLeftFromViewportRight = panelRight + DRAWER_MAXIMUM_WIDTH;
        const zoomRight = Number.parseFloat(zoom?.style.right ?? "");
        expect(zoomRight).toBeGreaterThan(panelLeftFromViewportRight);
      });
    });
  });

  describe("deep link (spec slice C §6)", () => {
    afterEach(() => {
      window.history.replaceState(null, "", window.location.pathname);
    });

    it("reopens the linked view after the lazy arXiv load", async () => {
      window.history.replaceState(null, "", "#corpus=arxiv&view=0,0,6");
      await renderApp();
      expect(await screen.findByText(/6\.0×/)).toBeTruthy();
    });

    it("a malformed link opens the default corpus at the fit", async () => {
      window.history.replaceState(null, "", "#corpus=nope&view=0,0,-1");
      await renderApp();
      expect(await screen.findByText(/1\.0×/)).toBeTruthy();
    });

    it("a user switch away and back to arXiv opens at the fit, not the old link", async () => {
      window.history.replaceState(null, "", "#corpus=arxiv&view=0,0,6");
      await renderApp();
      expect(await screen.findByText(/6\.0×/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "arxiv" } });
      expect(await screen.findByText(/1\.0×/)).toBeTruthy();
      expect(screen.queryByText(/6\.0×/)).toBeNull();
    });

    it("a selection does not survive a switch away and back", async () => {
      window.history.replaceState(null, "", "#corpus=elements&selected=c");
      const { container } = await renderApp();
      // Item buttons render at near: open Carbon's territory from the tree.
      const openNonmetals = async () => {
        await screen.findByText(/1\.0×/);
        act(() => screen.getByRole("button", { name: /^Reactive Nonmetals,/ }).click());
        await screen.findByRole("button", { name: "C" });
      };
      await openNonmetals();
      expect(screen.getByRole("button", { name: "C" }).getAttribute("aria-current")).toBe("true");
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "constellations" } });
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await openNonmetals();
      expect(container.querySelector('[aria-current="true"]')).toBeNull();
    });

    describe("the drawer and the map share one selection (2026-10-24 browser pass)", () => {
      const openNonmetals = async () => {
        await screen.findByText(/1\.0×/);
        act(() => screen.getByRole("button", { name: /^Reactive Nonmetals,/ }).click());
        await screen.findByRole("button", { name: "C" });
      };

      it("a linked selection opens its drawer", async () => {
        window.history.replaceState(null, "", "#corpus=elements&selected=c");
        await renderApp();
        await screen.findByRole("dialog", { name: "C" });
      });

      it("closing the drawer clears the map's selection and the link", async () => {
        window.history.replaceState(null, "", "#corpus=elements&selected=c");
        await renderApp();
        const dialog = await screen.findByRole("dialog", { name: "C" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        await openNonmetals();
        expect(screen.getByRole("button", { name: "C" }).getAttribute("aria-current")).toBeNull();
        await waitFor(() => expect(window.location.hash).not.toContain("selected"));
      });

      it("a press that clears the map's selection closes the drawer", async () => {
        window.history.replaceState(null, "", "#corpus=elements&selected=c");
        const { container } = await renderApp();
        await screen.findByRole("dialog", { name: "C" });
        // At far any press clears the selection (spec slice C §3).
        const surface = container.querySelector("[data-map-surface]") as HTMLElement;
        const pointer = { pointerId: 1, button: 0, isPrimary: true, clientX: 5, clientY: 5 };
        fireEvent.pointerDown(surface, pointer);
        fireEvent.pointerUp(surface, pointer);
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      it("opening the tuning panel clears the map's selection", async () => {
        window.history.replaceState(null, "", "#corpus=elements&selected=c");
        await renderApp();
        await screen.findByRole("dialog", { name: "C" });
        fireEvent.keyDown(window, { key: "t" });
        await openNonmetals();
        expect(screen.getByRole("button", { name: "C" }).getAttribute("aria-current")).toBeNull();
      });
    });

    it("Copy link writes the pending hash first, then copies the URL and says so", async () => {
      const writeText = vi.fn(async (_text: string) => {});
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      try {
        await renderApp();
        await screen.findByText(/1\.0×/);
        fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        });
        // The switch mounts a fresh map at its fit, so the link names the corpus
        // and no view: a link without a view opens at that same fit.
        expect(window.location.hash).toBe("#corpus=elements");
        expect(writeText).toHaveBeenCalledExactlyOnceWith(window.location.href);
        expect(screen.getByText("Link copied")).toBeTruthy();
      } finally {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    });

    it.each([
      ["no clipboard", undefined],
      ["a clipboard that refuses", { writeText: async () => Promise.reject(new Error("denied")) }],
    ])("Copy link with %s says so and points at the address bar", async (_case, clipboard) => {
      Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
      try {
        await renderApp();
        await screen.findByText(/1\.0×/);
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        });
        expect(screen.getByText("Copy failed: use the address bar")).toBeTruthy();
      } finally {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    });

    it("offers a Copy link button with its own maxWidth", async () => {
      await renderApp();
      const button = await screen.findByRole("button", { name: "Copy link" });
      expect(button.style.maxWidth).not.toBe("");
    });
  });

  describe("search beside the map (spec search §6)", () => {
    // Two items close together between two fillers, like the drawer tests' spec: zooming in reaches the near regime, where items are buttons.
    const SEARCH_SPEC: MapSpec = {
      version: "1",
      territories: [
        { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2", "west", "east"], centroid: [0, 0] },
      ],
      nodes: [
        { id: "p1", label: "Graph colouring", x: -0.0001, y: 0, territory: "cs.AI" },
        { id: "p2", label: "Graph matching", x: 0.0001, y: 0, territory: "cs.AI" },
        { id: "west", label: "West filler", x: -1, y: 0, territory: "cs.AI" },
        { id: "east", label: "East filler", x: 1, y: 0, territory: "cs.AI" },
      ],
    };
    const searchBox = () => screen.getByRole("textbox", { name: "Search" });
    const typeQuery = (text: string) => fireEvent.change(searchBox(), { target: { value: text } });
    function zoomToNear(): void {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
    }

    it("marks the found items as matches on the map and leaves the others alone", async () => {
      await renderApp(SEARCH_SPEC);
      await screen.findByText(/1\.0×/);
      zoomToNear();
      typeQuery("matching");
      await screen.findByText("1 result");
      const found = await screen.findByRole("button", { name: "Graph matching" });
      const other = await screen.findByRole("button", { name: "Graph colouring" });
      expect(found.getAttribute("aria-description")).toBe("match");
      expect(other.getAttribute("aria-description")).toBeNull();
    });

    it("fits the view around the matches with Show on map", async () => {
      await renderApp(SEARCH_SPEC);
      await screen.findByText(/1\.0×/);
      typeQuery("graph");
      await screen.findByText("2 results");
      const before = screen.getByText(/\d+\.\d×/).textContent;
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Show on map" }));
      });
      expect(screen.getByText(/\d+\.\d×/).textContent).not.toBe(before);
    });

    it("clears the search when the corpus changes", async () => {
      await renderApp(SEARCH_SPEC);
      await screen.findByText(/1\.0×/);
      typeQuery("graph");
      await screen.findByText("2 results");
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await waitFor(() => expect((searchBox() as HTMLInputElement).value).toBe(""));
      expect(screen.queryByText("2 results")).toBeNull();
    });

    it("keeps the search in the floating-control overflow check", async () => {
      const { container } = await renderApp(SEARCH_SPEC);
      await screen.findByText(/1\.0×/);
      typeQuery("graph");
      await screen.findByText("2 results");
      checkAllFloatingControls(container);
    });
  });

  describe("the dialogue beside the map (spec assistant §7)", () => {
    const ASSISTANT_SPEC: MapSpec = {
      version: "1",
      territories: [
        { id: "cs.AI", name: "Artificial Intelligence", members: ["p1", "p2", "west", "east"], centroid: [0, 0] },
      ],
      nodes: [
        { id: "p1", label: "Graph colouring", x: -0.0001, y: 0, territory: "cs.AI" },
        { id: "p2", label: "Graph matching", x: 0.0001, y: 0, territory: "cs.AI" },
        { id: "west", label: "West filler", x: -1, y: 0, territory: "cs.AI" },
        { id: "east", label: "East filler", x: 1, y: 0, territory: "cs.AI" },
      ],
    };
    const askButton = () => screen.getByRole("button", { name: "Ask AI" });
    const dialogue = () => screen.getByRole("region", { name: "Assistant" });
    const question = () => screen.getByRole("textbox", { name: "Assistant" });

    async function openAndAsk(text: string) {
      fireEvent.click(askButton());
      fireEvent.change(question(), { target: { value: text } });
      fireEvent.submit(question().closest("form") as HTMLFormElement);
    }

    it("paints the panel opaque so the legend behind it never shows through (2026-11-03 browser pass)", async () => {
      const { container } = await renderApp(ASSISTANT_SPEC);
      const panel = container.querySelector<HTMLElement>("[data-assistant-panel]");
      expect(panel?.style.background).toBe("var(--surface-solid)");
    });

    it("keeps the panel itself from scrolling, so only the answers do (2026-11-03 browser pass)", async () => {
      const { container } = await renderApp(ASSISTANT_SPEC);
      const panel = container.querySelector<HTMLElement>("[data-assistant-panel]");
      expect(panel?.style.overflowY).toBe("hidden");
    });

    it("starts collapsed: only the Ask AI button, nothing asked", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      expect(askButton().getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByRole("region", { name: "Assistant" })).toBeNull();
      expect(document.querySelector<HTMLElement>("[data-assistant-panel]")?.hidden).toBe(true);
    });

    it("opens the dialogue with the stand-in notice when Ask AI is pressed", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      fireEvent.click(askButton());
      expect(askButton().getAttribute("aria-pressed")).toBe("true");
      expect(within(dialogue()).getByText("Stand-in answers from your browser's search, not an AI.")).toBeTruthy();
      fireEvent.click(askButton());
      expect(screen.queryByRole("region", { name: "Assistant" })).toBeNull();
    });

    it("answers with the local search, highlights the cited items and frames them once", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      const before = screen.getByText(/\d+\.\d×/).textContent;
      await openAndAsk("graph");
      await screen.findByText(/Found 2 items/, {}, { timeout: 3000 });
      await waitFor(() => expect(screen.getByText(/\d+\.\d×/).textContent).not.toBe(before));
      expect(within(dialogue()).getByRole("button", { name: "Back to previous view" })).toBeTruthy();
      expect(within(dialogue()).getByRole("button", { name: "Graph matching" })).toBeTruthy();
    });

    it("Back to previous view restores the view the reader asked from", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      const before = screen.getByText(/\d+\.\d×/).textContent;
      await openAndAsk("graph");
      await screen.findByText(/Found 2 items/, {}, { timeout: 3000 });
      await waitFor(() => expect(screen.getByText(/\d+\.\d×/).textContent).not.toBe(before));
      fireEvent.click(within(dialogue()).getByRole("button", { name: "Back to previous view" }));
      await waitFor(() => expect(screen.getByText(/\d+\.\d×/).textContent).toBe(before));
      expect(within(dialogue()).queryByRole("button", { name: "Back to previous view" })).toBeNull();
    });

    it("selects a cited item when its button is pressed", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      await openAndAsk("graph");
      await screen.findByText(/Found 2 items/, {}, { timeout: 3000 });
      fireEvent.click(within(dialogue()).getByRole("button", { name: "Graph matching" }));
      expect(await screen.findByRole("dialog")).toBeTruthy();
    });

    it("clears the dialogue when the corpus changes", async () => {
      await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      await openAndAsk("graph");
      await screen.findByText(/Found 2 items/, {}, { timeout: 3000 });
      fireEvent.change(screen.getByLabelText("Corpus"), { target: { value: "elements" } });
      await waitFor(() => expect(screen.queryByText(/Found 2 items/)).toBeNull());
    });

    it("keeps the open dialogue in the floating-control overflow check", async () => {
      const { container } = await renderApp(ASSISTANT_SPEC);
      await screen.findByText(/1\.0×/);
      fireEvent.click(askButton());
      checkAllFloatingControls(container);
    });
  });
});
