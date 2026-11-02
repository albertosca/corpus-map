import { resolve } from "node:path";
import { defineConfig } from "vite";

// The second entry, `corpus-map/search`, is its own build so it stays one
// self-contained file: a shared chunk with the main entry would make
// `dist/corpus-map.js` import a sibling and change what its size means.
// It runs after the main build and must not empty `dist`.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/search/index.ts"),
      name: "CorpusMapSearch",
      fileName: "search",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
