import type { CSSProperties, ReactElement } from "react";
import type { CorpusId } from "../corpora";
import { token } from "../tokens";
import {
  BOTTOM_LEFT_COLUMN_WIDTH,
  BOTTOM_ROW_HEIGHT,
  FOOTER_MAXIMUM_WIDTH,
  FOOTER_MINIMUM_BAND_WIDTH,
  GUTTER,
} from "./floatingLayout";
import { useViewportWidth } from "./narrow";
import { BUTTON_WIDTH, zoomControlsRight } from "./ZoomControls";

interface FooterProps {
  corpusId: CorpusId;
  /** Whether the drawer or the tuning panel is open — it decides where the zoom controls sit, and the footer keeps clear of them. */
  drawerOpen?: boolean | undefined;
  /** In flow inside the narrow window's bottom strip (spec mobile §6): no position, box or chip of its own. */
  inline?: boolean | undefined;
}

// Exact strings (spec 4 §2, task-5-brief): no arXiv logo, and the corpus is
// labelled "Computer-science papers (arXiv metadata)" everywhere else in the
// shell -- never "arXiv map".
const DISCLOSURE: Partial<Record<CorpusId, string>> = {
  arxiv: "Thank you to arXiv for use of its open access interoperability.",
  synthetic: "Synthetic corpus, generated for scale testing.",
};

/** The footer's declared band: `left`/`right`/`bottom` offsets in px. */
export interface FooterPlacement {
  left: number;
  right: number;
  bottom: number;
  lifted: boolean;
}

/**
 * Where the footer sits (2026-09-25 browser review, B9 — the old centred
 * footer covered the minimap at 375-600px and Fit at 768px with the drawer
 * open). The rule: in the bottom row, between the bottom-left column
 * (minimap + indicator) and the zoom controls in whichever position they are
 * in, when that band is at least `FOOTER_MINIMUM_BAND_WIDTH` wide; otherwise
 * lifted one gutter above the whole bottom row, from the left gutter to the
 * zoom controls' right edge. Either way the band clears every other bottom
 * control by construction, from the same constants they are placed with.
 */
export function footerPlacement(viewportWidth: number, drawerOpen: boolean): FooterPlacement {
  const zoomRight = zoomControlsRight(viewportWidth, drawerOpen);
  const left = BOTTOM_LEFT_COLUMN_WIDTH + GUTTER;
  const right = zoomRight + BUTTON_WIDTH + GUTTER;
  if (viewportWidth - left - right >= FOOTER_MINIMUM_BAND_WIDTH) {
    return { left, right, bottom: GUTTER, lifted: false };
  }
  return { left: GUTTER, right: zoomRight, bottom: BOTTOM_ROW_HEIGHT + GUTTER, lifted: true };
}

const style: CSSProperties = {
  position: "fixed",
  zIndex: 10,
  // With `left` and `right` both set, `maxWidth` caps the chip and the auto
  // margins centre it inside the band (CSS 2.1 §10.3.7); the text wraps.
  maxWidth: FOOTER_MAXIMUM_WIDTH,
  marginLeft: "auto",
  marginRight: "auto",
  textAlign: "center",
  whiteSpace: "normal",
  padding: "4px 14px",
  borderRadius: 4,
  background: token("surface"),
  border: `1px solid ${token("border")}`,
  color: token("text"),
  fontSize: 12,
};

/** Takes the strip's room left of the indicator and wraps there; the strip carries the text size and the surface. */
const inlineStyle: CSSProperties = {
  flex: "1 1 0",
  minWidth: 0,
  whiteSpace: "normal",
};

/**
 * The disclosure line (spec 4 §2): the arXiv attribution or the
 * synthetic-corpus notice, exactly. Nothing for a corpus that carries
 * neither (elements, constellations). Placed by `footerPlacement`.
 */
export function Footer({ corpusId, drawerOpen = false, inline = false }: FooterProps): ReactElement | null {
  const viewportWidth = useViewportWidth();
  const text = DISCLOSURE[corpusId];
  if (!text) return null;
  if (inline) {
    return (
      <footer data-footer style={inlineStyle}>
        {text}
      </footer>
    );
  }
  const { left, right, bottom, lifted } = footerPlacement(viewportWidth, drawerOpen);
  return (
    <footer
      data-footer
      data-floating-control
      data-footer-lifted={lifted ? "" : undefined}
      style={{ ...style, left, right, bottom }}
    >
      {text}
    </footer>
  );
}
