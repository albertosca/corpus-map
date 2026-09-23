import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Vitest does not honour .gitignore, so a worktree checked out under
    // .claude/worktrees/ would have its whole suite run a second time from
    // here - and fail, since it resolves against this checkout's config.
    exclude: ["bench/**", "node_modules/**", "dist/**", "**/.claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["fixtures/**"],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
