import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { GalleryEntry } from "../corpora";

interface TopBarProps {
  corpora: GalleryEntry[];
  activeId: GalleryEntry["id"];
  onChange: (id: GalleryEntry["id"]) => void;
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

/**
 * The demo's full-window top bar (spec 4 §2): the library name and a native
 * `<select>` that switches the active corpus. Plain and legible — no icons,
 * no eyebrow label — the map underneath is the only bold element.
 */
export function TopBar({ corpora, activeId, onChange }: TopBarProps): ReactElement {
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
    </header>
  );
}
