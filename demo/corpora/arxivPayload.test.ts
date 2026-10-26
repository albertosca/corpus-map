import { describe, expect, it } from "vitest";
import arxivJson from "./arxiv.json";
import { yearOfArxivId } from "./compact";

// Read as plain records: the point is what the file carries, not what the
// expanded spec looks like.
const payload = arxivJson as unknown as {
  territories: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown> & { id: string }>;
};

describe("the shipped arXiv payload", () => {
  it("leaves out every field the demo derives (compact.ts), so the fetch stays small", () => {
    expect(payload.territories.filter((territory) => "members" in territory)).toEqual([]);
    expect(payload.nodes.filter((node) => "meta" in node)).toEqual([]);
  });

  it("has an arXiv id on every node, so each one gets its year and url back", () => {
    expect(payload.nodes.filter((node) => yearOfArxivId(node.id) === undefined).map((node) => node.id)).toEqual([]);
  });
});
