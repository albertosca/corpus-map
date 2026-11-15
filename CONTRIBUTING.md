# Contributing

Thank you for looking. Issues and pull requests are welcome; for anything larger than a fix, please open an issue first so we can agree on the shape before you spend time on it.

## Getting set up

```
npm ci
npm test          # Vitest, with the coverage gate (90% lines, 85% branches)
npm run lint      # Biome, then ESLint with zero warnings allowed
npx tsc --noEmit
npm run dev       # the demo
```

`CLAUDE.md` and `ARCHITECTURE.md` at the repository root explain how the code is organised, the rule that keeps the pure code apart from React, and what each gate checks.

## What a change needs

- A test that fails without the change. Tests sit next to the code they cover.
- The checks above green, and `npm run build` followed by `npm run api:check`. A public type change is accepted with `npm run api:update` and reviewed in the diff.
- A changeset (`npx changeset`) for any change a consumer would notice.
- Names written out in full (`index`, `error`, `options`), in code, comments and commit messages in English.

## Conduct

Be kind and assume good faith. Harassment is not welcome here.
