import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// React and react-dom are external in the Vite build, so this file is
// exactly what a consumer adds on top of the peers they already have.
const { file, maximumGzipBytes, search, assistant } = JSON.parse(readFileSync("package.json", "utf8")).sizeLimit;
const BADGE = "docs/badges/size.svg";

const gzipBytesOf = (path) => {
  try {
    return gzipSync(readFileSync(path)).length;
  } catch {
    console.error(`size: ${path} not found - run \`npm run build\` first`);
    process.exit(2);
  }
};
const bytes = gzipBytesOf(file);

// `corpus-map/search` and `corpus-map/assistant` are their own files with their own ceilings; the badge stays the main entry's.
for (const entry of [search, assistant]) {
  const entryBytes = gzipBytesOf(entry.file);
  console.log(`size: ${entry.file} is ${entryBytes} bytes gzipped (ceiling ${entry.maximumGzipBytes})`);
  if (entryBytes > entry.maximumGzipBytes) {
    console.error(`size: ${entry.file} is over the ceiling by ${entryBytes - entry.maximumGzipBytes} bytes`);
    process.exit(1);
  }
}

const kilobytes = (bytes / 1024).toFixed(1);
const label = "gzip size";
const value = `${kilobytes} kB`;
const labelWidth = 62;
const valueWidth = 8 + value.length * 7;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth + valueWidth}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><rect width="${labelWidth}" height="20" fill="#555"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#007ec6"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="6" y="14">${label}</text><text x="${labelWidth + 4}" y="14">${value}</text></g></svg>\n`;

if (process.argv[2] === "--write-badge") {
  mkdirSync("docs/badges", { recursive: true });
  writeFileSync(BADGE, svg);
  console.log(`size: wrote ${BADGE} (${value})`);
}

console.log(`size: ${file} is ${bytes} bytes gzipped (ceiling ${maximumGzipBytes})`);
if (bytes > maximumGzipBytes) {
  console.error(`size: over the ceiling by ${bytes - maximumGzipBytes} bytes`);
  process.exit(1);
}
let committed = "";
try {
  committed = readFileSync(BADGE, "utf8");
} catch {
  // No badge committed yet: reported as out of date just below.
}
if (committed !== svg) {
  console.error(`size: ${BADGE} is out of date - run \`npm run size:badge\` and commit it`);
  process.exit(1);
}
