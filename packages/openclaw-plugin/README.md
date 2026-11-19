# @copenode/openclaw-plugin

copenode's front door for [OpenClaw](https://github.com/openclaw/openclaw):
chat messages become **governed** Paseo spawns.

The plugin never decides policy. It attests the requester
(`requesterSenderId` comes from OpenClaw's trusted runtime context), relays
the spawn to the spine's ingress with the shared token, and relays the
verdict back into the thread — accepted runs name their tier and isolation;
refusals name the rule that caused them.

Two agent tools:

- **`copenode_spawn`** — spawn a governed Paseo workspace for the requester
- **`copenode_status`** — spine health + ledger-chain verification

## Configure

The token and ingress URL come from the same operator files the spine uses:

- token: `~/.paseo/copenode/token` (print with `npx copenode token show`)
- ingress: `http://127.0.0.1:6789` (override with `COPENODE_INGRESS`)

## Status

**Phase 2 scaffold.** The wire contract and verdict formatting are complete
and tested; OpenClaw bring-up (install, pairing, E2E) is the next milestone.
Validation follows OpenClaw's own recommended path: `npm pack` →
`openclaw plugins install npm-pack:<tarball>` against a pinned host version.

MIT. See the [monorepo](https://github.com/copenode/copenode) for status.
