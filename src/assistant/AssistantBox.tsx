import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MapSpec } from "../shared/spec";
import type { MapViewport } from "../viewport/publicViewport";

/** What the consumer's assistant is asked (spec assistant §3). */
export interface AssistantRequest {
  question: string;
  /** The selected item when the spec knows it, else `null`. */
  selectedId: string | null;
  /** The turns of this session so far, oldest first. */
  history: readonly AssistantTurn[];
}

/** One question and its answer, as the box keeps and sends them. */
export interface AssistantTurn {
  question: string;
  answer: string;
  /** The cited items the spec knows, deduplicated, in the answer's order. */
  ids: readonly string[];
}

/** A whole answer: no streaming in the contract. */
export interface AssistantAnswer {
  text: string;
  /** The cited items; ids the spec does not know are dropped. */
  ids: readonly string[];
}

/** The consumer's AI: aborts `signal` when the reader asks again, clears the dialogue or the spec changes. */
export type AssistantAdapter = (request: AssistantRequest, signal: AbortSignal) => Promise<AssistantAnswer>;

export interface AssistantBoxProps {
  /** The corpus the answers cite; a new spec object clears the dialogue. */
  spec: MapSpec;
  /** The consumer's AI. */
  ask: AssistantAdapter;
  /** The selected item: sent with every question, so "what is this?" can mean it. */
  selectedId: string | null;
  /** The consumer's current view (what `onViewportChange` reported), or `undefined` when it does not track one. */
  view: MapViewport | undefined;
  /** The items to highlight: pass it to `CorpusMap`'s `matches`; `null` when the answer cites none. */
  onMatches: (ids: readonly string[] | null) => void;
  /** Frame these items, once per answer (pair with `CorpusMapHandle.revealAll`). */
  onReveal: (ids: readonly string[]) => void;
  /** Go back to the view the reader had when asking (pair with `CorpusMapHandle.setView`). */
  onRestore: (view: MapViewport) => void;
  /** A cited item was pressed. */
  onSelect: (id: string) => void;
  /** The accessible name of the region and the input; "Assistant" by default. */
  label?: string | undefined;
  /** A line shown under the box, for example that the answers are not from an AI. */
  notice?: string | undefined;
  /** Gives every control a 44 px target, for a narrow box. */
  touchTargets?: boolean | undefined;
  /** Extra inline styles for the container. */
  style?: CSSProperties | undefined;
}

/** `pad` alternates a trailing no-break space when a status repeats the previous one, so a live region speaks it again. */
type Status =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answered"; count: number; pad: boolean }
  | { kind: "failed"; pad: boolean };
const IDLE: Status = { kind: "idle" };

const close = (left: number, right: number) =>
  Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
/** Equal within a relative 1e-9, like the map's own comparison; kept here so this entry carries no map code. */
const sameView = (left: MapViewport, right: MapViewport) =>
  close(left.zoom, right.zoom) && close(left.centre[0], right.centre[0]) && close(left.centre[1], right.centre[1]);
const TOUCH_TARGET = 44;

function baseText(status: Status): string {
  if (status.kind === "asking") return "Asking…";
  if (status.kind === "failed") return "Assistant failed";
  if (status.kind === "idle") return "";
  if (status.count === 0) return "Answer ready";
  return `Answer ready, ${status.count} ${status.count === 1 ? "item" : "items"} shown on the map`;
}

function statusText(status: Status): string {
  return (status.kind === "answered" || status.kind === "failed") && status.pad
    ? `${baseText(status)} `
    : baseText(status);
}

/**
 * A dialogue box for `CorpusMap` (spec assistant §4): the reader asks, the
 * consumer's `ask` answers whole, the cited items are highlighted. One
 * question at a time (a newer one aborts the older, whose answer is dropped),
 * cleared by Clear or a new spec. Neutral inline styles that inherit the
 * colour and the font, so it follows the page's theme.
 */
