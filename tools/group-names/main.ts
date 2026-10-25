import Anthropic from "@anthropic-ai/sdk";
import { runGroupNames } from "./cli";

// The runtime entry of the group-names tool: `bun tools/group-names/main.ts`.
// The package has no @types/node on purpose (a browser library; node types
// would leak into src/), so the two runtime pieces used here are declared
// locally, and the file system module is loaded through a variable
// specifier that the type checker does not resolve.
declare const process: { argv: string[]; env: Record<string, string | undefined>; exitCode?: number };

interface FileSystem {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, text: string, encoding: "utf8"): Promise<void>;
}

const fileSystemModule = "node:fs/promises";
const fileSystem = (await import(fileSystemModule)) as FileSystem;

process.exitCode = await runGroupNames(process.argv.slice(2), {
  readText: (path) => fileSystem.readFile(path, "utf8"),
  writeText: (path, text) => fileSystem.writeFile(path, text, "utf8"),
  environment: process.env,
  print: (line) => console.log(line),
  createClient: (apiKey) => new Anthropic({ apiKey }),
  today: () => new Date().toISOString().slice(0, 10),
});
