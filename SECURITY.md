# Security Policy

copenode runs as a plugin inside [Paseo](https://github.com/getpaseo/paseo)
daemons and [OpenClaw](https://github.com/openclaw/openclaw) gateways — on
machines that also hold your agent credentials. We take that seriously.

## Reporting a vulnerability

**Email:** [security@copenode.com](mailto:security@copenode.com)

Please include reproduction steps, affected package and version, and impact.
We aim to acknowledge within 48 hours and will coordinate disclosure and
patch releases with you. Please do not open public issues for vulnerabilities.

## Scope

- `@copenode/core`, `@copenode/paseo-plugin`, `@copenode/openclaw-plugin`
  (published and in this repository's `packages/`)

## Design commitments

- Credentials stay with the host daemons; copenode never proxies or stores
  provider keys.
- Sandboxed routing: prompts from non-owner senders and system sources are
  routed to isolated workspaces by default.
- No `docker.sock` or host-level privileged access from plugin code.

## Trust guidance

Treat every plugin — ours included — as code running with your agent's
authority. Pin versions, review diffs on update, and publish/verify via
npm provenance attestations.
