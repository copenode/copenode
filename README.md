# copenode

**Architectural foundation and node orchestration platform.**
**Autonomy engineered around systemic stability.**

<!-- Replace badges once CI + first publish exist -->
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status: experimental](https://img.shields.io/badge/status-v0%20experimental-orange.svg)](#status)
[![npm](https://img.shields.io/npm/v/@copenode/core.svg)](https://www.npmjs.com/package/@copenode/core)

copenode is the policy spine beneath heterogeneous agent nodes — assistant gateways, coding-agent fleets, schedulers, sandboxes, machines. Nodes declare identity, trust, and budget; copenode routes work to them, meters every action, and contains every blast radius.

**First integration:** the bridge between [OpenClaw](https://github.com/openclaw/openclaw) — the open-source assistant living in your WhatsApp, Telegram, and Discord — and [Paseo](https://github.com/getpaseo/paseo) — the open-source environment running Claude Code, Codex, and OpenCode in parallel git worktrees on your machines.

The result: a message from a colleague becomes a sandboxed coding agent on your VPS, and the diff comes back to the chat thread.

```
 WhatsApp ──▶ OpenClaw Gateway ──▶ copenode ──▶ Paseo daemon
                (channels,                  (bridge,      (worktrees, swarms,
                 pairing, people)            metering)     schedules, review)
                                   ◀──────────────────────
                        "Done. 2 files changed. $0.42 on Alice's cap."
```

## Why

Agent nodes are everywhere — assistant gateways, coding-agent fleets, schedulers, sandboxes — but each is an island with its own identity model, trust assumptions, and cost exposure. No shared foundation answers the questions that decide whether autonomy is safe to grant: *who asked, what are they allowed to reach, how much may it cost, and how bad can it get?*

copenode is that foundation, built thin: a core of identity, trust tiers, routing policy, and metering — with adapters that bring existing nodes (OpenClaw, Paseo, more to come) under one spine. No forks. No monolith. Nodes stay sovereign; the platform stays small.

## Doctrine

- **Autonomy is the goal.** Agents should act without waiting for you.
- **Stability is what buys it.** Every grant of autonomy ships with a systemic bound.
- **Trust is tiered, not binary.** `owner` / `sender` / `system` → worktree / sandbox / sandbox. Prompts you didn't type never run unsandboxed.
- **Every action is metered.** Identity makes cost attributable; budgets make it finite.
- **Nodes stay sovereign.** copenode orchestrates nodes; it does not replace them.

## Features

- **Bridge** — your OpenClaw assistant drives Paseo agents first-class: spawn into workspaces, steer, collect results. Paseo permission requests surface as approval cards in chat. Worktree diffs post back to the originating thread.
- **Per-sender metering & budgets** — other people's prompts burn *your* credits. copenode tracks usage per sender, per channel, per agent, with soft caps and alerts before your Claude subscription becomes a communal resource.
- **Sandbox routing** — prompts you didn't type route to sandboxed workspaces ([workspace-sandbox](https://paseo.sh/plugins) compatible): container/microVM isolation, task-scoped keys, folder-scoped visibility.
- **Delivery policies** *(roadmap)* — quiet hours, digests, and NO_REPLY semantics for agent notifications, borrowed from OpenClaw's automation model.

## The flow it buys you

> Alice (on your team, in your WhatsApp) sends: *"can you fix the flaky login test?"*
>
> → OpenClaw pairs her to a restricted agent
> → copenode creates a sandboxed Paseo workspace + worktree
> → the agent runs the fix under a cheap worker model
> → permission request appears in the thread; Alice approves
> → diff summary lands in the thread
> → metering ledger records `$0.42` against Alice's monthly cap

## Install

> ⚠️ **Status: pre-release.** The packages below are the intended distribution shape; see [Status](#status) for what exists today.

**Paseo side** (the engine):

```bash
paseo plugin add copenode/paseo-plugin
```

**OpenClaw side** (the front door):

```bash
openclaw plugin install @copenode/openclaw-plugin
```

**Wire them** — in `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    "copenode-bridge": {
      paseo: { host: "127.0.0.1:6767" },          // your Paseo daemon
      route: {
        untrustedSenders: "sandbox",               // others' prompts → isolated workspaces
        trustedSenders: "worktree",                // yours → plain worktrees
      },
      metering: { perSender: true, softCapUsd: 10 },
    },
  },
}
```

Credentials never move: each daemon keeps its own keys; sandboxed agents get short-lived, task-scoped ones.

## How it works

copenode is a plugin pair around a shared core:

```
copenode/
├── packages/core/            # bridge protocol, metering ledger, policy engine
├── packages/paseo-plugin/    # daemon-side: workspace lifecycle, sandbox hooks, usage events
└── packages/openclaw-plugin/ # gateway-side: channel tools, approval cards, diff rendering
```

- The OpenClaw plugin exposes agent tools (`copenode_spawn`, `copenode_send`, `copenode_collect`) to your assistant.
- The Paseo plugin handles workspace creation (worktree or sandbox), subscribes to finish/permission events, and emits usage.
- The core maps identities (channel sender ↔ Paseo labels), enforces routing policy, and keeps the metering ledger.

**Trust model:** prompts *you* type run with your authority, supervised, in normal worktrees. Prompts from *anyone else* — or from schedules, or from internet content — land in sandboxed workspaces with scoped credentials and egress limits. No `docker.sock`, ever.

## Status

| Capability | State |
| --- | --- |
| Monorepo + plugin scaffolds | 🚧 in progress |
| Bridge: spawn/steer/collect from chat | 🚧 in progress |
| Approval cards in channel | 📋 next |
| Per-sender metering + budgets | 📋 next |
| Sandbox routing policy | 📋 planned |
| Delivery policies (quiet hours, digests) | 📋 planned |

Early, honest, moving. Issues and PRs welcome — including "here's the flow I want" feature requests; they shape the roadmap.

## Related & credits

- [OpenClaw](https://github.com/openclaw/openclaw) — assistant gateway (MIT)
- [Paseo](https://github.com/getpaseo/paseo) — agentic dev environment (Apache-2.0)
- [paseo-im](https://github.com/ClarePhang/paseo-im) — direct IM-channel bridge for Paseo; a different (also valid) seam
- `bendavid/workspace-sandbox` — the sandbox execution copenode routes to

copenode is an independent project, not affiliated with OpenClaw or Paseo.

## Community

- **Web:** [copenode.com](https://copenode.com)
- **GitHub:** [github.com/copenode](https://github.com/copenode)
- **X:** [@copenodesys](https://x.com/copenodesys)
- **Discord:** `discord.gg/copenode` *(invite coming with v0)*

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities to [security@copenode.com](mailto:security@copenode.com).

## License

[MIT](LICENSE) © 2026 copenode contributors
