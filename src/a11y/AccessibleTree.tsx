import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { RelatedItem } from "../edges/related";
import type { Regime } from "../lod/lod";
import { visibleNodes } from "../lod/visible";
import { leafTerritories, type MapNode, type MapSpec, type Territory } from "../shared/spec";
import { DEFAULT_THEME, type Theme } from "../shared/theme";
import type { TerritoryGroup } from "../territories/groups";
import type { Viewport } from "../viewport/viewport";
import type { HeadingTag } from "./headingLevel";

export interface AccessibleTreeProps {
  spec: MapSpec;
  regime: Regime;
  viewport: Viewport;
  width: number;
  height: number;
  cap: number;
  /** The scene's territory groups; headings appear only when there are some (spec slice B §5). */
  groups?: readonly TerritoryGroup[] | undefined;
  /** Dimmed territory ids: left out of the tree. */
  hidden?: ReadonlySet<string> | undefined;
  heading?: HeadingTag | undefined;
  theme?: Pick<Theme, "cardBackground" | "territoryLabel" | "focusOutline" | "focusOutlineWidth"> | undefined;
  onFocusTerritory?: ((territory: Territory) => void) | undefined;
  onSelect?: ((node: MapNode) => void) | undefined;
  /** The selected item's id; its button carries `aria-current="true"` (spec slice C §5). */
  selectedId?: string | null | undefined;
  onOverview?: (() => void) | undefined;
  onUnassigned?: (() => void) | undefined;
  /** Called when a focused control unmounted and the new tree has none to take its place. */
  onFocusFallback?: (() => void) | undefined;
  /** Reports the id of the territory whose button gains keyboard focus, and `null` when it loses it. */
  onTerritoryFocusChange?: ((id: string | null) => void) | undefined;
  /** Reports the id of the item whose button gains keyboard focus (near regime), and `null` when it loses it. */
  onNodeFocusChange?: ((id: string | null) => void) | undefined;
  /** The ids a search found; an item's button in it is described as a match (spec search §5). */
  matches?: ReadonlySet<string> | undefined;
  /** The selected item's live related items, listed at mid and near (spec slice E §6). */
  related?: readonly RelatedItem[] | undefined;
  /** Called when a related item's button is pressed. */
  onRelated?: ((node: MapNode) => void) | undefined;
}

const UNASSIGNED = "Unassigned";
const NO_GROUPS: readonly TerritoryGroup[] = [];
const NOTHING_HIDDEN: ReadonlySet<string> = new Set();
const NO_RELATED: readonly RelatedItem[] = [];

// One string per regime, so a far→mid change is announced too — the tree's
// items do not change between those two, only what the canvas shows.
const ANNOUNCEMENT: Record<Regime, string> = {
  far: "Showing territories",
  mid: "Showing territories and points",
  near: "Showing individual items",
};

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

/** "1 item", "N items": the corpus-agnostic count the tree and the territory balloon share. */
export function itemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/**
 * The canvas is decorative; this is the content (spec slice B §5). It
 * mirrors the regime: at far and mid, territory buttons under their group
 * headings, then "Unassigned"; at near, "Back to overview" and the on-screen
 * items under their territory's heading, capped at `cap` overall — the
 * bound `CardOverlay` uses, so ten thousand items never make ten thousand
 * elements. Everything is visually hidden except the two controls with no
 * shape on the canvas, which show in the corner while focused.
 */
