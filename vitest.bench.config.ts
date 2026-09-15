import { defineConfig } from "vitest/config";

export default defineConfig({
  // Verbose so the bench's printed median shows up in CI logs even when it
  // passes; the default reporter hides stdout of passing tests.
  test: { environment: "node", include: ["bench/**/*.test.ts"], reporters: ["verbose"] },
});
