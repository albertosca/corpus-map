import type { MapSpec, Territory } from "../../src/shared/spec";
import { OTHER_GROUP, type TerritoryGroup } from "../../src/territories/groups";
import { GROUP_NAME_MAXIMUM_LENGTH } from "./names";

/** Changes whenever the wording below does; the names file records it. */
export const GROUP_NAMES_PROMPT_VERSION = 1;

export const SAMPLE_LABELS_PER_GROUP = 8;

/**
 * Up to eight item labels for a group, round-robin across its members in
 * member order (largest first), each member's items in its `members` order:
 * every member is represented before any gives a second, and the same spec
 * always yields the same sample.
 */
export function sampleLabels(spec: MapSpec, group: TerritoryGroup): string[] {
  const labelById = new Map(spec.nodes.map((node) => [node.id, node.label]));
  const territoryById = new Map(spec.territories.map((territory) => [territory.id, territory]));
  // A validated spec resolves every member and every item, so the casts hold.
  const queues = group.members.map((member) =>
    (territoryById.get(member) as Territory).members.map((id) => labelById.get(id) as string),
  );
  const sample: string[] = [];
  for (let round = 0; sample.length < SAMPLE_LABELS_PER_GROUP; round += 1) {
    const available = queues.filter((queue) => round < queue.length);
    if (available.length === 0) break;
    for (const queue of available) {
      if (sample.length === SAMPLE_LABELS_PER_GROUP) break;
      sample.push(queue[round] as string);
    }
  }
  return sample;
}

function describeGroup(spec: MapSpec, group: TerritoryGroup): string {
  const members = group.members.map((member) => {
    const territory = spec.territories.find((candidate) => candidate.id === member) as Territory;
    return `${territory.name} (${territory.members.length.toLocaleString("en-US")} items)`;
  });
  const labels = sampleLabels(spec, group).map((label) => `  - ${label}`);
  return [`Group ${group.id}`, `Categories: ${members.join("; ")}`, "Sample item labels:", ...labels].join("\n");
}

/**
 * The request for one name per derived group (spec slice F §3). The groups
 * are regions of the map that join neighbouring categories; the name has to
 * cover what they share, since the provisional one only names the largest.
 */
export function buildGroupNamesPrompt(spec: MapSpec, groups: readonly TerritoryGroup[]): string {
  return [
    `Group naming, prompt version ${GROUP_NAMES_PROMPT_VERSION}.`,
    "",
    "Below are the groups of a map of a document collection. Each group is a region of the map that joins neighbouring categories; for each one you see its categories, how many items each holds, and a sample of item labels.",
    "",
    "Give each group a name a visitor reads on the map, following these rules:",
    `- at most ${GROUP_NAME_MAXIMUM_LENGTH} characters, spaces included;`,
    "- in the language the category names are written in;",
    "- naming the subject the group's categories share, weighted by their size, not just the largest category;",
    `- different from each other, and never "${OTHER_GROUP}".`,
    "",
    'Answer with JSON only, one entry per group id below: {"names": {"<group id>": "<name>"}}',
    "",
    ...groups.map((group) => describeGroup(spec, group)).flatMap((block) => [block, ""]),
  ]
    .join("\n")
    .trimEnd();
}
