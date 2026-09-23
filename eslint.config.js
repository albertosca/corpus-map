import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";

// ESLint here carries only React rules; Biome owns style and everything
// else. TypeScript 7 has no JavaScript API, so typescript-eslint cannot
// parse; Babel's parser reads the syntax, which is all the hooks rules need.
export default [
  {
    ignores: [
      "api/**",
      "dist/**",
      "dist-demo/**",
      "coverage/**",
      "node_modules/**",
      "**/.claude/**",
      ".superpowers/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: ["@babel/preset-typescript", ["@babel/preset-react", { runtime: "automatic" }]],
        },
      },
    },
  },
  { files: ["**/*.{ts,tsx}"], ...reactHooks.configs.flat["recommended-latest"] },
  { files: ["**/*.{ts,tsx}"], rules: { "react-hooks/exhaustive-deps": "error" } },
  {
    // Pure logic: anything in src/ that is neither a component (.tsx) nor a
    // hook (use*.ts) must not reach for React or the DOM.
    files: ["src/**/*.ts"],
    ignores: ["src/**/use*.ts", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: ["react", "react-dom"], patterns: ["react/*", "react-dom/*"] }],
      "no-restricted-globals": ["error", "window", "document"],
    },
  },
];
