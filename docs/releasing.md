# Releasing visura-parser

Releases use npm trusted publishing from GitHub Actions. npm authenticates the
`release.yml` workflow through OpenID Connect, so neither `NPM_TOKEN` nor
`NODE_AUTH_TOKEN` needs to be stored in GitHub. A maintainer owns the first
publication and reviews subsequent release pull requests.

## One-time setup

### Repository metadata

The package metadata points to the public GitHub repository:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/LorenzoYeKai/visura-parser.git"
  }
}
```

The pack job checks this metadata against the running GitHub repository because
npm provenance requires the two to match.

### First publication, only if the package does not exist yet

Trusted publisher settings belong to an existing npm package. If you have not
published `visura-parser` yet, a maintainer must publish its first real version
from their machine. Confirm the name is available and review the version in
`package.json`, then run:

```sh
bun run check
npm login
npm publish --access public
```

Complete npm's browser login and two-factor authentication prompts. npm is used
here for the registry operation; Bun still installs dependencies and runs the
project scripts. This does not create an npm lockfile.

Publishing does not consume pending changesets. Review them before the next
automated release: a `major` changeset against `0.1.0` proposes `1.0.0`, even if
the package is still new. Inspect the proposed versions with
`bun run changeset status`.

### GitHub settings

1. Under **Settings → Actions → General**, allow GitHub Actions to create and
   approve pull requests. The workflow uses GitHub's automatic token to open
   the release PR and create release tags.
2. Under **Settings → Environments**, create an environment named exactly
   `npm`. Restrict its deployment branches to `main`.
3. Protect `main` with pull request reviews and required CI checks. Keep write
   access limited to maintainers who can approve releases.

No npm secrets or repository variables are required. Review any organization
policies that prevent Actions from creating pull requests or using the pinned
actions.

### npm trusted publisher

Open the `visura-parser` package on npm, then **Settings → Trusted publishing**.
Add a GitHub Actions publisher with these values:

| Setting           | Value                                       |
| ----------------- | ------------------------------------------- |
| Organization/user | `LorenzoYeKai`                              |
| Repository        | `visura-parser`                             |
| Workflow filename | `release.yml`                               |
| Environment name  | `npm`                                       |
| Allowed actions   | Enable direct publishing with `npm publish` |

Use only the workflow filename, not `.github/workflows/release.yml`. The
environment name must match GitHub exactly. This workflow publishes directly
after the release PR is merged; a publisher configured only for
`npm stage publish` will not work with it.

After the first successful automated publication, set the package's publishing
access to **Require two-factor authentication and disallow tokens**, revoke
unused npm publishing tokens, and remove any old `NPM_TOKEN` or
`NODE_AUTH_TOKEN` secrets. Trusted publishing continues to work when traditional
tokens are disallowed.

## Normal release flow

1. For a package change, run `bun run changeset` and commit the generated file
   alongside the code. Select the intended patch, minor, or major bump.
2. Merge the change into `main`.
3. The Release workflow runs the complete CI suite, including Node 20, 22, and
   24 runtime checks, then creates or updates `chore: release visura-parser`.
4. Review the proposed version and changelog, then merge the release PR.
5. The next Release run checks the merged commit, builds and packs the package,
   and publishes that artifact to npm. It also creates the Git tag and GitHub
   release. npm adds provenance for a public package from a public repository.

A push with neither pending changesets nor unpublished versions stops after
the checks and release decision. A version in `package.json` that is not yet
on npm can be published even without a newly merged release PR, so treat
manual version edits on `main` as release changes.

GitHub may hold CI for the generated release PR in an approval-required state.
If its checks are waiting, a maintainer with write access should select
**Approve workflows to run** in the PR merge box before reviewing the results.

## How the jobs are separated

`ci.yml` runs on pull requests and is reused by `release.yml` on pushes to
`main`. Release decisions wait for all of those checks.

The release workflow has separate jobs for deciding what to release, updating
the release PR, packing, and publishing. Only the last job has
`id-token: write`, which enables npm authentication. The version job has
permission to update pull requests; the publish job can create tags and GitHub
releases. Checkout does not persist Git credentials.

The package is built in the pack job without publishing credentials. Changesets
uploads the tarball and its publish plan, then the publish job downloads that
specific artifact. Dependency lifecycle scripts and npm lifecycle scripts are
disabled in the publish job; validation and builds have already completed.
Release jobs do not restore dependency caches.

Bun remains pinned by `packageManager` for dependency installation. Changesets
CLI 3 uses npm to publish, and its matching GitHub Action is v2. Node 24 supplies
an npm version with trusted publishing support; npm requires at least 11.5.1.
Third-party actions are pinned to commit hashes, with Dependabot proposing
weekly updates for review.

## Failed releases

Inspect the failed job in the GitHub Actions tab. Missing repository metadata
fails in `pack`; an authentication failure usually means the npm publisher's
owner, repository, workflow filename, environment, or allowed action differs
from this setup.

After correcting external settings, rerun the failed workflow from GitHub.
After correcting code, merge the fix and let the next push run the workflow.
Do not bump the version just to retry an upload that never succeeded. Check
the npm package page first if a run failed after publishing.

## References

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Changesets release automation](https://changesets.dev/guide/automating)
- [Changesets Action v2](https://github.com/changesets/action/tree/v2.1.1)
- [GitHub workflow triggers and the automatic token](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
