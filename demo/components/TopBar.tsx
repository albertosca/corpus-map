import type { MapSpec } from "corpus-map";
import { SearchBox } from "corpus-map/search";
import type { ChangeEvent, CSSProperties, ReactElement, Ref } from "react";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import type { GalleryEntry } from "../corpora";
import { token } from "../tokens";
import { TOUCH_TARGET_SIZE } from "./narrow";

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
  /** A narrow window (spec mobile §6): one row, the corpus select stretching, Tuning and Copy link behind a Menu. */
  narrow?: boolean | undefined;
  /** The dialogue's toggle (spec assistant §7); absent draws none. */
  assistant?: { open: boolean; onToggle: () => void } | undefined;
  /** The search beside the corpus select (spec search §6); absent draws none. `spec` is what it searches, `onMatches` takes the found ids, `onShow` fits the view around them. */
  search?:
    | {
        spec: MapSpec;
        onMatches: (ids: readonly string[] | null) => void;
        onShow: () => void;
      }
    | undefined;
}

/** Where the search runs, read by the input as its description. */
const SEARCH_HINT = "Searches titles and details in your browser";

/** The popover's id, which the Menu button's `aria-controls` names. */
const MENU_ID = "top-bar-menu";

/** Off screen but read: the narrow bar keeps the page's h1 and the select's label for assistive technology. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

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

// The status is the item that pushes the controls right: as its text appears
// it grows into the free space on its left, so Copy link stays under the
// pointer that just clicked it.
const statusStyle: CSSProperties = {
  marginLeft: "auto",
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

// One row, so a result never makes the bar taller (the map below would move).
const searchStyle: CSSProperties = { flex: "1 1 320px", maxWidth: 480, flexWrap: "nowrap" };

const narrowSearchStyle: CSSProperties = { flex: "2 1 0%", minWidth: 0 };

const narrowBarStyle: CSSProperties = { ...barStyle, flexWrap: "nowrap", padding: "6px 12px" };

const narrowSelectStyle: CSSProperties = {
  ...selectStyle,
  flex: "1 1 0%",
  minWidth: 0,
  maxWidth: "100%",
  minHeight: TOUCH_TARGET_SIZE,
};

const menuButtonStyle: CSSProperties = {
  ...gearButtonStyle,
  flexShrink: 0,
  minWidth: TOUCH_TARGET_SIZE,
  minHeight: TOUCH_TARGET_SIZE,
};

/** Below the bar on the right, under the Menu button that opens it. */
const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 12,
  marginTop: 4,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  maxWidth: "calc(100vw - 24px)",
  background: token("surfaceSolid"),
  border: `1px solid ${token("border")}`,
  borderRadius: 6,
  boxShadow: `0 2px 10px ${token("shadow")}`,
};

const menuItemStyle: CSSProperties = { ...gearButtonStyle, minHeight: TOUCH_TARGET_SIZE, textAlign: "left" };

/**
 * The narrow bar has no room for the status in its row, so it shows under the
 * bar on the right, where the Menu that copied the link sits; empty, it is
 * an empty, unpadded box that draws nothing.
 */
const narrowStatusStyle = (filled: boolean): CSSProperties => ({
  position: "absolute",
  top: "100%",
  right: 12,
  marginTop: 4,
  fontSize: 13,
  ...(filled
    ? {
        padding: "6px 10px",
        background: token("surfaceSolid"),
        border: `1px solid ${token("border")}`,
        borderRadius: 6,
      }
    : {}),
});

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
  narrow = false,
  search,
  assistant,
}: TopBarProps): ReactElement {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as GalleryEntry["id"]);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  // A menu left open when the window widens does not come back open when it narrows again.
  if (!narrow && menuOpen) setMenuOpen(false);
  const menuButtonReference = useRef<HTMLButtonElement>(null);
  const popoverReference = useRef<HTMLDivElement>(null);
  // On a narrow window the Menu stands in for the Tuning button, so `App`'s
  // ref (focus returns there when the tuning panel closes) points at it. The
  // handle is set again whenever the ref argument changes, so no deps are needed.
  useImperativeHandle(
    narrow ? gearButtonReference : undefined,
    () => menuButtonReference.current as HTMLButtonElement,
    [],
  );
  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonReference.current?.focus();
  };
  // A press anywhere outside the Menu and its popover closes it, and so does
  // an Escape wherever focus is (Safari does not focus a button on click).
  // The Escape is caught on the window's capture phase so it is the menu's
  // alone: the drawer listens for Escape on the document and must not close too.
  const onOutsidePress = useEffectEvent(closeMenu);
  const listening = narrow && menuOpen;
  useEffect(() => {
    if (!listening) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (popoverReference.current?.contains(target) || menuButtonReference.current?.contains(target)) return;
      onOutsidePress();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOutsidePress();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [listening]);

  if (narrow) {
    const statusText = linkStatus === null ? "" : LINK_STATUS_TEXT[linkStatus];
    return (
      <header ref={barReference} data-topbar data-floating-control style={narrowBarStyle}>
        <h1 style={{ ...VISUALLY_HIDDEN, fontSize: 15, margin: 0 }}>corpus-map</h1>
        <label htmlFor="corpus-select" style={{ ...labelStyle, ...VISUALLY_HIDDEN }}>
          Corpus
        </label>
        <select id="corpus-select" value={activeId} onChange={handleChange} style={narrowSelectStyle}>
          {corpora.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        {search ? (
          <SearchBox
            spec={search.spec}
            onMatches={search.onMatches}
            onShow={search.onShow}
            hint={SEARCH_HINT}
            touchTargets
            style={narrowSearchStyle}
          />
        ) : null}
        <button
          type="button"
          ref={menuButtonReference}
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          onClick={() => setMenuOpen((open) => !open)}
          style={menuButtonStyle}
        >
          Menu
        </button>
        <span role="status" style={narrowStatusStyle(statusText !== "")}>
          {statusText}
        </span>
        <div
          id={MENU_ID}
          ref={popoverReference}
          hidden={!menuOpen}
          style={menuOpen ? popoverStyle : { ...popoverStyle, display: "none" }}
        >
          {assistant ? (
            <button
              type="button"
              aria-pressed={assistant.open}
              onClick={() => {
                setMenuOpen(false);
                assistant.onToggle();
              }}
              style={menuItemStyle}
            >
              Ask AI
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={tuningOpen}
            onClick={() => {
              setMenuOpen(false);
              onToggleTuning();
            }}
            style={menuItemStyle}
          >
            Tuning
          </button>
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onCopyLink();
            }}
            style={menuItemStyle}
          >
            Copy link
          </button>
        </div>
      </header>
    );
  }

  return (
    <header ref={barReference} data-topbar data-floating-control style={barStyle}>
      <h1 style={{ fontSize: 15, margin: 0 }}>corpus-map</h1>
      <span role="status" style={statusStyle}>
        {linkStatus === null ? "" : LINK_STATUS_TEXT[linkStatus]}
      </span>
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
      {search ? (
        <SearchBox
          spec={search.spec}
          onMatches={search.onMatches}
          onShow={search.onShow}
          hint={SEARCH_HINT}
          style={searchStyle}
        />
      ) : null}
      {assistant ? (
        <button
          type="button"
          data-assistant-toggle
          aria-pressed={assistant.open}
          onClick={assistant.onToggle}
          style={gearButtonStyle}
        >
          Ask AI
        </button>
      ) : null}
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
    </header>
  );
}
