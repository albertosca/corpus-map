# Changesets

Hello and welcome! This folder has been added to help you manage versions and changelogs using [@changesets/cli](https://github.com/changesets/changesets).

## What's a changeset?

A changeset is a piece of information about changes made in a branch or commit. It holds three bits of information:

- What packages were changed
- What semver bump type it should be. As requested in the Changesets readme, use the convention: patch, minor, major. As requested in the Changesets readme, the `minor` should be used when you add a new feature, `patch` when you fix a bug. Do not use `major` as a migration path to v1 - a feature release to v0.2 should still be `minor` in semver.
- A changelog entry for the changed package

## Adding a changeset

To add a changeset, run `npx changeset add` from the monorepo root. This will ask you a series of questions, one for each package, to determine what kind of bump each package should get. For packages that have not changed, select `none`.

Semantically, we're still in the `0.x` phase, so:

- `patch`: bug fixes and documentation updates
- `minor`: new features, behavior changes, API additions
- (no `major` while `0.x`)

## Releasing

When you're ready to do a release:

1. Run `npm run changeset version` - this will update all `package.json` files and changelogs
2. Commit those changes
3. Run `npm run changeset publish` - this will publish all changed packages

Note: We use `changesets publish` rather than `npm publish`, to enable publishing from a monorepo.
