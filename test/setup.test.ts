import { getConfig } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ASYNC_QUERY_TIMEOUT } from "./setup";

describe("test setup", () => {
  it("gives every findBy/waitFor query 5 s, not Testing Library's 1 s, which a loaded machine overran on the App's first render (2026-10-23)", () => {
    expect(ASYNC_QUERY_TIMEOUT).toBe(5_000);
    expect(getConfig().asyncUtilTimeout).toBe(ASYNC_QUERY_TIMEOUT);
  });
});
