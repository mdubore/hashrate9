# {{RELEASE_TITLE}}

StartOS package release for Hashrate Autopilot `{{RELEASE_VERSION}}`.

## Artifacts

- `hashrate-autopilot-9_x86_64.s9pk` for x86_64 StartOS servers.
- `hashrate-autopilot-9_aarch64.s9pk` for ARM64 StartOS servers.
- `SHA256SUMS` for artifact verification.

## Install

Download the `.s9pk` for your StartOS server architecture, sideload it in StartOS, and complete setup from the service interface. Keep the app in DRY-RUN until the Status page and pool destination look correct.

## Notes

- Tag: `{{RELEASE_TAG}}`
- The package declares Bitcoin, Electrs, and Datum Gateway as required StartOS dependencies.
- Review `CHANGELOG.md` and the README install section before publishing this draft release.
