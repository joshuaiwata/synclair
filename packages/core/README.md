# @synclair/core

The machinery half of the north-star split (`docs/north-star.md`, Phase 3):
the artifact modules (zod schemas, scan-on-write, read-on-read), scanners,
checks, the running-app harness, the MCP server, and the clone lifecycle —
all behind the one `synclair` CLI. The template (hub UI, seed, judgment)
stays vendored per repo; this package is the half that gets fixed by version
bump. `docs/core-boundary.md` records exactly where the line sits.

Published public on npm as `@synclair/core`. The hub root is always the
caller's `process.cwd()` — never derived from `import.meta.url` (PR #74).

## Releasing

Releases publish automatically via npm trusted publishing (GitHub Actions
OIDC — `.github/workflows/release.yml`; no token, no OTP):

1. Bump `version` in `packages/core/package.json` and land it on `main`.
2. Tag that commit `core-v<version>` (e.g. `core-v0.1.1`) and push the tag.
3. The release workflow re-runs the verify gate, checks the tag matches the
   package version, and publishes.
