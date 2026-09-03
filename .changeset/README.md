# Changesets

Every pull request that changes the published package should include a changeset:

```sh
bun run changeset
```

Documentation, tests, and internal maintenance may use an empty changeset when the
release workflow does not need a package version bump.
