/**
 * Wire protocol between the copenode plugins.
 *
 * The OpenClaw side POSTs inbound messages here; the Paseo side answers
 * with the decision the spine made. Plain JSON over HTTP on the daemon
 * host — usually loopback or tailnet, never public.
 */

export interface SpawnRequestBody {
  channel: string;
  senderId: string;
  text: string;
  /** projected cost of the run being requested (pre-flight) */
  pendingDollars?: number;
  /** originating thread, for the diff to return to */
  threadRef?: string;
}

export type SpawnResponseBody =
  | {
      ok: true;
      label: string;
      tier: "owner" | "sender";
      isolation: "worktree" | "sandbox";
      workspaceId: string | null;
      ledgerEntryId: string;
      budgetLevel: "ok" | "alert" | "exhausted";
    }
  | {
      ok: false;
      label: string;
      rule: string;
      ledgerEntryId: string;
    };
