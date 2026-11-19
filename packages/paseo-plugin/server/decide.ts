/**
 * The decision path every inbound message walks:
 * group (who) -> policy (what's granted) -> budget (the grant's bound)
 * -> isolation (the grant's shape) -> ledger (record).
 *
 * Pure logic: no Paseo SDK, no network — fully unit-tested. Refusals from
 * *known* user groups leave petitions in the ledger (policy-request);
 * unknown senders are just refused — the outermost orbit doesn't petition.
 */

import {
  senderToLabel,
  resolveUserGroup,
  decide as decideAction,
  createBudgetGuard,
  type Policy,
  type TrustTier,
} from "@copenode/core";
import type { SpawnRequestBody, SpawnResponseBody } from "../shared/protocol.ts";

/** This node's declared class of agentic work. */
export const AGENT_GROUP = "coding-fleet";

export interface BridgeConfig {
  policy: Policy;
  /** fallback spend cap when a grant carries none */
  limit: number;
}

export type LedgerLike = {
  record: (input: any) => { id: string };
  trail: (filter: any) => Array<any>;
};

function tierFromGroup(group: string): TrustTier {
  if (group === "owners") return "owner";
  if (group === "senders") return "sender";
  return "system";
}

export function decideInbound(
  config: BridgeConfig,
  ledger: LedgerLike,
  msg: SpawnRequestBody,
): SpawnResponseBody {
  const label = senderToLabel({ channel: msg.channel, senderId: msg.senderId });
  const userGroup = resolveUserGroup(config.policy, label);

  const verdict = decideAction(config.policy, {
    userGroup,
    agentGroup: AGENT_GROUP,
    action: "spawn",
  });

  if (!verdict.allowed) {
    const entry = ledger.record({
      identity: { sender: label, tier: tierFromGroup(userGroup) },
      decision: { verdict: "refuse", rule: `policy:${verdict.rule}` },
      action: { kind: "run", target: msg.threadRef ?? null },
      outcome: { status: "refused" },
    });
    // Petition: known groups may ask; the outermost orbit just gets refused.
    if (userGroup !== "system") {
      const key = `${userGroup}/${AGENT_GROUP}/spawn`;
      const already = ledger.trail({ kind: "policy-request" }).some((e) => e.action?.target === key);
      if (!already) {
        ledger.record({
          identity: { sender: label, tier: tierFromGroup(userGroup) },
          decision: { verdict: "refuse", rule: "policy-denied" },
          action: { kind: "policy-request", target: key },
          outcome: { status: "petitioned" },
          refId: entry.id,
        });
      }
    }
    return { ok: false, label, rule: `policy:${verdict.rule}`, ledgerEntryId: entry.id };
  }

  // The grant's own bound: walls for contained orbits, instruments for
  // the trusted one — enforcement follows isolation, not group name.
  const enforcement = verdict.bounds.isolation === "worktree" ? "alert" : "block";
  const guard = createBudgetGuard({
    ledger: ledger as any,
    limit: verdict.bounds.spendCap ?? config.limit,
    windowMs: 24 * 60 * 60 * 1000,
    alertAt: 0.8,
  });
  const budget = guard.check({
    sender: label,
    tier: enforcement === "alert" ? "owner" : "sender",
    pendingDollars: msg.pendingDollars ?? 0,
  });

  if (!budget.allowed) {
    const entry = ledger.record({
      identity: { sender: label, tier: tierFromGroup(userGroup) },
      decision: { verdict: "refuse", rule: "budget-exhausted" },
      action: { kind: "run", target: msg.threadRef ?? null },
      outcome: { status: "refused" },
    });
    return { ok: false, label, rule: "budget-exhausted", ledgerEntryId: entry.id };
  }

  const entry = ledger.record({
    identity: { sender: label, tier: tierFromGroup(userGroup) },
    decision: { verdict: "allow", rule: `policy:rule${verdict.rule}` },
    action: { kind: "run", target: msg.threadRef ?? null },
    outcome: { status: "spawned" },
  });

  return {
    ok: true,
    label,
    tier: tierFromGroup(userGroup) as "owner" | "sender",
    isolation: verdict.bounds.isolation,
    workspaceId: null, // filled in by the workspace seam
    agentId: null,
    ledgerEntryId: entry.id,
    budgetLevel: budget.level,
  };
}
