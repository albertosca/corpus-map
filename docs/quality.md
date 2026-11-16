# Quality gates

What CI enforces, and where each number comes from.

## Coverage

- Thresholds of 90% lines and 85% branches are enforced inside the `test` job (`npm test`).
- The coverage badge on the README is written by this repository's own CI from the lcov report the tests just produced. No third-party service is involved.
- The lcov report is also published as a CI artifact on every run.
- On every push to `main` the badge is written to the `badges` branch (never to `main` itself), so required checks on `main` do not block the CI bot.

## Other gates

| Command | What it checks |
|---|---|
| `npm run lint` | Biome, then ESLint with zero warnings |
| `npx tsc --noEmit` | Types |
| `npm run build` | The build must leave `dist/index.d.ts` |
| `npm run api:check` | The public type surface against the committed snapshot in `api/` |
| `npm run size` | Gzipped size of each entry against its ceiling in `package.json` |
| `npm run bench` | Painter CPU cost, see [Performance](concepts.md#performance) |

Contributor-level notes on the code layout and how to add a feature are in [ARCHITECTURE.md](../ARCHITECTURE.md).
