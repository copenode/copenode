# @copenode/core

Shared core for [copenode](https://copenode.com) — the policy spine beneath
agent nodes. First integration: bridging [OpenClaw](https://github.com/openclaw/openclaw)
(chat assistant gateway) to [Paseo](https://github.com/getpaseo/paseo)
(coding-agent orchestration).

Holds the whole center, on purpose:

- **Identity mapping** — channel sender ↔ stable node label (metering key)
- **Routing policy** — trust tiers → workspace isolation (worktree vs sandbox)
- **Metering ledger** — one event spine, three lenses: cost, trail, evals

## Trust

```js
import { senderToLabel, routingFor } from "@copenode/core";

const label = senderToLabel({ channel: "whatsapp", senderId: "+15550100" });
// -> "oc/whatsapp/+15550100"

routingFor("sender"); // -> { isolation: "sandbox", scopedCredentials: true }
```

## Ledger

Append-only, hash-chained. Every entry attributes *who asked, what policy
allowed, what it cost, what came back*. Evals are new entries referencing the
run they judge — late truth lands as new truth, never as an edit. Refusals are
recorded and carry the rule that caused them.

```js
import { createLedger, jsonlStore } from "@copenode/core";

const ledger = createLedger({ store: jsonlStore("./ledger.jsonl") });

const run = ledger.record({
  identity: { sender: "oc/whatsapp/+15550100", tier: "sender", agent: "paseo/main" },
  decision: { verdict: "allow", rule: "allowlisted" },
  action: { kind: "run", target: "paseo:workspace-7" },
  cost: { tokens: 1200, dollars: 0.004, durationMs: 41_000 },
  outcome: { status: "ok", artifactRef: "diff:abc123" },
});

ledger.attachEval(run.id, { judge: "mechanical", verdict: "tests-pass" });
ledger.attachEval(run.id, { judge: "human", verdict: "approve", score: 5 });

ledger.trail({ sender: "oc/whatsapp/+15550100" }); // the attribution query
ledger.verify(); // -> { ok: true, entries: 3 }
```

Judges are `mechanical` (tests, lint, schema), `model` (rubrics), or `human`
(the approval card). The ledger never judges — it guarantees attribution,
integrity, and late truth.

MIT. See the [monorepo](https://github.com/copenode/copenode) for status.
