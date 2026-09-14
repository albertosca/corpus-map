import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  resolve: { alias: { "corpus-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
});
