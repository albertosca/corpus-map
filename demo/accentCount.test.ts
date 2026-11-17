import { describe, expect, it } from "vitest";
import { ACCENT_SPOT_RULE, tokenStylesheet } from "./tokens";

describe("accent count per screen: 0 or 1 (the stylesheet half)", () => {
  it("fills only the Show on map button, and only while the accent spot is on", () => {
    expect(ACCENT_SPOT_RULE).toContain('[data-accent-spot="on"] search button:not([aria-label])');
    expect(ACCENT_SPOT_RULE).toContain("background: var(--accent) !important");
    expect(ACCENT_SPOT_RULE).toContain("color: var(--on-accent) !important");
    expect(tokenStylesheet()).toContain(ACCENT_SPOT_RULE);
  });

  it("has no other rule that fills with the accent, so the selected dot is the only other spot", () => {
    const fills = tokenStylesheet().match(/background:\s*var\(--accent\)/g) ?? [];
    expect(fills).toHaveLength(1);
  });
});
