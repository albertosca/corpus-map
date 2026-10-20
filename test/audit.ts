import axe, { type AxeResults } from "axe-core";

/**
 * Rules axe 4 only ever files under "needs review" (`incomplete`), never
 * under `violations`, though here a hit is always a defect: a duplicated id
 * that an ARIA reference points at names the wrong element.
 */
const PROMOTED_RULES: ReadonlySet<string> = new Set(["duplicate-id-aria"]);

/**
 * axe over a rendered fragment under jsdom (spec slice B §7). Contrast is
 * off — jsdom has no layout, so the rule would report nonsense; it stays
 * with the browser runbook (B9) and Lighthouse. The page-level rules are off
 * because a component is not a page.
 */
export async function auditAccessibility(container: Element): Promise<AxeResults> {
  return axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
    resultTypes: ["violations", "incomplete"],
  });
}

/** Sorted unique rule ids of the violations, plus the promoted "needs review" rules. */
export function violationIds(results: AxeResults): string[] {
  const promoted = results.incomplete.filter((result) => PROMOTED_RULES.has(result.id));
  return [...new Set([...results.violations, ...promoted].map((violation) => violation.id))].sort();
}
