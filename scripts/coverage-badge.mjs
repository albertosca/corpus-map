import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Turns coverage/lcov.info into a self-hosted SVG badge, so the README shows a
// number this repository measured (no third-party service, no token).
// Usage: node scripts/coverage-badge.mjs [lcov.info] [output.svg]
const lcovPath = process.argv[2] ?? "coverage/lcov.info";
const outputPath = process.argv[3] ?? "docs/badges/coverage.svg";

/** Line coverage: the sum of every `LF:` (found) and `LH:` (hit) record. */
export function lineCoverage(lcov) {
  let found = 0;
  let hit = 0;
  for (const line of lcov.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("LF:")) found += Number.parseInt(trimmed.slice(3), 10);
    else if (trimmed.startsWith("LH:")) hit += Number.parseInt(trimmed.slice(3), 10);
  }
  // A report with no instrumented line measures nothing: it reads 0, never a flattering 100.
  return found === 0 ? 0 : (100 * hit) / found;
}

/** Colours keep the white text at a contrast of 4.5 or more. */
export function colourFor(percent) {
  if (percent >= 90) return "#1a7f37";
  if (percent >= 75) return "#9a6700";
  return "#cf222e";
}

export function renderBadge(percent) {
  const label = "line coverage";
  const value = `${percent.toFixed(1)}%`;
  const labelWidth = 92;
  const valueWidth = 54;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth + valueWidth}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${colourFor(percent)}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${labelWidth / 2}" y="14">${label}</text><text x="${labelWidth + valueWidth / 2}" y="14">${value}</text></g></svg>\n`;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let lcov;
  try {
    lcov = readFileSync(lcovPath, "utf8");
  } catch {
    console.error(`coverage-badge: ${lcovPath} not found - run \`npm test\` first`);
    process.exit(2);
  }
  const percent = lineCoverage(lcov);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderBadge(percent));
  console.log(`coverage-badge: ${percent.toFixed(1)}% line coverage -> ${outputPath}`);
}
