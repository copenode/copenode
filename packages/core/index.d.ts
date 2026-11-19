/**
 * @copenode/core — public type surface.
 * Hand-authored: the implementation is plain JS + JSDoc; this file is the
 * contract TypeScript consumers (the plugins) compile against.
 */

export type TrustTier = "owner" | "sender" | "system";

export const TIERS: readonly TrustTier[];

export function senderToLabel(from: { channel: string; senderId: string }): string;

export function routingFor(
  tier: TrustTier,
): { isolation: "worktree" | "sandbox"; scopedCredentials: boolean };

export function classifySender(
  from: { channel: string; senderId: string },
  policy?: { ownerLabels?: string[]; allowlistedLabels?: string[] },
):
  | { label: string; tier: "owner" | "sender" }
  | { label: string; tier: null; reason: string };

export const GENESIS_HASH: string;

export function entryHash(entry: Record<string, unknown>): string;

export interface LedgerEntry {
  id: string;
  ts: string;
  identity: { sender: string; tier: TrustTier; agent: string | null; node: string | null };
  decision: { verdict: "allow" | "refuse" | "flag"; rule: string | null; isolation: "worktree" | "sandbox" };
  action: { kind: string; target: string | null; digest: string | null };
  cost: { tokens: number; dollars: number; durationMs: number };
  outcome: { status: string; artifactRef: string | null };
  refId: string | null;
  eval: { judge: string; score: number | null; verdict: string | null; note: string | null } | null;
  prev: string;
  hash: string;
}

export interface LedgerStore {
  append(entry: LedgerEntry): void;
  all(): LedgerEntry[];
  readonly tornTail?: boolean;
}

export function memoryStore(seed?: Array<Record<string, unknown>>): LedgerStore;
export function jsonlStore(path: string): LedgerStore;

export interface RecordInput {
  identity: { sender: string; tier: TrustTier; agent?: string | null; node?: string | null };
  decision?: { verdict?: "allow" | "refuse" | "flag"; rule?: string | null };
  action?: { kind?: string; target?: string | null; digest?: string | null };
  cost?: { tokens?: number | null; dollars?: number | null; durationMs?: number | null };
  outcome?: { status?: string; artifactRef?: string | null };
  refId?: string | null;
  eval?: { judge: string; score?: number | null; verdict?: string | null; note?: string | null };
}

export interface Ledger {
  record(input: RecordInput): LedgerEntry;
  attachEval(
    targetId: string,
    evaluation: { judge: "mechanical" | "model" | "human"; score?: number; verdict?: string; note?: string },
  ): LedgerEntry;
  trail(filter?: { sender?: string; tier?: string; agent?: string; kind?: string; refId?: string }): LedgerEntry[];
  evalsOf(entryId: string): Array<{ judge: string; score: number | null; verdict: string | null; note: string | null }>;
  verify(): { ok: true; entries: number } | { ok: false; at: string; reason: string };
  get(id: string): LedgerEntry | null;
  snapshot(): LedgerEntry[];
}

export function createLedger(options?: { store?: LedgerStore }): Ledger;

export function createBudgetGuard(options: {
  ledger: Ledger;
  limit: number;
  windowMs?: number;
  alertAt?: number;
  mode?: Record<string, "alert" | "block">;
}): {
  check(who: {
    sender: string;
    tier: TrustTier;
    pendingDollars?: number;
  }): {
    allowed: boolean;
    level: "ok" | "alert" | "exhausted";
    enforcement: "alert" | "block";
    spent: number;
    projected: number;
    limit: number;
    remaining: number;
  };
};

export const CORE_VERSION: string;

export const ACTIONS: readonly string[];
export const ISOLATIONS: readonly string[];
export const AGENT_GROUPS: readonly string[];

export interface PolicyRule {
  userGroup: string;
  agentGroup: string;
  deny?: string[];
  allow?: string[];
  bounds?: {
    isolation?: "sandbox" | "worktree";
    spendCap?: number;
    maxDepth?: number;
    network?: "none" | "scoped" | "open";
  };
}

export interface Policy {
  userGroups: Record<string, { labels: string[] }>;
  rules: PolicyRule[];
}

export function loadPolicy(doc: unknown): Policy;

export function resolveUserGroup(policy: Policy, label: string): string;

export function decide(
  policy: Policy,
  who: { userGroup: string; agentGroup: string; action: string },
): { allowed: true; bounds: { isolation: "sandbox" | "worktree"; spendCap: number | null; maxDepth: number; network: string }; rule: number }
  | { allowed: false; rule: string };

export function digestTree(dir: string): string;

export function randomToken(bytes?: number): string;

export function evaluateStartup(args: {
  hasPin: boolean;
  pinDigests: Record<string, string> | null;
  liveDigests: Record<string, string>;
  hasLastGood: boolean;
}): { mode: "bootstrap" | "apply" | "safe"; reason: string; mismatched: string[] };
