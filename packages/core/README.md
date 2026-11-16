# @copenode/core

Shared core for [copenode](https://copenode.com) — the bridge between
[OpenClaw](https://github.com/openclaw/openclaw) (chat assistant gateway) and
[Paseo](https://github.com/getpaseo/paseo) (coding-agent orchestration).

Holds the pieces both plugins share:

- **Identity mapping** — channel sender ↔ stable Paseo label (metering key)
- **Routing policy** — trust tiers → workspace isolation (worktree vs sandbox)
- **Metering ledger** — per-sender usage and budgets *(growing)*

```js
import { senderToLabel, routingFor } from "@copenode/core";

const label = senderToLabel({ channel: "whatsapp", senderId: "+15550100" });
// -> "oc/whatsapp/+15550100"

routingFor("sender"); // -> { isolation: "sandbox", scopedCredentials: true }
```

MIT. Early — see the [monorepo](https://github.com/copenode/copenode) for status.
