import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same alias as vitest.config.ts: the demo App the commit bench mounts
  // imports values from "corpus-map", which must resolve to the live src/.
  resolve: { alias: { "corpus-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  // Verbose so the bench's printed median shows up in CI logs even when it
  // passes; the default reporter hides stdout of passing tests.
  // `testTimeout` 30 s: the commit bench mounts arXiv several times and ran
  // 6-8 s under load, past the 5 s default; the budgets live in the assertions.
  test: { environment: "node", include: ["bench/**/*.test.{ts,tsx}"], reporters: ["verbose"], testTimeout: 30_000 },
});
