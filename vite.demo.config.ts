import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  resolve: { alias: { "corpus-map": fileURLToPath(new URL("./src/index.ts", import.meta.url)) } },
  // The output sits outside `root`, which Vite does not empty by default:
  // stale hashed bundles piled up in dist-demo/assets. `license` writes the
  // notices of the bundled dependencies (React's MIT licence) to
  // `.vite/license.md`, since the demo ships React inside its bundle.
  build: { outDir: "../dist-demo", emptyOutDir: true, license: true },
});
