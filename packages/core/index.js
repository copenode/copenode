/**
 * @copenode/core — v0.1
 *
 * The policy spine beneath agent nodes.
 *
 * - trust.js: identity mapping + tiered routing (who asked, what it may reach)
 * - ledger.js: the metering ledger (cost, trail, evals — one event spine)
 *
 * These two modules are the whole center on purpose: copenode orchestrates
 * nodes, it never replaces them. See https://github.com/copenode/copenode
 */

export const CORE_VERSION = "0.1.0";

export { senderToLabel, routingFor, classifySender, TIERS } from "./trust.js";
export {
  loadPolicy,
  resolveUserGroup,
  decide,
  ACTIONS,
  ISOLATIONS,
  AGENT_GROUPS,
} from "./policy.js";
export {
  createLedger,
  memoryStore,
  jsonlStore,
  entryHash,
  GENESIS_HASH,
} from "./ledger.js";
export { createBudgetGuard } from "./budget.js";
