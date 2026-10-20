import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { auditAccessibility, violationIds } from "./audit";

describe("auditAccessibility canary (spec slice B §7)", () => {
  it("passes a clean fragment", async () => {
    const { container } = render(
      <div>
        <h2>Title</h2>
        <button type="button">Go</button>
      </div>,
    );
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
  });

  it("reports every injected defect by rule id", async () => {
    const { container } = render(
      <div>
        <h2>Title</h2>
        <h4>Skipped a level</h4>
        <button type="button" />
        <span id="twice">One</span>
        <span id="twice">Two</span>
        <button type="button" aria-labelledby="twice" />
      </div>,
    );
    const ids = violationIds(await auditAccessibility(container));
    expect(ids).toEqual(expect.arrayContaining(["button-name", "duplicate-id-aria", "heading-order"]));
  });
});
