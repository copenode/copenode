/**
 * The decision path every inbound message walks:
 * classify (who) -> budget (how much) -> routing (where) -> ledger (record).
 *
 * Pure logic: no Paseo SDK, no network — fully unit-tested. The same walk
 * runs in the lab daemon and in tests; only the workspace seam differs.
 */

import {
  classifySender,
  routingFor,
  createBudgetGuard,
  type TrustTier,
} from "@copenode/core";
import type { SpawnRequestBody, SpawnResponseBody } from "../shared/protocol.ts";

export interface BridgeConfig {
  /** labels (senderToLabel output) that speak with owner authority */
  ownerLabels: string[];
  /** labels allowlisted as senders (sandboxed) */
  allowlistedLabels: string[];
  /** dollars per sender per window */
  limit: number;
  windowMs?: number;
  alertAt?: number;
}

export type LedgerLike = {
  record: (input: any) => { id: string };
};

export function decideInbound(
  config: BridgeConfig,
  ledger: LedgerLike,
  msg: SpawnRequestBody,
): SpawnResponseBody {
  const classified = classifySender(
    { channel: msg.channel, senderId: msg.senderId },
    { ownerLabels: config.ownerLabels, allowlistedLabels: config.allowlistedLabels },
  );
  const { label, tier } = classified;

  // Default-deny: unknown senders are recorded as the outermost orbit.
  if (tier === null) {
    const entry = ledger.record({
      identity: { sender: label, tier: "system" as TrustTier },
      decision: { verdict: "refuse", rule: classified.reason },
      action: { kind: "run", target: msg.threadRef ?? null },
      outcome: { status: "refused" },
    });
    return { ok: false, label, rule: classified.reason, ledgerEntryId: entry.id };
  }

  const guard = createBudgetGuard({
    ledger: ledger as any,
    limit: config.limit,
    windowMs: config.windowMs,
    alertAt: config.alertAt,
  });
  const budget = guard.check({
    sender: label,
    tier,
    pendingDollars: msg.pendingDollars ?? 0,
  });

  if (!budget.allowed) {
    const entry = ledger.record({
      identity: { sender: label, tier },
      decision: { verdict: "refuse", rule: "budget-exhausted" },
      action: { kind: "run", target: msg.threadRef ?? null },
      outcome: { status: "refused" },
    });
    return { ok: false, label, rule: "budget-exhausted", ledgerEntryId: entry.id };
  }

  const routing = routingFor(tier);
  const entry = ledger.record({
    identity: { sender: label, tier },
    decision: { verdict: "allow", rule: "allowlisted" },
    action: { kind: "run", target: msg.threadRef ?? null },
    outcome: { status: "spawned" },
  });

  return {
    ok: true,
    label,
    tier,
    isolation: routing.isolation,
    workspaceId: null, // filled in by the workspace seam
    ledgerEntryId: entry.id,
    budgetLevel: budget.level,
  };
}
