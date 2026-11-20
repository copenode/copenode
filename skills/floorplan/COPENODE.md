# copenode governance notes for this vendored skill

This is a vendored copy of [Floorplan](https://github.com/haydenschmitty/floorplan)
v0.11.0 (tag `floorplan--v0.11.0`, commit `94f81b4`), MIT © 2026 Hayden Smith.
Unmodified except for this file. Upstream: the [plugin repo](https://github.com/haydenschmitty/floorplan)
and its [live demo](https://haydenschmitty.github.io/floorplan-demo/).

## Governed usage (copenode)

- **Run it inside a governed agent run.** The skill's model jobs (architecture,
  descriptions, recent_work) must be part of the agent's session so the copenode
  ledger meters them. Standalone Floorplan runs spend the user's Claude/ChatGPT
  plan invisibly to the ledger — allowed, but unmetered.
- **Unattended mode only for machine steps.** Set `FLOORPLAN_UNATTENDED=1`
  when scripts run outside a chat session; nothing is then written outside
  `floorplan/`.
- **The agent is the driver.** `workflow.json` is the process as data: the agent
  runs the scripts (`status.mjs`, `scan.mjs`, `build.mjs`, `describe.mjs`,
  `refresh.mjs`, `recent.mjs` — all `--json`), does the model jobs itself, and
  writes only the three answer file kinds. Read-only tools inside the
  codebase, exactly as the workflow's conventions require.
- **Secrets**: the build masks secret-looking text (`secretsHidden`), and the
  driver convention is to run `maskSecrets()` before writing any answer. The
  copenode tool-trail harvests what the agent writes; keep it clean.
- **Never commit `floorplan/`.** The folder self-ignores; respect that. A map
  is plain-English descriptions of a private app — publishing it is the
  owner's deliberate choice, not a default.
- **Health as eval signal**: `build.mjs --json` returns machine-readable
  `health: { high, medium, low, important[] }`. The finish hook notes when a
  governed run updated the project's map; health deltas as eval judgments are
  the next step (see ROADMAP, MCP/tooling track).

## Updating the vendored copy

Fetch the pinned tag's tarball, replace this folder, update the tag and commit
SHA above, and re-read their `workflow.json` for NEXT-code changes (a newer
Floorplan can add codes the driver must handle).
