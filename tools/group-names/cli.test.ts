// @vitest-environment node
// The SDK refuses to run in a browser-like environment such as jsdom.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_NAMES_MODEL } from "./claude";
import { type GroupNamesIo, runGroupNames, USAGE } from "./cli";
import type { GroupNamesFile } from "./groupNamesFile";
import { GROUP_NAMES_PROMPT_VERSION } from "./prompt";

const API_KEY = "sk-ant-test-secret-1111";
const NAMES = { "group:t00": "Learning", "group:t04": "Systems", "group:t08": "Theory" };

/** Twelve territories in three far-apart clumps, with compact edges as arXiv ships them. */
function corpus(territoryExtra: Record<string, unknown> = {}, count = 12) {
  const territories = Array.from({ length: count }, (_unused, index) => {
    const id = `t${String(index).padStart(2, "0")}`;
    return {
      id,
      name: id,
      members: Array.from({ length: 12 - index }, (_item, item) => `${id}-${item}`),
      centroid: [Math.floor(index / 4) * 1000 + (index % 4), 0],
      ...(index === 1 ? territoryExtra : {}),
    };
  });
  const nodes = territories.flatMap((territory) =>
    territory.members.map((id) => ({ id, label: `Paper ${id}`, x: 0, y: 0, territory: territory.id })),
  );
  return { version: "1", territories, nodes, edges: [[0, 12, 50]] };
}

interface Harness {
  io: GroupNamesIo;
  written: Map<string, string>;
  printed: string[];
  requests: Array<Record<string, unknown>>;
}

function harness(
  options: { spec?: unknown; answer?: Record<string, unknown>; environment?: Record<string, string> } = {},
): Harness {
  const written = new Map<string, string>();
  const printed: string[] = [];
  const requests: Array<Record<string, unknown>> = [];
  const answer = options.answer ?? NAMES;
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    const reply = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify({ names: answer }) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  const io: GroupNamesIo = {
    readText: async (path) => {
      if (path !== "spec.json") throw new Error(`ENOENT: no such file, open '${path}'`);
      return JSON.stringify(options.spec ?? corpus());
    },
    writeText: async (path, text) => {
      written.set(path, text);
    },
    environment: options.environment ?? { ANTHROPIC_API_KEY: API_KEY },
    print: (line) => printed.push(line),
    createClient: (apiKey) => new Anthropic({ apiKey, fetch: fakeFetch, maxRetries: 0 }),
    today: () => "2026-10-25",
  };
  return { io, written, printed, requests };
}

describe("runGroupNames", () => {
  it.each([[[]], [["spec.json"]], [["spec.json", "out.json", "extra"]], [["spec.json", "out.json", "--model"]]])(
    "prints the usage and exits 2 on arguments %j",
    async (argv) => {
      const { io, printed, written } = harness();
      expect(await runGroupNames(argv, io)).toBe(2);
      expect(printed).toEqual([USAGE]);
      expect(written.size).toBe(0);
    },
  );

  it("refuses without ANTHROPIC_API_KEY", async () => {
    const { io, printed, written, requests } = harness({ environment: {} });
    expect(await runGroupNames(["spec.json", "out.json"], io)).toBe(1);
    expect(printed.join("\n")).toContain("ANTHROPIC_API_KEY");
    expect(written.size).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it.each([
    ["an unreadable spec", ["missing.json", "out.json"], undefined, /missing\.json/],
    ["an invalid spec", ["spec.json", "out.json"], { version: "1", territories: [], nodes: "no" }, /spec\.json/],
    ["a declared group", ["spec.json", "out.json"], corpus({ group: "Mine" }), /declares group or parent/],
    ["a declared parent", ["spec.json", "out.json"], corpus({ parent: "t00" }), /declares group or parent/],
    ["a spec that derives no groups", ["spec.json", "out.json"], corpus({}, 5), /derives no groups/],
  ])("refuses %s, writing nothing", async (_case, argv, spec, message) => {
    const { io, printed, written, requests } = harness({ spec });
    expect(await runGroupNames(argv, io)).toBe(1);
    expect(printed.join("\n")).toMatch(message);
    expect(written.size).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it("writes the names file and prints each name", async () => {
    const { io, printed, written, requests } = harness();
    expect(await runGroupNames(["spec.json", "out.json"], io)).toBe(0);
    expect(requests[0]?.model).toBe(DEFAULT_GROUP_NAMES_MODEL);
    const text = written.get("out.json") as string;
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "model"');
    const file = JSON.parse(text) as GroupNamesFile;
    expect(file).toEqual({
      model: DEFAULT_GROUP_NAMES_MODEL,
      namedAt: "2026-10-25",
      promptVersion: GROUP_NAMES_PROMPT_VERSION,
      groups: [
        { name: "Learning", members: ["t00", "t01", "t02", "t03"] },
        { name: "Systems", members: ["t04", "t05", "t06", "t07"] },
        { name: "Theory", members: ["t08", "t09", "t10", "t11"] },
      ],
    });
    const output = printed.join("\n");
    for (const name of ["Learning", "Systems", "Theory"]) expect(output).toContain(name);
    expect(output).not.toContain(API_KEY);
  });

  it("passes --model through and records the model that answered", async () => {
    const { io, written, requests } = harness();
    expect(await runGroupNames(["--model", "claude-test", "spec.json", "out.json"], io)).toBe(0);
    expect(requests[0]?.model).toBe("claude-test");
    expect((JSON.parse(written.get("out.json") as string) as GroupNamesFile).model).toBe("claude-test");
  });

  it("writes nothing and exits 1 when the answer breaks a rule", async () => {
    const { io, printed, written } = harness({ answer: { ...NAMES, "group:t08": "Other" } });
    expect(await runGroupNames(["spec.json", "out.json"], io)).toBe(1);
    expect(printed.join("\n")).toContain('"Other"');
    expect(written.size).toBe(0);
  });
});
