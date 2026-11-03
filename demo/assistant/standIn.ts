import type { AssistantAdapter, AssistantAnswer } from "corpus-map/assistant";
import { foldText, localSearch, searchIndexOf } from "../../src/search/localSearch";
import type { MapSpec } from "../../src/shared/spec";

/** Always on screen next to the dialogue: the answers below are not from a model. */
export const STAND_IN_NOTICE = "Stand-in answers from your browser's search, not an AI.";

/** How many of the matches an answer cites. */
const CITED_ITEMS = 12;
const DEFAULT_DELAY_MILLISECONDS = 400;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "about",
  "do",
  "does",
  "find",
  "for",
  "how",
  "in",
  "is",
  "me",
  "of",
  "on",
  "papers",
  "show",
  "tell",
  "the",
  "there",
  "to",
  "what",
  "which",
  "with",
]);
const NOTHING: AssistantAnswer = { text: "Nothing matches that.", ids: [] };

const abortError = () => new DOMException("The question was cancelled", "AbortError");

/** Waits `milliseconds`, or rejects with an `AbortError` as soon as `signal` aborts. */
function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The demo's answerer (spec assistant §7): no model, no key, no server. It
 * runs the local search on the question without its stop words and cites what
 * it finds; "this" means the selected item. It waits a fixed delay so the
 * pending state can be seen.
 */
export function standInAdapter(spec: MapSpec, delayMilliseconds = DEFAULT_DELAY_MILLISECONDS): AssistantAdapter {
  return async ({ question, selectedId }, signal) => {
    await pause(delayMilliseconds, signal);
    const words = foldText(question)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (words.includes("this")) {
      const node = spec.nodes.find((candidate) => candidate.id === selectedId);
      if (node === undefined) return { text: "Select an item first, then ask about this.", ids: [] };
      const territory = spec.territories.find((candidate) => candidate.id === node.territory);
      const where = territory === undefined ? "" : `, in ${territory.name}`;
      return { text: `That is “${node.label}”${where}.`, ids: [node.id] };
    }
    const meaningful = words.filter((word) => !STOP_WORDS.has(word));
    if (meaningful.length === 0) return NOTHING;
    const found = localSearch(searchIndexOf(spec), meaningful.join(" "));
    if (found.length === 0) return NOTHING;
    return {
      text: `Found ${found.length} ${found.length === 1 ? "item" : "items"} matching “${meaningful.join(" ")}”.`,
      ids: found.slice(0, CITED_ITEMS),
    };
  };
}
