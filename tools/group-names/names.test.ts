import { describe, expect, it } from "vitest";
import { GROUP_NAME_MAXIMUM_LENGTH, parseGroupNames } from "./names";

const GROUPS = [{ id: "group:a" }, { id: "group:b" }];

function answer(names: Record<string, unknown>): string {
  return JSON.stringify({ names });
}

describe("parseGroupNames", () => {
  it("reads a bare JSON answer, in the groups' order", () => {
    const names = parseGroupNames(answer({ "group:b": "Systems", "group:a": "Learning" }), GROUPS);
    expect([...names]).toEqual([
      ["group:a", "Learning"],
      ["group:b", "Systems"],
    ]);
  });

  it("finds the JSON inside a fenced block with prose around it", () => {
    const text = `Here are the names:\n\`\`\`json\n${answer({ "group:a": "Learning", "group:b": "Systems" })}\n\`\`\`\nDone.`;
    expect(parseGroupNames(text, GROUPS).get("group:b")).toBe("Systems");
  });

  it("trims names and collapses inner whitespace", () => {
    const names = parseGroupNames(answer({ "group:a": "  Machine \n  learning ", "group:b": "Systems" }), GROUPS);
    expect(names.get("group:a")).toBe("Machine learning");
  });

  it("accepts a name exactly at the maximum length", () => {
    const name = "x".repeat(GROUP_NAME_MAXIMUM_LENGTH);
    expect(parseGroupNames(answer({ "group:a": name, "group:b": "Systems" }), GROUPS).get("group:a")).toBe(name);
  });

  it("reads bare JSON whose names contain backticks", () => {
    const names = parseGroupNames(answer({ "group:a": "A```b```", "group:b": "Systems" }), GROUPS);
    expect(names.get("group:a")).toBe("A```b```");
  });

  const failures: Array<[string, string, RegExp]> = [
    ["an answer that is not JSON", "Machine learning, Systems", /not JSON/],
    ["an answer without a names object", JSON.stringify({ groups: {} }), /no "names" object/],
    ["a missing group id", answer({ "group:a": "Learning" }), /no name for group group:b/i],
    [
      "an id that is not a group",
      answer({ "group:a": "A", "group:b": "B", "group:c": "C" }),
      /"group:c" is not a group/,
    ],
    ["a name that is not a string", answer({ "group:a": 3, "group:b": "B" }), /group:a is not a string/],
    ["a name empty after trimming", answer({ "group:a": "  ", "group:b": "B" }), /group:a is empty/],
    ["a name of invisible characters only", answer({ "group:a": "\u200b\u2060", "group:b": "B" }), /group:a is empty/],
    [
      "a name one character too long",
      answer({ "group:a": "x".repeat(GROUP_NAME_MAXIMUM_LENGTH + 1), "group:b": "B" }),
      /group:a .* longer than 24/,
    ],
    ["a name equal to Other in any case", answer({ "group:a": " other ", "group:b": "B" }), /group:a .* "Other"/],
    ["two names equal ignoring case", answer({ "group:a": "Systems", "group:b": "SYSTEMS" }), /group:a and group:b/],
  ];

  it.each(failures)("rejects %s, naming the rule", (_case, text, message) => {
    expect(() => parseGroupNames(text, GROUPS)).toThrow(message);
  });
});
