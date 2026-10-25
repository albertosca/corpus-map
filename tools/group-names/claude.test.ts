// @vitest-environment node
// The SDK refuses to run in a browser-like environment such as jsdom.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_NAMES_MODEL, GROUP_NAMES_MAXIMUM_TOKENS, groupNamesSchema, requestGroupNames } from "./claude";

const API_KEY = "sk-ant-test-secret-0000";
const GROUPS = [{ id: "group:a" }, { id: "group:b" }];

interface Sent {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_GROUP_NAMES_MODEL,
    content: [{ type: "text", text: JSON.stringify({ names: { "group:a": "Learning", "group:b": "Systems" } }) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  };
}

function clientAnswering(status: number, payload: unknown, sent: Sent[] = []): Anthropic {
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
  return new Anthropic({ apiKey: API_KEY, fetch: fakeFetch, maxRetries: 0 });
}

describe("groupNamesSchema", () => {
  it("requires exactly one string per group id under names", () => {
    expect(groupNamesSchema(GROUPS)).toEqual({
      type: "object",
      properties: {
        names: {
          type: "object",
          properties: { "group:a": { type: "string" }, "group:b": { type: "string" } },
          required: ["group:a", "group:b"],
          additionalProperties: false,
        },
      },
      required: ["names"],
      additionalProperties: false,
    });
  });
});

describe("requestGroupNames", () => {
  it("sends one Messages request with fallbacks, effort and the schema", async () => {
    const sent: Sent[] = [];
    await requestGroupNames(clientAnswering(200, message(), sent), "Name these", GROUPS, { model: "claude-test" });
    expect(sent).toHaveLength(1);
    const [request] = sent as [Sent];
    expect(request.url).toMatch(/\/v1\/messages(\?|$)/);
    expect(request.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(request.body).toMatchObject({
      model: "claude-test",
      max_tokens: GROUP_NAMES_MAXIMUM_TOKENS,
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: groupNamesSchema(GROUPS) } },
      messages: [{ role: "user", content: "Name these" }],
    });
  });

  it("joins the text blocks, skips a fallback block, and reports the model that answered", async () => {
    const answer = JSON.stringify({ names: { "group:a": "Learning", "group:b": "Systems" } });
    const reply = message({
      model: "claude-opus-4-8",
      content: [
        { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
        { type: "text", text: answer.slice(0, 10) },
        { type: "text", text: answer.slice(10) },
      ],
    });
    const result = await requestGroupNames(clientAnswering(200, reply), "p", GROUPS, { model: "claude-opus-5-5" });
    expect([...result.names.values()]).toEqual(["Learning", "Systems"]);
    expect(result.model).toBe("claude-opus-4-8");
  });

  it.each([
    ["refusal", /declined/],
    ["max_tokens", /cut off/],
  ])("throws on a %s stop before reading the content", async (stopReason, error) => {
    const reply = message({ stop_reason: stopReason, content: [{ type: "text", text: "{" }] });
    await expect(requestGroupNames(clientAnswering(200, reply), "p", GROUPS, { model: "m" })).rejects.toThrow(error);
  });

  it("surfaces the API's own error message and never the key", async () => {
    const failure = {
      type: "error",
      error: { type: "authentication_error", message: "invalid authentication credentials" },
    };
    const thrown = await requestGroupNames(clientAnswering(401, failure), "p", GROUPS, { model: "m" }).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain("invalid authentication credentials");
    expect(JSON.stringify(thrown)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
  });

  it("rejects an answer that breaks a naming rule", async () => {
    const reply = message({
      content: [{ type: "text", text: JSON.stringify({ names: { "group:a": "Other", "group:b": "B" } }) }],
    });
    await expect(requestGroupNames(clientAnswering(200, reply), "p", GROUPS, { model: "m" })).rejects.toThrow(
      /"Other"/,
    );
  });
});
