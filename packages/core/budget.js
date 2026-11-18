/**
 * @copenode/core — budget guard (Phase 1)
 *
 * Budgets make cost finite. The ledger is the single source of truth: the
 * guard reads it and never keeps counters of its own — so a restarted guard
 * can't disagree with history.
 *
 * Doctrine (decided 2026-11-18): hard block at cap for `sender`/`system`
 * tiers; alert-only for `owner`. Outer orbits have walls; the inner orbit
 * has instruments.
 *
 * v1 meters dollars only — the universal unit across models and providers.
 * Tokens are recorded in the ledger and can gate later without migration.
 */

import { routingFor } from "./trust.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** @type {Readonly<Record<import("./trust.js").TrustTier, "alert" | "block">>} */
const DEFAULT_MODE = Object.freeze({
  owner: "alert",
  sender: "block",
  system: "block",
});

/**
 * Create a budget guard over a ledger.
 *
 * @param {{
 *   ledger: ReturnType<typeof import("./ledger.js").createLedger>,
 *   limit: number,                // dollars per sender per window
 *   windowMs?: number,            // default: 24h (rolling)
 *   alertAt?: number,             // fraction of limit where alerts start (default 0.8)
 *   mode?: Record<string, "alert" | "block">, // per-tier enforcement
 * }} options
 */
export function createBudgetGuard({
  ledger,
  limit,
  windowMs = DAY_MS,
  alertAt = 0.8,
  mode = DEFAULT_MODE,
}) {
  if (!(limit > 0)) {
    throw new Error("createBudgetGuard requires a positive limit (dollars)");
  }

  function spentBy(sender) {
    const since = Date.now() - windowMs;
    return ledger.trail({ sender }).reduce((sum, entry) => {
      const ts = Date.parse(entry.ts);
      return Number.isFinite(ts) && ts >= since
        ? sum + (entry.cost?.dollars ?? 0)
        : sum;
    }, 0);
  }

  /**
   * Check a sender's budget, optionally including the projected cost of the
   * run about to happen (pre-flight).
   *
   * @param {{ sender: string, tier: import("./trust.js").TrustTier, pendingDollars?: number }} who
   * @returns {{
   *   allowed: boolean, level: "ok" | "alert" | "exhausted",
   *   enforcement: "alert" | "block",
   *   spent: number, projected: number, limit: number, remaining: number,
   * }}
   */
  function check({ sender, tier, pendingDollars = 0 }) {
    if (!sender) throw new Error("budget.check requires sender");
    routingFor(tier); // validates the tier (unknown tiers throw)
    const enforcement = mode[tier] ?? DEFAULT_MODE[tier];
    const spent = spentBy(sender);
    const projected = spent + pendingDollars;
    const level =
      projected >= limit ? "exhausted" : projected >= alertAt * limit ? "alert" : "ok";
    const allowed = !(level === "exhausted" && enforcement === "block");
    return {
      allowed,
      level,
      enforcement,
      spent,
      projected,
      limit,
      remaining: Math.max(0, limit - projected),
    };
  }

  return { check };
}
