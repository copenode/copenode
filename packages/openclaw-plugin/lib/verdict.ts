/**
 * Pure: turn the spine's verdict into chat text. The policy speaks in the
 * thread — accepted runs say who they are for, refusals name the rule.
 */

import type { SpawnDecision } from "./spine.ts";

export function formatSpawnDecision(body: SpawnDecision): string {
  if (body.ok) {
    const lines = [
      `✅ copenode: governed spawn accepted.`,
      `• tier: ${body.tier} · isolation: ${body.isolation}`,
    ];
    if (body.agentId) lines.push(`• agent: ${body.agentId.slice(0, 8)}`);
    lines.push(`• budget: ${body.budgetLevel}${body.budgetLevel === "alert" ? " (approaching cap)" : ""}`);
    return lines.join("\n");
  }
  return `🚫 copenode: refused — rule: ${body.rule}. This attempt is recorded in the ledger.`;
}
