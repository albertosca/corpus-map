import type Anthropic from "@anthropic-ai/sdk";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import {
  deriveTerritoryGroups,
  MAXIMUM_DERIVED_TERRITORIES,
  MINIMUM_DERIVED_TERRITORIES,
} from "../../src/territories/groups";
import { DEFAULT_GROUP_NAMES_MODEL, requestGroupNames } from "./claude";
import { toGroupNamesFile } from "./groupNamesFile";
import { buildGroupNamesPrompt, GROUP_NAMES_PROMPT_VERSION } from "./prompt";

export const USAGE = "Usage: bun tools/group-names/main.ts <spec.json> <out.json> [--model <id>]";

/** Everything the run touches outside itself, injected so every path is tested (spec slice F §3). */
export interface GroupNamesIo {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  environment: Readonly<Record<string, string | undefined>>;
  print(line: string): void;
  createClient(apiKey: string): Anthropic;
  /** YYYY-MM-DD. */
  today(): string;
}

function parseArguments(argv: readonly string[]): { specPath: string; outputPath: string; model: string } | undefined {
  const positional: string[] = [];
  let model = DEFAULT_GROUP_NAMES_MODEL;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument !== "--model") {
      positional.push(argument);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) return undefined;
    model = value;
    index += 1;
  }
  const [specPath, outputPath] = positional;
  if (positional.length !== 2 || specPath === undefined || outputPath === undefined) return undefined;
  return { specPath, outputPath, model };
}

/** YYYY-MM-DD in the local calendar: a run at 23:30 in Brasília is dated that day, not UTC's next one. */
export function localDate(date: Date): string {
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

const withoutDotSlash = (path: string) => path.replace(/^(\.\/)+/, "");

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function declaresGrouping(body: unknown): boolean {
  const territories = (body as { territories?: unknown }).territories;
  return (
    Array.isArray(territories) &&
    territories.some(
      (territory: unknown) =>
        typeof territory === "object" && territory !== null && ("group" in territory || "parent" in territory),
    )
  );
}

async function readSpec(path: string, io: GroupNamesIo): Promise<{ spec?: MapSpec; problem?: string }> {
  try {
    const body: unknown = JSON.parse(await io.readText(path));
    if (declaresGrouping(body)) {
      return { problem: `${path} declares group or parent: its groups are supplied, there is nothing to name` };
    }
    // Naming never reads edges, and a corpus may ship them compact (arXiv does).
    const { edges: _edges, ...rest } = body as Record<string, unknown>;
    return { spec: validateSpec(rest) };
  } catch (error) {
    return { problem: `Cannot read ${path}: ${messageOf(error)}` };
  }
}

/**
 * Names a corpus's derived groups and writes the names file; returns the
 * exit code. Nothing is written unless every step succeeds.
 */
export async function runGroupNames(argv: readonly string[], io: GroupNamesIo): Promise<number> {
  const parsed = parseArguments(argv);
  if (parsed === undefined) {
    io.print(USAGE);
    return 2;
  }
  if (withoutDotSlash(parsed.specPath) === withoutDotSlash(parsed.outputPath)) {
    io.print(
      `${parsed.outputPath} is the spec being read: writing it would overwrite the corpus. Pick another output.`,
    );
    return 2;
  }
  const apiKey = io.environment.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    io.print("ANTHROPIC_API_KEY is not set; export it (for example from ~/.config/anthropic/api.env) and run again.");
    return 1;
  }
  const { spec, problem } = await readSpec(parsed.specPath, io);
  if (spec === undefined) {
    io.print(problem as string);
    return 1;
  }
  const groups = deriveTerritoryGroups(spec);
  if (groups.length === 0) {
    io.print(
      `${parsed.specPath} derives no groups (it needs ${MINIMUM_DERIVED_TERRITORIES} to ${MAXIMUM_DERIVED_TERRITORIES} territories): there is nothing to name`,
    );
    return 1;
  }
  try {
    const prompt = buildGroupNamesPrompt(spec, groups);
    const answer = await requestGroupNames(io.createClient(apiKey), prompt, groups, { model: parsed.model });
    const file = toGroupNamesFile(groups, answer.names, {
      model: answer.model,
      namedAt: io.today(),
      promptVersion: GROUP_NAMES_PROMPT_VERSION,
    });
    await io.writeText(parsed.outputPath, `${JSON.stringify(file, null, 2)}\n`);
    io.print(`Named ${groups.length} groups with ${answer.model}, written to ${parsed.outputPath}:`);
    for (const group of file.groups) io.print(`  ${group.name}: ${group.members.join(", ")}`);
    return 0;
  } catch (error) {
    io.print(`Naming failed, nothing written: ${messageOf(error)}`);
    return 1;
  }
}
