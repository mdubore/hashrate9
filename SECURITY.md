# Security policy

## Reporting a vulnerability

Hashrate Autopilot for StartOS is a Bitcoin tool, so security reports
need careful handling. **Please don't post exploits, suspected
vulnerabilities, or anything that could enable an attack against
another operator's funds in public issues, public discussions, pull
requests, or any public channel.**

Use one of these instead:

- **GitHub's private vulnerability reporting feature.** From this
  repo's Security tab, click "Report a vulnerability." That opens a
  private channel with the same workflow as a normal issue but
  invisible to anyone else. Preferred.

Confirmed vulnerabilities are handled through a private patch followed
by a public release and changelog note. Credit is included when the
reporter wants it.

There is no service-level agreement. If a critical report does not get
a response after a reasonable interval, open a non-exploit public
issue asking whether the private report was received.

## What's in scope

- The StartOS package wrapper, manifest, dependencies, backup hooks,
  and install instructions.
- The daemon and dashboard code in this repository when used by the
  StartOS package.
- The setup wizard and secret-handling paths in this repository.
- Documentation in this fork that could lead operators to unsafe
  configuration.

## What's out of scope

- Vulnerabilities in upstream dependencies that aren't reachable in
  any default code path - report those directly to the dependency.
- The upstream Docker image, upstream Umbrel community-store package,
  or upstream release process unless the issue is caused by this fork's
  downstream changes.
- Misconfiguration of an operator's own environment (publicly
  exposing the dashboard without a reverse proxy, weak passwords on
  the wizard step, etc.). The default Umbrel install routes through
  `app_proxy` and is fine; deliberately bypassing that is on you.
- The Braiins Hashpower API itself, the Ocean pool, or any other
  third-party service the autopilot consumes - report those to their
  respective vendors.
- Forks derived from this repository. If a separate fork has a
  vulnerability, contact that fork's maintainer.

## Coordinated disclosure

If you'd like a CVE assigned, GitHub's vulnerability advisories can do
that as part of the private flow. Otherwise the fix ships as a patch
with a changelog note.
