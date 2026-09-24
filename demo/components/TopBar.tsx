import type { ChangeEvent, CSSProperties, ReactElement, Ref } from "react";
import type { GalleryEntry } from "../corpora";

interface TopBarProps {
  corpora: GalleryEntry[];
  activeId: GalleryEntry["id"];
  onChange: (id: GalleryEntry["id"]) => void;
  /** Whether the hidden tuning panel (showcase Task 7) is currently open. */
  tuningOpen: boolean;
  onToggleTuning: () => void;
  /** React 19 ref-as-prop, so `App` can return focus here when the tuning panel closes (`TuningPanel`'s own `returnFocusTo`). */
  gearButtonRef?: Ref<HTMLButtonElement> | undefined;
}

const barStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 12px",
  padding: "10px 16px",
  background: "rgba(255,255,255,0.92)",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  color: "#1a1d23",
};

const labelStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 13,
};

const selectStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "#ffffff",
  color: "inherit",
  maxWidth: "70vw",
};

const gearButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 13,
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
  gearButtonRef,
}: TopBarProps): ReactElement {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as GalleryEntry["id"]);
  };

  return (
    <header data-topbar data-floating-control style={barStyle}>
      <strong style={{ fontSize: 15 }}>corpus-map</strong>
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
        ref={gearButtonRef}
        aria-pressed={tuningOpen}
        onClick={onToggleTuning}
        style={gearButtonStyle}
      >
        Tuning
      </button>
    </header>
  );
}
