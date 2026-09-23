import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Concatenates every declaration file under dist/ into one committed report.
// Comparing all of them, not index.d.ts alone, matters: index.d.ts only
// re-exports, so a changed type in a feature file would slip past it.
const DIST = "dist";
const OUT = "api/corpus-map.api.d.ts";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(DIST)
    .filter((f) => f.endsWith(".d.ts"))
    .sort();
} catch {
  files = [];
}
if (files.length === 0) {
  console.error("api-guard: no .d.ts under dist/ - run `npm run build` first");
  process.exit(2);
}
const leaked = files.filter((f) => /\.test\.d\.ts$/.test(f));
if (leaked.length > 0) {
  console.error(`api-guard: test declarations in dist/: ${leaked.join(", ")}`);
  process.exit(1);
}
const report = `${files.map((f) => `// ${relative(DIST, f)}\n${readFileSync(f, "utf8").trimEnd()}\n`).join("\n")}`;

if (process.argv[2] === "--update") {
  mkdirSync("api", { recursive: true });
  writeFileSync(OUT, report);
  console.log(`api-guard: wrote ${OUT} from ${files.length} declaration files`);
  process.exit(0);
}

let committed;
try {
  committed = readFileSync(OUT, "utf8");
} catch {
  console.error(`api-guard: ${OUT} is missing - run \`npm run api:update\` and commit it`);
  process.exit(1);
}
if (committed !== report) {
  const a = committed.split("\n");
  const b = report.split("\n");
  const line = a.findIndex((l, i) => l !== b[i]);
  console.error(`api-guard: public types changed (first difference at line ${line + 1} of ${OUT}):`);
  console.error(`  committed: ${a[line] ?? "<end of file>"}`);
  console.error(`  built:     ${b[line] ?? "<end of file>"}`);
  console.error("If the change is intended, run `npm run api:update` and commit the result.");
  process.exit(1);
}
console.log(`api-guard: ${files.length} declaration files match ${OUT}`);
