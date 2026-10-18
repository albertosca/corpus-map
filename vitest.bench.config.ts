import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same alias as vitest.config.ts: the demo App the commit bench mounts
  // imports values from "corpus-map", which must resolve to the live src/.
  resolve: { alias: { "corpus-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  // Verbose so the bench's printed median shows up in CI logs even when it
  // passes; the default reporter hides stdout of passing tests.
  test: { environment: "node", include: ["bench/**/*.test.{ts,tsx}"], reporters: ["verbose"] },
});
