import type { MapNode } from "corpus-map";
import type { CSSProperties, ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";

export interface DrawerProps {
  /** The selected node, or `null` when nothing is selected — renders nothing in that case. */
  node: MapNode | null;
  /** The selected node's territory's full name (`spec.territories[].name`), resolved by the caller. */
  territoryName: string | null;
  /** Whether the active corpus is arXiv — switches between the arXiv-specific layout and the generic meta list. */
  isArxiv: boolean;
  onClose: () => void;
  /** Focused when the drawer closes (close button or Escape) — the demo's map surface. */
  returnFocusTo: RefObject<HTMLElement | null>;
}

const ANIMATION_STYLE = `
@keyframes cm-drawer-slide-in {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: no-preference) {
  .cm-drawer-panel { animation: cm-drawer-slide-in 180ms ease-out; }
}
`;

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  // Real fit at 375px comes from the pairing of a viewport-relative `width`
  // (checked against 100 by the demo's overflow guard) with a `maxWidth` at
  // or under its 343px content ceiling (375px viewport minus two 16px
  // gutters) — never a bare pixel `width`, which the guard would reject
  // outright for any value over that ceiling.
  width: "90vw",
  maxWidth: 320,
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  overflowY: "auto",
  padding: "16px 18px",
  background: "#ffffff",
  borderLeft: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "-2px 0 10px rgba(0,0,0,0.08)",
  color: "#1a1d23",
  fontSize: 14,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.35,
};

const closeButtonStyle: CSSProperties = {
  flexShrink: 0,
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 13,
};

const metaLineStyle: CSSProperties = {
  margin: 0,
};

const linkStyle: CSSProperties = {
  color: "#0b5ed7",
};

const dlStyle: CSSProperties = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: 10,
  rowGap: 4,
};

const dtStyle: CSSProperties = {
  margin: 0,
  color: "#555b66",
};

const ddStyle: CSSProperties = {
  margin: 0,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every field on `meta` as a definition list — the format non-arXiv corpora get (elements, constellations, synthetic). */
function GenericMeta({ meta }: { meta: unknown }): ReactElement | null {
  if (!isPlainObject(meta)) return null;
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;
  return (
    <dl style={dlStyle}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: "contents" }}>
          <dt style={dtStyle}>{key}</dt>
          <dd style={ddStyle}>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ArxivMeta {
  year?: number;
  url?: string;
}

/** "Published <year>", the territory's full name, and the "Open on arXiv" link — the arXiv-specific layout. */
function ArxivMetaView({ node, territoryName }: { node: MapNode; territoryName: string | null }): ReactElement {
  const meta = node.meta as ArxivMeta | undefined;
  const year = typeof meta?.year === "number" ? meta.year : undefined;
  const url = typeof meta?.url === "string" ? meta.url : undefined;
  return (
    <>
      {year !== undefined ? <p style={metaLineStyle}>Published {year}</p> : null}
      {territoryName ? <p style={metaLineStyle}>{territoryName}</p> : null}
      {url ? (
        <p style={metaLineStyle}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Open on arXiv
          </a>
        </p>
      ) : null}
    </>
  );
}

/**
 * The selected item's drawer (showcase Task 6, spec 4 §2 "Selected-item
 * drawer"): slides in from the right on select, shows the node's label and
 * its `meta` — the arXiv-specific layout, or a generic definition list for
 * every other corpus — and closes on its own button or Escape, returning
 * focus to the map surface either way.
 *
 * Non-modal on purpose (`aria-modal="false"`): the drawer only occupies a
 * fixed strip on the right (never a full-screen backdrop), so the map
 * underneath stays reachable — wheel zoom, drag-pan, and the accessible
 * tree all keep working while it's open — and focus is never trapped inside
 * it. It sits above the zoom controls in z-order (spec 4 §2 "Visual
 * restraint" plus the showcase's own bottom-right zoom controls): while
 * open it can cover them, which is fine because the drawer always carries
 * its own close (button and Escape) — the coverage is never irreversible.
 */
export function Drawer({ node, territoryName, isArxiv, onClose, returnFocusTo }: DrawerProps): ReactElement | null {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // No `useCallback` here on purpose: this reads `returnFocusTo.current` —
  // a ref access the React Compiler's static analysis cannot reconcile
  // with a hand-written dependency array (it infers `returnFocusTo.current`
  // itself as the dependency, never the ref object), so memoizing this
  // manually just trades one failing check for another. A plain function
  // costs one extra render of an effect teardown/setup, never a bug.
  const close = () => {
    returnFocusTo.current?.focus();
    onClose();
  };

  useEffect(() => {
    if (!node) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      returnFocusTo.current?.focus();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [node, onClose, returnFocusTo]);

  if (!node) return null;

  let body: ReactNode;
  if (isArxiv) {
    body = <ArxivMetaView node={node} territoryName={territoryName} />;
  } else {
    body = (
      <>
        {territoryName ? <p style={metaLineStyle}>{territoryName}</p> : null}
        <GenericMeta meta={node.meta} />
      </>
    );
  }

  return (
    <>
      <style>{ANIMATION_STYLE}</style>
      <aside
        data-drawer
        data-floating-control
        className="cm-drawer-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        style={panelStyle}
      >
        <div style={headerRowStyle}>
          <h2 id={titleId} style={titleStyle}>
            {node.label}
          </h2>
          <button type="button" ref={closeButtonRef} onClick={close} style={closeButtonStyle}>
            Close
          </button>
        </div>
        {body}
      </aside>
    </>
  );
}
