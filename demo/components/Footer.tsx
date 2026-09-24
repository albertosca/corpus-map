import type { CSSProperties, ReactElement } from "react";
import type { CorpusId } from "../corpora";

interface FooterProps {
  corpusId: CorpusId;
}

// Exact strings (spec 4 §2, task-5-brief): no arXiv logo, and the corpus is
// labelled "Computer-science papers (arXiv metadata)" everywhere else in the
// shell -- never "arXiv map".
const DISCLOSURE: Partial<Record<CorpusId, string>> = {
  arxiv: "Thank you to arXiv for use of its open access interoperability.",
  synthetic: "Synthetic corpus, generated for scale testing.",
};

const style: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 12,
  transform: "translateX(-50%)",
  zIndex: 10,
  maxWidth: "92vw",
  textAlign: "center",
  whiteSpace: "normal",
  padding: "4px 14px",
  borderRadius: 4,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.10)",
  color: "#1a1d23",
  fontSize: 12,
};

/**
 * The disclosure line, bottom-centre (spec 4 §2): the arXiv attribution or
 * the synthetic-corpus notice, exactly. Nothing for a corpus that carries
 * neither (elements, constellations).
 */
export function Footer({ corpusId }: FooterProps): ReactElement | null {
  const text = DISCLOSURE[corpusId];
  if (!text) return null;
  return (
    <footer data-footer data-floating-control style={style}>
      {text}
    </footer>
  );
}
