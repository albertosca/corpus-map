import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same alias as vitest.config.ts: the demo App the commit bench mounts
  // imports values from "corpus-map", which must resolve to the live src/.
  resolve: {
    alias: [
      {
        find: /^corpus-map\/assistant$/,
        replacement: fileURLToPath(new URL("./src/assistant/index.ts", import.meta.url)),
      },
      {
        find: /^corpus-map\/filter$/,
        replacement: fileURLToPath(new URL("./src/filter/index.ts", import.meta.url)),
      },
      {
        find: /^corpus-map\/theme-check$/,
        replacement: fileURLToPath(new URL("./src/theme-check/index.ts", import.meta.url)),
      },
      { find: /^corpus-map\/search$/, replacement: fileURLToPath(new URL("./src/search/index.ts", import.meta.url)) },
      { find: /^corpus-map$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
    ],
  },
  // Verbose so the bench's printed median shows up in CI logs even when it
  // passes; the default reporter hides stdout of passing tests.
  // `testTimeout` 30 s: the commit bench mounts arXiv several times and ran
  // 6-8 s under load, past the 5 s default; the budgets live in the assertions.
  test: { environment: "node", include: ["bench/**/*.test.{ts,tsx}"], reporters: ["verbose"], testTimeout: 30_000 },
});
