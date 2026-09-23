import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// React and react-dom are external in the Vite build, so this file is
// exactly what a consumer adds on top of the peers they already have.
const { file, maxGzipBytes } = JSON.parse(readFileSync("package.json", "utf8")).sizeLimit;
const BADGE = "docs/badges/size.svg";

let bytes;
try {
  bytes = gzipSync(readFileSync(file)).length;
} catch {
  console.error(`size: ${file} not found - run \`npm run build\` first`);
  process.exit(2);
}

const kb = (bytes / 1024).toFixed(1);
const label = "gzip size";
const value = `${kb} kB`;
const lw = 62;
const vw = 8 + value.length * 7;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="#007ec6"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="6" y="14">${label}</text><text x="${lw + 4}" y="14">${value}</text></g></svg>\n`;

if (process.argv[2] === "--write-badge") {
  mkdirSync("docs/badges", { recursive: true });
  writeFileSync(BADGE, svg);
  console.log(`size: wrote ${BADGE} (${value})`);
}

console.log(`size: ${file} is ${bytes} bytes gzipped (ceiling ${maxGzipBytes})`);
if (bytes > maxGzipBytes) {
  console.error(`size: over the ceiling by ${bytes - maxGzipBytes} bytes`);
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
