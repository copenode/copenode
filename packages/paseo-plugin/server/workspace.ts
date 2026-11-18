/**
 * The seam to Paseo: create a workspace per decision and start the agent,
 * speaking the `paseo` CLI — the stable, documented surface (guardrail:
 * CLI/MCP, never internals). The daemon user runs this plugin, so the CLI
 * is on PATH and already trusted by the daemon.
 *
 * Isolation mapping (v0):
 *   owner  ("worktree" policy) -> `--new-workspace worktree`  (branch-off)
 *   sender ("sandbox" policy)  -> worktree as well, wrapped in container
 *                                 isolation when workspace-sandbox lands;
 *                                 the ledger already records the *policy*.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface SpawnRequest {
  label: string;
  tier: "owner" | "sender";
  isolation: "worktree" | "sandbox";
  text: string;
  threadRef?: string;
  ledgerEntryId: string;
}

export interface SpawnResult {
  workspaceId: string | null;
  agentId: string | null;
}

/** Best-effort parse of `paseo run` output: compact, pretty-printed, or mixed human+JSON. */
function parseRunOutput(stdout: string): SpawnResult {
  const wsMatch = stdout.match(/wks_[a-z0-9]+/);
  const idMatch = stdout.match(/"agentId"\s*:\s*"([0-9a-fA-F-]+)"/);
  return { agentId: idMatch ? idMatch[1] : null, workspaceId: wsMatch ? wsMatch[0] : null };
}

export async function spawnWorkspace(
  req: SpawnRequest,
  projectPath: string | null,
  provider: string | null,
  model: string | null,
): Promise<SpawnResult> {
  if (!projectPath) {
    throw new Error("NOT_CONFIGURED: no projectPath — set it in ~/.paseo/copenode/config.json");
  }
  if (!provider) {
    throw new Error("NOT_CONFIGURED: no provider — set \"provider\": \"opencode\" in ~/.paseo/copenode/config.json");
  }
  const slugSource = `${req.label}-${req.ledgerEntryId.slice(0, 8)}`;
  const slug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const args = [
    "run",
    "--no-wait",
    "--json",
    "--provider",
    provider,
    "--title",
    slug,
    "--new-workspace",
    "worktree", // v0: both tiers get a worktree; sandbox enforcement lands with workspace-sandbox
  ];
  // Model selection is Paseo-layer config, set deliberately by the operator
  // (see incident log 2026-11-18): e.g. opencode-go/glm-5.3-flash rides the
  // OpenCode Go subscription instead of pay-as-you-go OpenCode Models credits.
  if (model) args.push("--model", model);
  args.push(req.text);
  const { stdout } = await run("paseo", args, { cwd: projectPath });
  console.log("[copenode] paseo run:", stdout.slice(0, 400));
  return parseRunOutput(stdout);
}
