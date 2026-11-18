# @copenode/paseo-plugin

copenode's daemon side for [Paseo](https://github.com/getpaseo/paseo).

Every inbound message walks the spine before it touches a workspace:

```
classify (who)  ->  budget (how much)  ->  routing (where)  ->  ledger (record)
```

- **Owner labels** → plain worktrees, your authority, alert-only budgets
- **Allowlisted sender labels** → sandboxed workspaces, hard budget caps
- **Everyone else** → refused, recorded with the rule

Exposes a loopback HTTP ingress (`POST /spawn`, `GET /health`) that
[`@copenode/openclaw-plugin`](https://www.npmjs.com/package/@copenode/openclaw-plugin)
posts to. The metering ledger is a local append-only, hash-chained JSONL file
— see [`@copenode/core`](https://www.npmjs.com/package/@copenode/core).

**Status: Phase 2 scaffold.** The decision path is complete and tested; the
workspace seam (`server/workspace.ts`) is wired for the Paseo SDK in the lab
and throws `NOT_IMPLEMENTED` until then. `paseo-plugin.json` will be
reconciled against the canonical `paseo plugin init` manifest during lab
bring-up.

## Configure (env, for now)

```bash
COPENODE_PORT=6789
COPENODE_LEDGER=./copenode-ledger.jsonl
COPENODE_LIMIT=2                    # dollars / sender / 24h
COPENODE_OWNERS=oc/whatsapp/+33612345678
COPENODE_SENDERS=oc/whatsapp/+1555000222,oc/telegram/alice
COPENODE_PROVIDER=opencode
COPENODE_MODEL=opencode-go/kimi-k3
```

`provider` is the Paseo agent provider (`opencode`); `model` selects the
OpenCode model inside it. OpenCode Go models use the `opencode-go/` prefix
(for example `opencode-go/kimi-k3`) and require the OpenCode Console
credential in the daemon's OpenCode install.

MIT. See the [monorepo](https://github.com/copenode/copenode) for status.
