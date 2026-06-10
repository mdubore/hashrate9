# StartOS Packaging Notes

This document records the local packaging conventions for maintaining the Hashrate Autopilot StartOS service.

## Primary references

Use the official StartOS packaging guide as the source of truth. If a local checkout of the docs exists, start with
`start-docs/packaging/src/SUMMARY.md` and open only the sections needed for the current change. Otherwise, use the
published packaging documentation at `https://docs.start9.com/packaging/`.

## Local package files

- `startos/manifest/index.ts` - package identity, dependency declarations, alerts, volumes, and image build.
- `startos/manifest/i18n.ts` - StartOS short and long descriptions.
- `startos/dependencies.ts` - dependency configuration and health integration.
- `startos/backups.ts` - backup and restore behavior for persistent state.
- `startos/init/index.ts` - runtime initialization before the daemon starts.
- `instructions.md` - install-time operator instructions shown by StartOS.
- `Makefile` and `s9pk.mk` - convenience targets around `start-cli s9pk pack`.
- `.github/release-profile.env` - GitHub release profile consumed by the local `publishing-github-releases` Codex skill.
- `scripts/release-github.sh` - wrapper around the reusable release skill for StartOS package releases.

## Maintenance expectations

- Match StartOS SDK patterns already used in this repository.
- Keep public package metadata pointed at this downstream repo, while preserving `upstreamRepo` as
  `rdouma/hashrate-autopilot`.
- Keep operator-facing copy concise and explicit about DRY-RUN mode, live bid risk, dependencies, and backups.
- Verify package builds after changing manifest, dependency, init, backup, Dockerfile, or Makefile behavior.

## GitHub release workflow

StartOS package releases attach both architecture-specific `.s9pk` files and a checksum file:

- `hashrate-autopilot-9_x86_64.s9pk`
- `hashrate-autopilot-9_aarch64.s9pk`
- `SHA256SUMS`

Use the release wrapper from the repo root:

```bash
pnpm run release:dry-run
```

After reviewing the generated artifacts and notes, publish a draft release:

```bash
pnpm run release:github
```

The wrapper delegates to the reusable `publishing-github-releases` Codex skill. Override
`GITHUB_RELEASE_SKILL_DIR` only when testing a local copy of that skill.
