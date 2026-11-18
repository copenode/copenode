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

/** Best-effort parse of `paseo run --json` output; never throws on shape. */
function parseRunOutput(stdout: string): SpawnResult {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const id = typeof parsed.id === "string" ? parsed.id : typeof parsed.agentId === "string" ? parsed.agentId : null;
    const ws = typeof parsed.workspaceId === "string" ? parsed.workspaceId : null;
    return { agentId: id, workspaceId: ws };
  } catch {
    return { agentId: null, workspaceId: null };
  }
}

export async function spawnWorkspace(req: SpawnRequest, projectPath: string | null): Promise<SpawnResult> {
  if (!projectPath) {
    throw new Error("NOT_CONFIGURED: no projectPath — set it in ~/.paseo/copenode/config.json");
  }
  const slugSource = `${req.label}-${req.ledgerEntryId.slice(0, 8)}`;
  const slug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const args = [
    "run",
    "--no-wait",
    "--json",
    "--title",
    slug,
    "--new-workspace",
    "worktree", // v0: both tiers get a worktree; sandbox enforcement lands with workspace-sandbox
  ];
  args.push(req.text);
  const { stdout } = await run("paseo", args, { cwd: projectPath });
  console.log("[copenode] paseo run:", stdout.slice(0, 400));
  return parseRunOutput(stdout);
}
