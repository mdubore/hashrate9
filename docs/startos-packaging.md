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

## Maintenance expectations

- Match StartOS SDK patterns already used in this repository.
- Keep public package metadata pointed at this downstream repo, while preserving `upstreamRepo` as
  `rdouma/hashrate-autopilot`.
- Keep operator-facing copy concise and explicit about DRY-RUN mode, live bid risk, dependencies, and backups.
- Verify package builds after changing manifest, dependency, init, backup, Dockerfile, or Makefile behavior.
