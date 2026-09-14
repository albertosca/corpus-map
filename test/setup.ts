import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas 2D implementation and writes "Not implemented:
// HTMLCanvasElement.prototype.getContext" to stderr on every call. Stub it
// to return null instead of letting jsdom's path run — CorpusMap already
// handles a null context (`if (!ctx) return;`), so this removes the noise
// at its source rather than muting it.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(cleanup);
