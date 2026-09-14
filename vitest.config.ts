import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["bench/**", "node_modules/**", "dist/**"],
    coverage: { provider: "v8", reporter: ["text", "lcov"], lines: 90, branches: 85 },
  },
});