export function AccessibleTree(properties: AccessibleTreeProps): ReactElement {
  const { spec, regime, viewport, width, height, cap, onFocusTerritory, onSelect, selectedId } = properties;
  const groups = properties.groups ?? NO_GROUPS;
  const hidden = properties.hidden ?? NOTHING_HIDDEN;
  const Heading = properties.heading ?? "h3";
  const theme = properties.theme ?? DEFAULT_THEME;
  const loose = spec.nodes.filter((node) => node.territory === null);
  const related = properties.related ?? NO_RELATED;
  const relatedHeadingId = useId();
  const selectedNode = selectedId == null ? undefined : spec.nodes.find((node) => node.id === selectedId);
  // Its own section: the item buttons exist only at near and only on screen,
  // and a related item is usually neither (spec slice E §6).
  const showRelated = (regime === "mid" || regime === "near") && related.length > 0 && selectedNode !== undefined;

  // The buttons are visually hidden, so `CorpusMap` draws their focus on the
  // canvas; it learns which one from focus/blur here. A focused button that
  // unmounts (the regime changed, or its item left the listed set) fires no
  // blur, so after every render a reported focus that is no longer inside
  // this tree is withdrawn too — otherwise a stale highlight would stay drawn.
  const rootReference = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  // The element last focused inside the tree, and a selector for the control
  // last opened (a territory, or "Unassigned"): the focus-restore rule (spec
  // slice B §5, amended) acts only when that element left the document and
  // focus fell to `body`.
  const lastFocused = useRef<HTMLElement | null>(null);
  const lastOpened = useRef<string | null>(null);
  const [focusedControl, setFocusedControl] = useState<"overview" | "unassigned" | null>(null);
  // A related item usually has no on-screen shape for the canvas to ring, so
  // its button shows itself while focused, like the two controls.
  const [focusedRelated, setFocusedRelated] = useState<string | null>(null);

  useEffect(() => {
    const root = rootReference.current;
    const previous = lastFocused.current;
    if (reported.current && !root?.contains(document.activeElement)) {
      reported.current = false;
      properties.onTerritoryFocusChange?.(null);
      properties.onNodeFocusChange?.(null);
    }
    if (previous !== null && !previous.isConnected && document.activeElement === document.body && root) {
      lastFocused.current = null;
      // The withdrawal above runs first, so a restore onto a control with no
      // canvas shape leaves no stale highlight; a restored territory button
      // reports itself again from its own `onFocus`.
      const target =
        root.querySelector<HTMLElement>("[data-tree-overview]") ??
        (lastOpened.current === null ? null : root.querySelector<HTMLElement>(lastOpened.current)) ??
        root.querySelector<HTMLElement>("button");
      if (target) target.focus();
      else properties.onFocusFallback?.();
    }
  });

  const remember = (element: HTMLElement) => {
    lastFocused.current = element;
  };
  const forget = (element: HTMLElement, relatedTarget: EventTarget | null) => {
    // Focus moving elsewhere inside the tree keeps the rule armed via the next `remember`.
    if (relatedTarget instanceof Node && rootReference.current?.contains(relatedTarget)) return;
    if (relatedTarget !== null) {
      lastFocused.current = null;
      return;
    }
    // No related target: either the element is being unmounted (the rule's
    // case) or the reader clicked plain page content (focus to `body`, the
    // element still mounted). Tell them apart once the current commit is over.
    queueMicrotask(() => {
      if (element.isConnected && lastFocused.current === element) lastFocused.current = null;
    });
  };
  const territoryFocus = (id: string | null) => {
    reported.current = id !== null;
    properties.onTerritoryFocusChange?.(id);
  };
  const nodeFocus = (id: string | null) => {
    reported.current = id !== null;
    properties.onNodeFocusChange?.(id);
  };

  const focusedStyle = (focused: boolean) =>
    focused
      ? {
          position: "absolute" as const,
          left: 8,
          top: 8,
          zIndex: 3,
          padding: "4px 8px",
          minHeight: 24,
          font: "13px system-ui, sans-serif",
          background: theme.cardBackground,
          color: theme.territoryLabel,
          border: "none",
          borderRadius: 4,
          outline: `${theme.focusOutlineWidth}px solid ${theme.focusOutline}`,
        }
      : VISUALLY_HIDDEN;
  const controlStyle = (control: "overview" | "unassigned") => focusedStyle(focusedControl === control);

  const territoryButton = (territory: Territory) => (
    <li key={territory.id}>
      <button
        type="button"
        data-tree-territory={territory.id}
        onClick={() => {
          lastOpened.current = `[data-tree-territory="${CSS.escape(territory.id)}"]`;
          onFocusTerritory?.(territory);
        }}
        onFocus={(event) => {
          remember(event.currentTarget);
          territoryFocus(territory.id);
        }}
        onBlur={(event) => {
          forget(event.currentTarget, event.relatedTarget);
          territoryFocus(null);
        }}
      >
        {`${territory.name}, ${itemCount(territory.members.length)}`}
      </button>
    </li>
  );

  const nodeButton = (node: MapNode) => (
    <li key={node.id}>
      <button
        type="button"
        aria-current={node.id === selectedId ? "true" : undefined}
        aria-description={properties.matches?.has(node.id) ? "match" : undefined}
        onClick={() => onSelect?.(node)}
        onFocus={(event) => {
          remember(event.currentTarget);
          nodeFocus(node.id);
        }}
        onBlur={(event) => {
          forget(event.currentTarget, event.relatedTarget);
          nodeFocus(null);
        }}
      >
        {node.label}
      </button>
    </li>
  );

  const control = (kind: "overview" | "unassigned", text: string, onClick: (() => void) | undefined) => (
    <button
      type="button"
      data-tree-overview={kind === "overview" ? "" : undefined}
      data-tree-unassigned={kind === "unassigned" ? "" : undefined}
      style={controlStyle(kind)}
      onClick={() => {
        if (kind === "unassigned") lastOpened.current = "[data-tree-unassigned]";
        onClick?.();
      }}
      onFocus={(event) => {
        remember(event.currentTarget);
        setFocusedControl(kind);
      }}
      onBlur={(event) => {
        forget(event.currentTarget, event.relatedTarget);
        setFocusedControl(null);
      }}
    >
      {text}
    </button>
  );

  const shown = leafTerritories(spec).filter((territory) => !hidden.has(territory.id));
  let content: ReactElement;
  if (regime === "near") {
    const nodes = visibleNodes(spec, viewport, width, height, cap);
    const byTerritory = new Map<string | null, MapNode[]>();
    for (const node of nodes) {
      const list = byTerritory.get(node.territory) ?? [];
      list.push(node);
      byTerritory.set(node.territory, list);
    }
    // Group order, as the far tree and the legend list them; a territory in
    // no group follows, in spec order (`sort` is stable).
    const rank = new Map(groups.flatMap((group) => group.members).map((id, index) => [id, index] as const));
    const ordered = [...shown].sort(
      (first, second) =>
        (rank.get(first.id) ?? Number.POSITIVE_INFINITY) - (rank.get(second.id) ?? Number.POSITIVE_INFINITY),
    );
    const sections = [
      ...ordered.map((territory) => ({
        key: territory.id,
        name: territory.name,
        nodes: byTerritory.get(territory.id),
      })),
      { key: "unassigned", name: UNASSIGNED, nodes: byTerritory.get(null) },
    ].filter((section) => section.nodes !== undefined);
    content = (
      <>
        {control("overview", "Back to overview", properties.onOverview)}
        {sections.map((section) => (
          <div key={section.key} style={VISUALLY_HIDDEN}>
            <Heading>{section.name}</Heading>
            <ul>{section.nodes?.map(nodeButton)}</ul>
          </div>
        ))}
      </>
    );
  } else {
    const byId = new Map(shown.map((territory) => [territory.id, territory] as const));
    const headed = groups
      .map((group) => ({
        group,
        members: group.members.flatMap((id) => {
          const territory = byId.get(id);
          return territory ? [territory] : [];
        }),
      }))
      .filter((entry) => entry.members.length > 0);
    content = (
      <>
        {groups.length === 0 ? (
          <ul style={VISUALLY_HIDDEN}>{shown.map(territoryButton)}</ul>
        ) : (
          headed.map(({ group, members }) => (
            <div key={group.id} style={VISUALLY_HIDDEN}>
              <Heading>{group.name}</Heading>
              <ul>{members.map(territoryButton)}</ul>
            </div>
          ))
        )}
        {loose.length > 0
          ? control("unassigned", `${UNASSIGNED}, ${itemCount(loose.length)}`, properties.onUnassigned)
          : null}
      </>
    );
  }

  return (
    <div
      ref={rootReference}
      data-accessible-tree=""
      style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
    >
      <div role="status" aria-live="polite" data-announcement="regime" style={VISUALLY_HIDDEN}>
        {ANNOUNCEMENT[regime]}
      </div>
      {/* A second region, so the related count never replaces the regime announcement. */}
      <div role="status" aria-live="polite" data-announcement="related" style={VISUALLY_HIDDEN}>
        {/* Keyed on the selection, so a new item with the same count still changes the region and is spoken. */}
        {showRelated ? <span key={selectedNode.id}>{`${related.length} related`}</span> : null}
      </div>
      {content}
      {showRelated ? (
        <div>
          <Heading id={relatedHeadingId} style={VISUALLY_HIDDEN}>{`Related to ${selectedNode.label}`}</Heading>
          <ul aria-labelledby={relatedHeadingId} style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {related.map((item) => (
              <li key={item.node.id}>
                <button
                  type="button"
                  data-tree-related={item.node.id}
                  style={focusedStyle(focusedRelated === item.node.id)}
                  onClick={() => properties.onRelated?.(item.node)}
                  onFocus={(event) => {
                    remember(event.currentTarget);
                    setFocusedRelated(item.node.id);
                  }}
                  onBlur={(event) => {
                    forget(event.currentTarget, event.relatedTarget);
                    setFocusedRelated(null);
                  }}
                >
                  {item.reason === undefined ? item.node.label : `${item.node.label} — ${item.reason}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