export function AssistantBox(properties: AssistantBoxProps): ReactElement {
  const { spec, ask, selectedId, view, onMatches, onReveal, onRestore, onSelect, notice, touchTargets, style } =
    properties;
  const label = properties.label ?? "Assistant";
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<readonly AssistantTurn[]>([]);
  const [status, setStatus] = useState<Status>(IDLE);
  // The view the reader had when the last framed answer was asked.
  const [back, setBack] = useState<MapViewport | null>(null);
  const turnsReference = useRef<readonly AssistantTurn[]>([]);
  // The last status that was settled (an answer or a failure): "Asking…" in between must not hide a repeat.
  const settled = useRef<{ text: string; pad: boolean } | null>(null);
  const settle = (next: { kind: "answered"; count: number } | { kind: "failed" }): Status => {
    const text = baseText({ ...next, pad: false });
    const pad = settled.current !== null && settled.current.text === text && !settled.current.pad;
    settled.current = { text, pad };
    return { ...next, pad };
  };
  // The state half of a clear; the refs are cleared where refs may be written (an effect, or the Clear handler).
  const resetState = () => {
    setQuestion("");
    setTurns([]);
    setStatus(IDLE);
    setBack(null);
  };
  const resetReferences = () => {
    turnsReference.current = [];
    settled.current = null;
  };
  // A new spec starts a new dialogue: reset while rendering, and the effect below aborts and reports the clear.
  const [knownSpec, setKnownSpec] = useState(spec);
  if (knownSpec !== spec) {
    setKnownSpec(spec);
    resetState();
  }
  const knownLabels = useMemo(() => new Map(spec.nodes.map((node) => [node.id, node.label])), [spec]);
  const inputReference = useRef<HTMLInputElement>(null);
  // The newest props for the answer, which outlives the render that asked.
  const latest = useRef({ ask, knownLabels, selectedId, view, onMatches, onReveal, onRestore });
  useEffect(() => {
    latest.current = { ask, knownLabels, selectedId, view, onMatches, onReveal, onRestore };
  });
  // Bumped by every change that makes an answer in flight out of date.
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  };

  useEffect(() => cancel, []);

  const firstSpec = useRef(true);
  useEffect(() => {
    if (firstSpec.current) {
      firstSpec.current = false;
      return;
    }
    cancel();
    resetReferences();
    latest.current.onMatches(null);
  }, [spec]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (text === "") return;
    cancel();
    const current = latest.current;
    const asked = current.view;
    const mine = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setStatus({ kind: "asking" });
    setBack(null);
    const selected = selectedId !== null && current.knownLabels.has(selectedId) ? selectedId : null;
    let answer: AssistantAnswer;
    try {
      answer = await current.ask(
        { question: text, selectedId: selected, history: turnsReference.current },
        abort.signal,
      );
      if (generation.current !== mine) return;
      if (
        typeof answer !== "object" ||
        answer === null ||
        typeof answer.text !== "string" ||
        !Array.isArray(answer.ids)
      )
        throw new TypeError("the assistant returned no answer");
    } catch {
      if (generation.current !== mine) return;
      setStatus(settle({ kind: "failed" }));
      return;
    }
    const ids = [...new Set(answer.ids)].filter((id) => latest.current.knownLabels.has(id));
    const turn: AssistantTurn = { question: text, answer: answer.text, ids };
    turnsReference.current = [...turnsReference.current, turn];
    setTurns(turnsReference.current);
    setQuestion("");
    setStatus(settle({ kind: "answered", count: ids.length }));
    latest.current.onMatches(ids.length > 0 ? ids : null);
    if (ids.length === 0) return;
    // Frame only if the reader has not moved the view since asking (nothing tracked means nothing to protect).
    const now = latest.current.view;
    if (asked !== undefined && (now === undefined || !sameView(now, asked))) return;
    latest.current.onReveal(ids);
    if (asked !== undefined) setBack(asked);
  };

  const goBack = () => {
    if (back === null) return;
    latest.current.onRestore(back);
    setBack(null);
    inputReference.current?.focus();
  };

  const clear = () => {
    cancel();
    resetReferences();
    resetState();
    latest.current.onMatches(null);
    inputReference.current?.focus();
  };

  const target: CSSProperties = touchTargets ? { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET } : {};
  const control: CSSProperties = {
    font: "inherit",
    color: "inherit",
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 45%, transparent)",
    borderRadius: 6,
    padding: "4px 8px",
    maxWidth: "100%",
    whiteSpace: "nowrap",
    ...target,
  };
  const aboutLabel = selectedId === null ? undefined : knownLabels.get(selectedId);

  return (
    <section
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "100%", ...style }}
    >
      {aboutLabel === undefined ? null : <span style={{ opacity: 0.8 }}>{`About: ${aboutLabel}`}</span>}
      <ol
        role="log"
        aria-live="polite"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}
      >
        {turns.map((turn, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: turns are append-only and never reordered
          <li key={index}>
            <div style={{ opacity: 0.8 }}>{turn.question}</div>
            <div>{turn.answer}</div>
            {turn.ids.length === 0 ? null : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {turn.ids.map((id) => (
                  <button key={id} type="button" onClick={() => onSelect(id)} style={{ ...control, cursor: "pointer" }}>
                    {knownLabels.get(id) || id}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <form
        onSubmit={submit}
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", maxWidth: "100%" }}
      >
        <input
          ref={inputReference}
          type="text"
          autoComplete="off"
          aria-label={label}
          value={question}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuestion(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Escape" || question === "") return;
            event.preventDefault();
            event.stopPropagation();
            setQuestion("");
          }}
          style={{ ...control, flex: "1 1 4rem", minWidth: 0 }}
        />
        <button type="submit" style={{ ...control, cursor: "pointer" }}>
          Ask
        </button>
        {back === null ? null : (
          <button type="button" onClick={goBack} style={{ ...control, cursor: "pointer" }}>
            Back to previous view
          </button>
        )}
        {turns.length === 0 ? null : (
          <button type="button" onClick={clear} style={{ ...control, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </form>
      <span role="status" style={{ font: "inherit", opacity: 0.8 }}>
        {statusText(status)}
      </span>
      {notice === undefined ? null : <span style={{ opacity: 0.8 }}>{notice}</span>}
    </section>
  );
}
