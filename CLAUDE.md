# corpus-map — working notes

- `npm test` — Vitest with an enforced, canaried coverage gate (lines 90 / branches 85); excludes `bench/**` and `**/.claude/**` on purpose (Vitest does not honour `.gitignore`, and a worktree under `.claude/` would run the suite twice).
- `npm run bench` — the painter benchmark under its own `vitest.bench.config.ts`; CI runs it as a separate job so the badge is real. Budget 16 ms is a stated target; the measured median is ~3 ms locally.
- `npm run lint` (Biome), `npx tsc --noEmit`, `npm run build` — the build must leave `dist/index.d.ts`; CI asserts the file exists (`tsconfig.build.json` scopes emit to `src`; the root tsconfig would emit `dist/src/…`).
- `npm run dev` / `npm run build:demo` — the demo through `vite.demo.config.ts`, alias `corpus-map` → `src/index.ts`; the gallery ships elements and stars, never food.
- Gotchas: `@types/react` 19 has no global `JSX` (return `ReactElement`); TypeScript 7 has no `baseUrl` (`paths` only); Testing Library cleanup and the jsdom `getContext` stub live in `test/setup.ts` (no `globals: true`); the card overlay is `inert`, so cards cannot own click handlers — selection is a hit-test on the surface; wheel zoom is a native non-passive listener, never React `onWheel`.
- Docs: spec in `docs/superpowers/specs/`, the living plan with every deviation noted, `BACKLOG.md` (label decluttering at the far regime comes first), `GOING-PUBLIC.md`, `docs/coverage-badge.md`.
