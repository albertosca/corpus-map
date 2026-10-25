import { OTHER_GROUP, type TerritoryGroup } from "../../src/territories/groups";

/** Wide enough for a phone: 24 characters in the group-name style fit 343 px (spec slice F §4). */
export const GROUP_NAME_MAXIMUM_LENGTH = 24;

const FENCED = /```(?:json)?\s*([\s\S]*?)```/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  // Bare JSON first: a name may itself contain backticks that look like a fence.
  for (const body of [text, FENCED.exec(text)?.[1]]) {
    if (body === undefined) continue;
    try {
      return JSON.parse(body.trim());
    } catch {
      // Try the fenced block next.
    }
  }
  throw new Error("The answer is not JSON");
}

/**
 * The rule a single, already normalised name breaks, as a predicate ("is
 * empty"), or undefined. Shared by the parser and the staleness check, so a
 * hand-edited names file meets the rules an answer has to.
 */
export function groupNameProblem(name: string): string | undefined {
  // Invisible format characters (zero-width space, word joiner) paint nothing.
  if (name.replace(/[\s\p{Cf}]/gu, "") === "") return "is empty";
  if ([...name].length > GROUP_NAME_MAXIMUM_LENGTH) return `is longer than ${GROUP_NAME_MAXIMUM_LENGTH} characters`;
  if (name.toLowerCase() === OTHER_GROUP.toLowerCase()) return `is "${OTHER_GROUP}", which names ungrouped territories`;
  return undefined;
}

/**
 * The names in an LLM's answer, one per group id, in the groups' order.
 * Throws a message naming the first rule the answer breaks (spec slice F §3):
 * the structured-output schema guarantees the shape, not these rules.
 */
export function parseGroupNames(text: string, groups: readonly Pick<TerritoryGroup, "id">[]): Map<string, string> {
  const parsed = parseJson(text);
  const answered = isRecord(parsed) ? parsed.names : undefined;
  if (!isRecord(answered)) throw new Error('The answer has no "names" object');
  const ids = new Set(groups.map((group) => group.id));
  for (const id of Object.keys(answered)) if (!ids.has(id)) throw new Error(`"${id}" is not a group id`);

  const names = new Map<string, string>();
  const byFoldedName = new Map<string, string>();
  for (const { id } of groups) {
    const raw = answered[id];
    if (raw === undefined) throw new Error(`No name for group ${id}`);
    if (typeof raw !== "string") throw new Error(`The name for group ${id} is not a string`);
    const name = raw.trim().replace(/\s+/g, " ");
    const problem = groupNameProblem(name);
    if (problem !== undefined) throw new Error(`The name "${name}" for group ${id} ${problem}`);
    const folded = name.toLowerCase();
    const earlier = byFoldedName.get(folded);
    if (earlier !== undefined) throw new Error(`Groups ${earlier} and ${id} share the name "${name}"`);
    byFoldedName.set(folded, id);
    names.set(id, name);
  }
  return names;
}
