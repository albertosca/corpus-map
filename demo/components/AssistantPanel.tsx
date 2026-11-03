import type { MapSpec } from "corpus-map";
import { AssistantBox } from "corpus-map/assistant";
import type { CSSProperties, ReactElement } from "react";
import { useMemo } from "react";
import { STAND_IN_NOTICE, standInAdapter } from "../assistant/standIn";
import { token } from "../tokens";
import { ASSISTANT_PANEL_BOTTOM, ASSISTANT_PANEL_WIDTH, assistantPanelHeight, GUTTER } from "./floatingLayout";
import { TOUCH_TARGET_SIZE } from "./narrow";

type BoxProps = Parameters<typeof AssistantBox>[0];

interface AssistantPanelProps {
  /** Closed, the panel stays mounted but hidden, so the dialogue survives a collapse. */
  open: boolean;
  narrow: boolean;
  /** The measured top bar height: the narrow sheet starts below it. */
  topInset: number;
  windowHeight: number;
  spec: MapSpec;
  selectedId: string | null;
  view: BoxProps["view"];
  onMatches: BoxProps["onMatches"];
  onReveal: BoxProps["onReveal"];
  onRestore: BoxProps["onRestore"];
  onSelect: BoxProps["onSelect"];
  onClose: () => void;
}

const panelStyle: CSSProperties = {
  position: "fixed",
  zIndex: 10,
  boxSizing: "border-box",
  overflowY: "hidden",
  padding: 12,
  background: token("surfaceSolid"),
  border: `1px solid ${token("border")}`,
  borderRadius: 6,
  boxShadow: `0 2px 10px ${token("shadow")}`,
  color: token("text"),
  fontSize: 13,
};

/**
 * The demo's dialogue (spec assistant §7): the library's `AssistantBox` in a
 * floating panel, answered by the local stand-in. Opt-in: the top bar's
 * "Ask AI" opens it, and it says in its own notice that the answers are not
 * from an AI.
 */
export function AssistantPanel(properties: AssistantPanelProps): ReactElement {
  const { open, narrow, topInset, windowHeight, spec, onClose, ...box } = properties;
  const ask = useMemo(() => standInAdapter(spec), [spec]);
  const placement: CSSProperties = narrow
    ? { top: topInset + GUTTER, left: GUTTER, right: GUTTER, maxWidth: "100vw" }
    : { bottom: ASSISTANT_PANEL_BOTTOM, left: GUTTER, width: ASSISTANT_PANEL_WIDTH, maxWidth: "90vw" };
  return (
    <div
      data-assistant-panel
      data-floating-control
      hidden={!open}
      style={{
        ...panelStyle,
        ...placement,
        maxHeight: assistantPanelHeight(windowHeight, narrow),
        display: open ? "flex" : "none",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <AssistantBox
        style={{ flex: "1 1 auto", minHeight: 0 }}
        spec={spec}
        ask={ask}
        notice={STAND_IN_NOTICE}
        touchTargets={narrow}
        selectedId={box.selectedId}
        view={box.view}
        onMatches={box.onMatches}
        onReveal={box.onReveal}
        onRestore={box.onRestore}
        onSelect={box.onSelect}
      />
      <button
        type="button"
        onClick={onClose}
        style={{
          alignSelf: "flex-start",
          flexShrink: 0,
          maxWidth: "100%",
          font: "inherit",
          color: "inherit",
          background: "transparent",
          border: `1px solid ${token("borderStrong")}`,
          borderRadius: 6,
          padding: "4px 8px",
          ...(narrow ? { minHeight: TOUCH_TARGET_SIZE, minWidth: TOUCH_TARGET_SIZE } : {}),
        }}
      >
        Close assistant
      </button>
    </div>
  );
}
