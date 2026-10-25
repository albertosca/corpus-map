import type Anthropic from "@anthropic-ai/sdk";
import type { TerritoryGroup } from "../../src/territories/groups";
import { parseGroupNames } from "./names";

export const DEFAULT_GROUP_NAMES_MODEL = "claude-opus-5-5";

/** Thinking is always on for Opus 5.5 and counts against this; the answer itself is a few hundred tokens. */
export const GROUP_NAMES_MAXIMUM_TOKENS = 16_000;

/** Exactly one string per group id: the shape the parser then checks the rules on. */
export function groupNamesSchema(groups: readonly Pick<TerritoryGroup, "id">[]): Record<string, unknown> {
  const ids = groups.map((group) => group.id);
  return {
    type: "object",
    properties: {
      names: {
        type: "object",
        properties: Object.fromEntries(ids.map((id) => [id, { type: "string" }])),
        required: ids,
        additionalProperties: false,
      },
    },
    required: ["names"],
    additionalProperties: false,
  };
}

/**
 * One Messages call for the group names (spec slice F §3). `fallbacks:
 * "default"` re-runs a policy decline on Anthropic's recommended fallback
 * model inside the same call, so the model returned is the one that
 * answered. A refusal from the whole chain, or an answer cut off at the
 * token limit, throws before the content is read; API errors are the SDK's
 * own, which carry the status and the API's message but never the key.
 */
export async function requestGroupNames(
  client: Anthropic,
  prompt: string,
  groups: readonly Pick<TerritoryGroup, "id">[],
  options: { model: string },
): Promise<{ names: Map<string, string>; model: string }> {
  const response = await client.beta.messages.create({
    model: options.model,
    max_tokens: GROUP_NAMES_MAXIMUM_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: { type: "json_schema", schema: groupNamesSchema(groups) } },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`${response.model} declined to name the groups (stop reason: refusal)`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(`The answer was cut off at ${GROUP_NAMES_MAXIMUM_TOKENS} tokens (stop reason: max_tokens)`);
  }
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  return { names: parseGroupNames(text, groups), model: response.model };
}
