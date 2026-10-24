import type { ChangeEvent, CSSProperties, ReactElement, Ref } from "react";
import type { GalleryEntry } from "../corpora";
import { token } from "../tokens";

interface TopBarProps {
  corpora: GalleryEntry[];
  activeId: GalleryEntry["id"];
  onChange: (id: GalleryEntry["id"]) => void;
  /** Whether the hidden tuning panel (showcase Task 7) is currently open. */
  tuningOpen: boolean;
  onToggleTuning: () => void;
  /** React 19 ref-as-prop, so `App` can return focus here when the tuning panel closes (`TuningPanel`'s own `returnFocusTo`). */
  gearButtonRef?: Ref<HTMLButtonElement> | undefined;
  /** The bar itself, so `App` can measure its height (it wraps on a narrow screen) and start the right-side sheets below it. */
  barRef?: Ref<HTMLElement> | undefined;
  /** Copies the page URL, which carries the corpus, view and selection (spec slice C §6). */
  onCopyLink: () => void;
  /** What the last Copy link did, announced in a status region; null says nothing. */
  linkStatus: LinkStatus;
}

export type LinkStatus = "copied" | "failed" | null;

const LINK_STATUS_TEXT = { copied: "Link copied", failed: "Copy failed: use the address bar" } as const;

const barStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  // Explicit alongside `left`/`right`: the two offsets already fix this to
  // the viewport's width, but `App.test.tsx`'s overflow check reads an
  // explicit `width`/`maxWidth`. It does not bound the controls inside:
  // each of them carries its own `maxWidth` (see `gearButtonStyle`).
  maxWidth: "100vw",
  zIndex: 10,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 12px",
  padding: "10px 16px",
  background: token("surface"),
  borderBottom: `1px solid ${token("border")}`,
  color: token("text"),
};

const labelStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 13,
};

const selectStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  border: `1px solid ${token("borderStrong")}`,
  background: token("surfaceSolid"),
  color: "inherit",
  maxWidth: "70vw",
};

const statusStyle: CSSProperties = {
  fontSize: 13,
};

const gearButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: `1px solid ${token("borderStrong")}`,
  background: token("surface"),
  color: token("text"),
  fontSize: 13,
  // Real containment (Task 7 fix round 2), not the container's own
  // `maxWidth` alone: `barStyle`'s `flexWrap: "wrap"` only wraps a line of
  // items onto a new row once their combined width exceeds the container
  // -- it does not shrink or clip a single item that is itself wider than
  // the container. A percentage `maxWidth` resolves against the
  // containing block, so this genuinely caps the button's own width at
  // the top bar's, unlike the false claim fix round 1 made.
  maxWidth: "100%",
};

/**
 * The demo's full-window top bar (spec 4 §2): the library name, a native
 * `<select>` that switches the active corpus, and the "Tuning" gear button
 * (showcase Task 7) that opens the hidden tuning panel. Plain and legible —
 * no icons, no eyebrow label — the map underneath is the only bold element.
 *
 * The gear button lives inside this header's own row, not as a separate
 * floating control: `App.test.tsx`'s pairwise collision sweep already
 * treats the whole top bar as one full-width box (`topBarBox`), so a new
 * control placed anywhere near the top would genuinely overlap it — nesting
 * inside is what keeps it collision-free by construction, the same reason
 * the corpus `<select>` lives here rather than as its own floating box.
 */
export function TopBar({
  corpora,
  activeId,
  onChange,
  tuningOpen,
  onToggleTuning,
  gearButtonRef: gearButtonReference,
  barRef: barReference,
  onCopyLink,
  linkStatus,
}: TopBarProps): ReactElement {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as GalleryEntry["id"]);
  };

  return (
    <header ref={barReference} data-topbar data-floating-control style={barStyle}>
      <h1 style={{ fontSize: 15, margin: 0 }}>corpus-map</h1>
      <label htmlFor="corpus-select" style={labelStyle}>
        Corpus
      </label>
      <select id="corpus-select" value={activeId} onChange={handleChange} style={selectStyle}>
        {corpora.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        ref={gearButtonReference}
        aria-pressed={tuningOpen}
        onClick={onToggleTuning}
        style={gearButtonStyle}
      >
        Tuning
      </button>
      <button type="button" onClick={onCopyLink} style={gearButtonStyle}>
        Copy link
      </button>
      <span role="status" style={statusStyle}>
        {linkStatus === null ? "" : LINK_STATUS_TEXT[linkStatus]}
      </span>
    </header>
  );
}
