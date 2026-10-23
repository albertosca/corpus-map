import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library waits 1 s by default in findBy/waitFor; under a loaded
// machine the demo App's first render overran it (2026-10-23), failing a
// test that passed alone. 5 s stays well inside the 15 s testTimeout.
export const ASYNC_QUERY_TIMEOUT = 5_000;
configure({ asyncUtilTimeout: ASYNC_QUERY_TIMEOUT });

// jsdom has no canvas 2D implementation and writes "Not implemented:
// HTMLCanvasElement.prototype.getContext" to stderr on every call. Stub it
// to return null instead of letting jsdom's path run — CorpusMap already
// handles a null context (`if (!ctx) return;`), so this removes the noise
// at its source rather than muting it.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(cleanup);
