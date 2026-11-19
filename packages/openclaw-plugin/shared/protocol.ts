/**
 * The wire contract between the OpenClaw plugin and the copenode ingress.
 * Mirrors packages/paseo-plugin/shared/protocol.ts — one spine, one wire.
 */

export interface SpawnRequestBody {
  channel: string;
  senderId: string;
  text: string;
  pendingDollars?: number;
  threadRef?: string;
}

export type SpawnResponseBody =
  | {
      ok: true;
      label: string;
      tier: "owner" | "sender";
      isolation: "worktree" | "sandbox";
      workspaceId: string | null;
      agentId: string | null;
      ledgerEntryId: string;
      budgetLevel: "ok" | "alert" | "exhausted";
    }
  | {
      ok: false;
      label: string;
      rule: string;
      ledgerEntryId: string;
    };
