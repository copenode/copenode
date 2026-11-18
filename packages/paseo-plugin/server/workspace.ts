/**
 * The seam to Paseo: create a workspace per decision, start the agent,
 * collect diff + cost when it finishes.
 *
 * Phase 2 lab TODO: wire these to the Paseo TypeScript SDK (workspaces /
 * agents / events). Until then the seam throws loudly — nothing silently
 * pretends to work. Isolation choice comes straight from the spine's
 * routingFor(): worktree for owner, sandbox (workspace-sandbox compatible)
 * for everyone else.
 */

import type { SpawnResponseBody } from "../shared/protocol.ts";

export interface SpawnRequest {
  label: string;
  tier: "owner" | "sender";
  isolation: "worktree" | "sandbox";
  text: string;
  threadRef?: string;
  ledgerEntryId: string;
}

export async function spawnWorkspace(req: SpawnRequest): Promise<string> {
  void req;
  throw new Error(
    "NOT_IMPLEMENTED: wire spawnWorkspace to the Paseo SDK in the lab " +
      "(workspace per label, isolation: " + req.isolation + ")",
  );
}
