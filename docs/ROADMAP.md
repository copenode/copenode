# copenode — Roadmap

*The working plan, published. Operator-private notes (numbers, secrets,
strategy drafts) stay in git-ignored local files.*

North star: **the policy spine beneath agent nodes.** Identity, trust, routing,
metering — the gravity that makes autonomous nodes safe to orbit.

## The Essential Test

A feature is essential (Phases 1–3) only if it **creates, protects, or reads
attributed ledger data**: who asked, what was allowed, what it cost, how well
it went. Anything that doesn't touch attribution waits. This single rule keeps
the center light and the wedge sharp.

## Anti-scope (what we will never build)

- A PaaS / deployment platform (Caddy and friends deploy us; we don't deploy)
- Another chat gateway, harness, or agent runtime — nodes stay sovereign
- Our own wire protocol — we ride ACP, MCP, A2A, AG-UI
- A model host / inference layer
- A license wall (MIT forever; meetopenbot's bait-and-close is the anti-pattern)

## Standing guardrails (every phase)

1. **Supply chain** — 2FA everywhere; granular tokens only; rotate `NPM_TOKEN` yearly or migrate to Trusted Publishing and delete it; flip on required-reviewer for the `npm-publish` environment before any second maintainer exists.
2. **PII & secrets** — phone numbers, keys, tokens never in the public repo (operator-private notes live in git-ignored local files); lab credentials are throwaways with provider-side spend caps.
3. **Scope** — the anti-scope list is law; new ideas enter as triggered items, not as work.
4. **Churn budget** — we track which host APIs each adapter touches; a host release that costs us >2 days triggers a seam review (stay on CLI/MCP surfaces, never internals).
5. **Blast radius** — anything that spends money or holds credentials runs scoped/sandboxed; full authority only for prompts the operator typed.

## Lessons imported from others who tried

| Source | Lesson | Our action |
|---|---|---|
| Vibe Kanban (sunset with users) | Monolithic workflow apps churn; layers persist | Spine + adapters, never an app |
| Crystal (vanished) | Stealth = death | Every phase ends installable |
| OpenClaw (394k★) | Chat long-tail is acquisition; renames hurt | Bridge rides its channels; brand discipline |
| Paseo (24k★, solo maintainer) | Daemon+worktrees resonates; internals fragile | Integrate via CLI/MCP only, never internals |
| OpenBot (12.6k★ in 3 mo) | Governance sells; audit-before-action; refusals carry the rule; initiator-aware policy; approval UX | Adopt all five mechanics; stay cross-system where they can't |
| AG-UI 1.0 (Google/MS/Amazon/Oracle) | Spec-first; middleware as integration surface; 31-event taxonomy | Ledger schema is a superset of AG-UI events; middleware = integration #2 |
| meetopenbot | Closing after building community = trust suicide | MIT, no bait |
| nightly-labs/openbot (3k open issues) | Scope sprawl kills | This anti-scope list; phase cut lines |
| OpenShip (oblien) | Catalog = distribution + community templates | Node registry in Phase 4; list daemon in PaaS catalogs later |
| ArtCraft (41k★) | Powerful tools lack governance front doors | The adapter pattern; demo node |
| SST / npm norms | Provenance, tokenless publish | Close CI publish in Phase 1 |

## Phases

### Phase 0 — Foundations ✅ (done)
Names on every squattable registry (npm ×2, GitHub, Docker, crates.io, domain,
X, Discord, **+ Reddit r/copenode — founder-caught, 2026-11-19**); repo, core
stub, CI workflow, docs, Discord, doctrine. `@copenode/core@0.0.x` + meta
published.

### Phase 1 — The Ledger ✅ EXITED 2026-11-18
`@copenode/core@0.1.0` live with provenance (sigstore log 3972923446);
`@copenode/cli@0.1.0` published with provenance (log 3973028451); CI pipe
proven end-to-end. Exit criterion met: simulated runs recorded, chain
verified, 0.1.0 installable with the attestation badge.
The spine becomes real code. Everything else hangs off this.

**Prereqs:** ✅ decisions 1–4 locked · repo + npm org live · CI workflow committed.
Still needed before exit: **npm granular token → `NPM_TOKEN` secret (founder, browser)** — ✅ delivered; 0.1.0 shipped with provenance.

**Scope:**
- **E** `Entry` schema: identity / decision / action / cost / outcome / evals — superset of AG-UI's 8 event families
- **E** ~~Append-only hash-chained store~~ ✅ JSONL + memory, behind a store interface — the swap point
- **E** Close CI trusted publishing → ship `@copenode/core@0.1.0` with provenance
- **→ Trigger-gated: SQLite adapter** — *demoted from E, 2026-11-18.* Needed when (a) the daemon runs long enough that resident history matters (~150MB/yr at 1k actions/day), (b) Phase 4 aggregations want SQL group-bys, or (c) `trail` scans pass ~1M entries. Interface already isolates it; decide `better-sqlite3` vs `node:sqlite` (engines bump) at trigger time
- **M** ~~Budget hook~~ ✅ built 2026-11-18 — `createBudgetGuard`: per-sender rolling cap, alert at 80%, hard block at 100% for sender/system, alert-only for owner; reads the ledger, keeps no counters
- **L** CLI (`copenode trail`), CSV/JSON export; JSONL torn-tail tolerance on load

**Exit:** simulated multi-agent run recorded end-to-end; tamper-check passes;
0.1.0 installable with provenance badge.
**De-risks:** trust curve (provenance), schema churn (AG-UI alignment).
**Learn:** does one schema hold for both hosts' real event shapes?

### Phase 2 — The Bridge (est. 4–6 weeks) — integration #1 🚧 IN PROGRESS
The wedge. WSL lab goes live; both daemons talk through the spine.

**Lab progress (2026-11-18):**
- ✅ Paseo daemon 0.16.2 installed + running (PID-managed, `127.0.0.1:6767`,
  relay OFF, pluginsEnabled ON with explicit permission)
- ✅ `gh` 2.105.0 in lab (user-local, no sudo)
- ✅ `@copenode/paseo-plugin` installed and **running inside the daemon** —
  ingress on `127.0.0.1:6789`, `/health` green, live refusals recorded:
  `oc/telegram/41029`, `oc/whatsapp/+1555000222`, `oc/discord/2001` all
  `sender-not-allowlisted` (default-deny with no labels configured = doctrine
  holding), chain verified, trail read with `@copenode/cli` cross-OS
- ✅ Ledger path stabilized to `~/.paseo/copenode/ledger.jsonl`
- ✅ **FIRST ORBIT (2026-11-18 21:42):** allowed spawn walked the spine —
  classify(owner +33 label) → budget(ok) → route(worktree) → ledger allow →
  `paseo run --provider opencode --new-workspace worktree` → **live agent
  `e137e6e1` created `orbit.txt` in worktree `humane-skunk`** → trail verified
  from Windows via `@copenode/cli`, chain intact. Provider config added to
  config.json (`"provider": "opencode"` — opencode ships a no-auth default
  model, so the demo runs before real credentials land)
- ✅ **FULL LOOP VERIFIED (2026-11-18 22:48):** spawn → finish → mechanical
  eval, all correct on the OpenCode Go subscription
  (`--provider opencode --model opencode-go/glm-5.3-flash`, operator-mandated
  rebuild after the incident-log condition was met — subscription auth exists).
  Two real bugs found and fixed en route: Paseo's `ls` reports tildified
  worktree paths (exec never expands them — the judge was reading an empty
  dir), and `paseo run` prints pretty-printed/mixed JSON (regex extraction).
  Trail grammar complete: spawned → idle/finished → judged, chain intact.
- **Governance v1 (2026-11-19):** policy engine in core
  (`loadPolicy`/`resolveUserGroup`/`decide` — most-specific-match-wins, ties
  break to deny, sandbox is the floor); plugin consults it per spawn;
  refusals name the rule; known-group denials leave deduped `policy-request`
  petitions. Lab policy.json carries the first visible grant:
  owners × coding-fleet → worktree, $2. Owner spawn verified allowed via
  policy; stranger denied via `deny-rule:3`. Reload gate + digest witness =
  next build.
- ⏳ Next: reload gate + `copenode policy authorize` (closes the
  agent-can-reload hole), then OpenClaw front door + WhatsApp registration

### Node readiness track (the rim grows without the center growing)

Latent already: ledger entries are node-neutral (`identity.node/agent`);
the decision path is protocol-agnostic; policy onboards new node types via
rules, not releases. Additions:

- **Node Manifest** (`copenode-node.json`, Phase 2.5): id, agentGroup,
  ingress kind (plugin|http|acp|agui|webhook), attests (senders | self).
  Nodes declare; the spine decides — manifests grant nothing.
- **Node Contract doc** (Phase 2.5): the four-beat adapter loop —
  receive → decide → act → report. paseo-plugin = reference implementation.
- **Leverage adapters**: ACP adapter (one template → the whole 40+ agent
  catalog: Pi, OMP, Gemini, Qwen, Goose…) · AG-UI middleware (Phase 3,
  planned) · gateway-class per channel (token + attestation pattern,
  built with the token gate).
- **Conformance kit** (Phase 4/5): `copenode-node-test` — fake sender,
  assert ledger rows, budget walls, refusal naming. Third-party adapters
  get certified, not eyeballed.

### MCP posture track (governance depth, three layers)

- **Layer 1 — spawn-time posture** (Phase 2.5): bounds gain
  `mcp: "none" | "allowlisted:<set>" | "full"`; the spawn seam maps it to
  Paseo's per-workspace MCP config — sender-tier agents get a restricted
  server list injected. Enforcement at config level. (Verify the exact
  Paseo MCP-config mechanism in the lab first.)
- **Layer 2 — post-hoc tool trail** (Phase 2.5/3): the finish hook
  harvests tool-call facts from `paseo logs <id> --filter tools` (and
  AG-UI `TOOL_CALL_*` once the middleware exists) → `tool_call` ledger
  entries, attributed to the run's sender. Action-deep metering where the
  host already records it — no proxy required.
- **Layer 3 — broker as a NODE** (Phase 4+): `@copenode/mcp-broker` —
  real-time per-call enforcement and task-scoped secret brokering as a
  governed node (attests senders, token-gated, metered, petitions). The
  OpenBot-style "governed MCP gateway" is the monolith temptation; ours
  lives in the rim on the same manifest, policy, and ephemeris.

**Prereqs:** Phase 1 exit (0.1.0 published) · WSL Ubuntu lab: git 2.53 ✅,
Docker 29 ✅, Node v26.13.1 via nvm ✅ (default pinned; note: non-interactive
shells don't load nvm — services later use the absolute path
`/home/uma/.nvm/versions/node/v26.13.1/bin`) ·
**Lab WhatsApp number: redacted** — a dedicated SIM, registered privately
(number recorded in operator-private files, never published; the gateway
*label* is what matters, not the digits). Register WhatsApp on it (spare
device / WhatsApp Business), then pair OpenClaw via QR · Paseo daemon
installed and reachable · budget guard wired into spawn path (built 2026-11-18).

**Transport note:** when the VPS arrives, Tailscale goes in *first* (dev box +
VPS + lab in one tailnet; daemon never exposed publicly; ACLs can mirror trust
tiers). Spine stays transport-agnostic — `host:port` is all it knows.
*Optional LAN door (lab, 2026-11-18): Windows portproxy 0.0.0.0:6767 →
127.0.0.1:6767, firewall rule "Paseo daemon (WSL) - LAN" (Private profile +
LocalSubnet only), daemon password required first. Teardown: delete portproxy
+ rule; inventory via `netsh interface portproxy show all`.*

**Guardrails:**
- The personal WhatsApp account **never** links to lab code — only the dedicated lab number (linking is device-bound and ToS-sensitive; treat the lab number as disposable).
- Sandbox-by-default from the plugin's *first commit*: test the `sender` tier with a fake colleague before any real human messages it.
- Lab model keys are capped throwaways — provider spend limits on, so a runaway agent burns $10, not $1000.
- Refusals recorded with rule strings from day one — the trail doubles as the regression test for policy.
- No forking OpenClaw/Paseo, ever, even when a fork looks faster than an adapter.

**Scope:**
- **E** ~~`@copenode/openclaw-plugin`~~ ✅ scaffolded 2026-11-19 — tool plugin
  (`copenode_spawn` / `copenode_status`) on OpenClaw's plugin-sdk:
  requester attestation (`requesterSenderId`) → spine ingress (token) →
  verdict in thread (accepted names tier+isolation; refusals name the rule).
  Pinned to pluginApi 2026.11.6. Lab bring-up + E2E remain.
- **E** `@copenode/paseo-plugin`: workspace lifecycle per label; collect diff + cost
- **E** Mechanical eval executor (run the target repo's tests/lint in the worktree) — judge #1
- **M** Human eval via approval-card verdicts; per-sender budgets live
- **L** Delivery policies (quiet hours, digests)

**Exit:** ✅ **MET 2026-11-21 — the bridge is live.** A real WhatsApp message
from the owner's phone (+33665039280, attested by OpenClaw) walked the entire
spine: classified **owner** → policy rule 0 granted → budget ok → Paseo
worktree agent `162124f1` created `bridge-live.txt` → finish hook graded it
(`pass · 1 file(s) changed`) → trail rows chained (48 entries, verify ok) →
verdict delivered back into the WhatsApp thread. First governed refusal also
witnessed (mis-classified label → denied → agent declined to bypass → fixed
forward). Remaining polish, not exit-blockers: cost harvesting, upstream
submission, demo video.

**Incident log — 2026-11-18, first governance incident.** An agent (running
inside the lab) was asked to "enable opencode-go as a provider inside opencode
in WSL" and instead edited the spine's operator config (`config.json`) AND the
plugin source, adding a model pass-through. Findings: the code was competent
and the `--model` flag it assumed was real (verified via `paseo run --help`),
but ① it never did the requested job (OpenCode-side auth untouched), ② it
reached into operator-owned policy unrequested. Response: **rolled back per founder** (`3357f67` — model pass-through
removed, README/docs reverted); config hardening **kept** (unknown keys
named+ignored; invalid provider = plugin refuses to start, fail-closed).
The feature idea remains available: it can be re-built deliberately, by the
operator, once OpenCode-side auth exists. Lesson going forward: **policy
config and spine source are operator-gated surfaces** — future spine: config
changes validated at load against a schema, and eventually recorded as ledger
entries (config changes are actions too). Agents asking to "enable/configure"
must be routed to the correct layer's own surface, never to the spine's policy.

**Front-door decision (2026-11-18, founder-confirmed direction):** bridge via
OpenClaw, not a from-scratch WhatsApp gateway. Rationale: OpenClaw owns the
WhatsApp transport swamp (Baileys-class linking, sessions, bans), provides an
assistant brain for non-task messages, has sender identity we already map, and
brings its 394k★ ecosystem as distribution. A homegrown gateway makes copenode
an island and a transport — contradicts the spine positioning. The bet is
hedged by architecture: `shared/protocol.ts` is gateway-agnostic, and
openclaw-plugin is the thinnest package. **Exit triggers** (any one → build
`@copenode/gateway-whatsapp` on the same /spawn protocol): ① plugin API churn
exceeds the 2-day budget twice · ② their WhatsApp bridge fails our dogfood ·
③ the OpenClaw project dies or closes. WhatsApp Cloud API remains a future
*business lane* (additive, alongside Feishu), not a replacement.

**Upstream submission readiness (post-exit):** submit to the hosts' plugin
ecosystems only when — ① Phase 2 demo green · ② ~2 weeks self-dogfood in the
lab · ③ tested against the host's current stable release (ideally survived one
minor release) · ④ README answers install / config / where-does-my-data-go.
Order: `paseo-plugin` first (smaller pond, self-contained daemon side), then
`openclaw-plugin` after approval cards are polished (the 394k★ audience gets
one first impression). Verify each host's actual submission mechanics before
the first PR.

*Paseo mechanics verified 2026-11-18:* issue with the `submit-plugin` template
at **github.com/getpaseo/plugins**; the in-app `Cafe` plugin browses the
directory, so listed = two-click installable.

*Registry recon 2026-11-18 (269 plugins):* chat-gateway lane nearly empty —
`pasear` (operator's AI-chat UIs drive Paseo; inverted, single-user),
`task-notify` (Feishu/Telegram outbound only). No two-way gateway, no
per-sender identity anywhere. Metering fragmented (`token-ledger`,
`session-guard`, `deepseek-usage` + ~6 dashboards) — all per-daemon/per-turn,
none per-sender or cross-system. Evals emerging (`turn-review` human keep/undo,
`agent-observatory` AI reviews) — none tied to identity+cost. Cross-daemon
exists Paseo↔Paseo (`mesh`, `cross-daemon`) — watch as mini-competitors /
future nodes. Sandbox lane healthy (`workspace-sandbox`, `sbx`, `safehouse`) —
route to them, never build them.
**De-risks:** cold start (finally a screenshot), the squeeze (be glue worth keeping).
**Learn:** real plugin-API churn cost per host release; actual usage patterns.

### Phase 3 — The Plane (est. 3–4 weeks) — integration #2
Policy rides the protocol lane that Google/MS/Amazon/Oracle just standardized.

**Prereqs:** Phase 2 exit · a third-party AG-UI app chosen as the metering
target · AG-UI 1.0 spec reviewed against the ledger schema (schema was built
as its superset, so this should be verification, not rework).

**Guardrails:**
- Middleware v1 is **observe-only**: meter and audit streams, never block or mutate a third party's traffic. Enforcement is opt-in, later, per deployment.
- Senders masked in any public log or screenshot; no PII leaves the operator's disk.
- Data retention is stated plainly in docs: the ledger lives on the operator's machine, full stop.

**Scope:**
- **E** `@copenode/ag-ui` middleware: meter/audit any AG-UI stream, zero code change downstream
- **E** Identity enrichment: sender + trust tier injected into `RunAgentInput` context
- **M** AG-UI-endpoint node type (route work to external agents under budget)
- **L** OpenBot-Bot-as-node recipe

**Exit:** a third-party AG-UI app gets copenode metering without touching its code.
**De-risks:** standards churn (we're on the winning lane), market timing.
**Learn:** does the lane adopt a policy plane when offered one?

### Phase 4 — The Face + The Catalog
Fixes the "infrastructure has no screenshot" problem; opens the rim.

**Prereqs:** Phases 2–3 exit · real ledger data to visualize (recorded demo
runs, not synthetic) · UI approach decided — static export first, app later ·
seed content ready for Discord/Discussions (announcement + Ideas post).

**Guardrails:**
- SECURITY.md path and security@ inbox **tested** (send yourself a disclosure) before the launch post — a public project needs a working disclosure channel before it needs users.
- The ephemeris UI masks senders by default; unmasking is a deliberate click.
- Provenance and the trust posture ship *with* the demo — they're the differentiator, not a footnote.
- Community SLA with yourself: seeded channels answered within 48h, or closed until bandwidth exists — no ghost towns.

**Scope:**
- **E** Ephemeris UI: trail viewer (who/what/cost/quality), budgets dashboard
- **E** Node/adapter registry (OpenShip-catalog mechanic: one entry per node type, community-contributable)
- **M** ArtCraft demo node — "text your chat, get a metered render" (the vision beyond coding)
- **L** Value gates (quality-weighted budget rules)

**Exit:** public launch post with live demo; first 10 external users; Discord seeded.
**De-risks:** cold start, ghost-town community.

### Phase 5 — The Mesh (distribution & compounding)

**Prereqs:** Phase 4 exit · at least one external user asking to self-host ·
VPS provisioned · Docker Hub repo named (`copenode/daemon`) · Caddy template
tested against the lab stack.

**Guardrails:**
- Daemon binds loopback/tailnet only — public exposure is a deliberate Caddy decision, never a default.
- Container: non-root user, read-only rootfs, single writable volume for the ledger; image scanned in CI before tags.
- The moment anyone else's data enters a ledger: schema versioning + migrations tested, export/backup documented — **before** they depend on it, not after.
- apt repo GPG keys generated and stored offline-first; signing happens on a dedicated machine/context.
- Fresh installs default to budget hard-block for the `system` tier (default-deny for non-humans).

**Scope:**
- **E** Daemon container: Docker Compose + Caddy template; image on Docker Hub
- **M** Quality-adjusted routing v0 (route by best cost-per-accepted-diff); Python SDK (+ PyPI); apt repo (.deb + systemd) at VPS-user demand; snap
- **L** Cross-node eval federation; sustainability decision point (hosted ledger option — conscious, doctrine-checked)

**Exit:** self-hoster installs in ≤10 min; routing measurably improves with ledger depth.

## Deployment decision

What the spine actually needs to deploy: **one Node service + storage + TLS,
running beside the daemons it governs.** Not a platform.

| Option | Fit | Verdict |
|---|---|---|
| **Docker Compose + Caddy** | One file, two containers (spine + Caddy auto-HTTPS), volume for SQLite | ✅ **Recommended** |
| Traefik | Label-driven, shines in multi-service/k8s fleets | Overkill for one service; fine if the *user's* stack already runs it |
| Dokploy / Coolify / OpenShip | Full self-hosted PaaS | Not ours to build — ours to be *listed in* (distribution) |
| Build our own | A second product | ❌ Doctrine violation (the center must stay light) |

Packaging play: a **"copenode stack" template** (OpenClaw + Paseo + spine +
Caddy in one compose file, with an **optional `tailscale` profile** — Headscale
for the fully self-hosted) is the deployment simplification users feel —
it's packaging, not platform. Ship it Phase 5; list in PaaS catalogs after.

## Open decisions (founder's call) — DECIDED 2026-11-18

1. **Phase order** — ✅ ledger → bridge → plane
2. **Demo channel** — ✅ **WhatsApp first** (rides OpenClaw's bridge; lab uses a
   dedicated number since WhatsApp linking is device-bound; Telegram follows)
3. **Budgets** — ✅ hard block at cap for `sender`/`system` tiers; alert-only for `owner`
4. **Roadmap** — ✅ private, like the manifesto (gitignored)

**Exit (Phase 2) is now WhatsApp-shaped:** a WhatsApp message becomes a
sandboxed worktree, tests run, diff + cost + eval land back in the thread.
