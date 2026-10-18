import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors vite.demo.config.ts's own alias: without it, a demo file that
  // imports a *value* (not just a type) from "corpus-map" resolves through
  // this package's own package.json "exports" self-reference to the built
  // dist/corpus-map.js instead of the live src/ -- coverage then attributes
  // to the bundle (and can silently run against a stale build). Only demo
  // code that imports a value, not a type, from "corpus-map" is affected;
  // nothing under src/ or test/ ever imports the package by its own name.
  resolve: { alias: { "corpus-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // The default 5 s is a hang detector, not a performance gate (the bench
    // is). The painted arXiv sweep takes ~1 s alone and failed 5 s when the
    // whole suite shared a loaded machine (2026-10-17); 15 s keeps hangs
    // detectable without failing on contention.
    testTimeout: 15_000,
    // Vitest does not honour .gitignore, so a worktree checked out under
    // .claude/worktrees/ would have its whole suite run a second time from
    // here - and fail, since it resolves against this checkout's config.
    exclude: ["bench/**", "node_modules/**", "dist/**", "**/.claude/**", "**/.superpowers/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["fixtures/**"],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
