/**
 * @copenode/core — the metering ledger (Phase 1)
 *
 * One event spine, three lenses: what it cost, what happened, how well it went.
 *
 *   Entry = {
 *     identity:  { sender, tier, agent, node }     // who asked
 *     decision:  { verdict, rule, isolation }      // what policy allowed/refused
 *     action:    { kind, target, digest }          // what was attempted
 *     cost:      { tokens, dollars, durationMs }   // what it consumed
 *     outcome:   { status, artifactRef }           // what came back
 *     eval:      { judge, score, verdict, note }   // only on eval entries
 *     refId:     target entry id                   // for eval entries
 *     prev, hash                                      // the chain
 *   }
 *
 * Design rules, from the doctrine:
 *  - Append-only. Rows are frozen; evals are NEW entries referencing the run
 *    they judge (late truth lands as new truth, never as an edit).
 *  - Refusals are recorded: every "no" carries the rule that caused it.
 *  - Hash-chained: each entry commits to its predecessor (SHA-256 over
 *    canonical JSON). Removing the tail is undetectable without an external
 *    anchor — stamping the head hash elsewhere is a future hardening step.
 *  - `action.kind` is a superset of AG-UI's event families: run, message,
 *    tool_call, state, reasoning, activity, subagent — plus "eval".
 *
 * The ledger never judges and never routes; it guarantees attribution,
 * integrity, and late truth. What counts as "good" is a plugin's opinion.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { routingFor } from "./trust.js";

/** Hash of the notional entry before the first one. */
export const GENESIS_HASH = "0".repeat(64);

const EVAL_JUDGES = new Set(["mechanical", "model", "human"]);

/**
 * Canonical JSON: key-sorted, recursive — same data, same bytes, same hash.
 * @param {unknown} value
 * @returns {string}
 */
function canonical(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

/**
 * SHA-256 of an entry's content (every field except `hash` itself).
 * @param {Record<string, unknown>} entry
 * @returns {string} hex digest
 */
export function entryHash(entry) {
  const { hash: _hash, ...rest } = entry;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * In-memory store. Fine for tests and ephemeral runs.
 * @param {Array<Record<string, unknown>>} [seed]
 */
export function memoryStore(seed = []) {
  const entries = [...seed];
  return {
    append(entry) {
      entries.push(entry);
    },
    all() {
      return entries.slice();
    },
  };
}

/**
 * Append-only JSONL file store. One JSON entry per line; loaded on open.
 * Local-first, grep-able, trivially archived.
 *
 * Crash tolerance: a torn final line (power loss mid-append) is skipped and
 * flagged as `tornTail`; corruption anywhere earlier is a hard error — the
 * spine refuses to silently swallow history it cannot parse.
 *
 * @param {string} path file path; parent directory must exist
 */
export function jsonlStore(path) {
  let entries = [];
  let tornTail = false;
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;
      try {
        entries.push(JSON.parse(line));
      } catch (err) {
        const isLastLine = lines.slice(i + 1).every((l) => l.trim().length === 0);
        if (isLastLine) {
          tornTail = true;
          continue;
        }
        throw new SyntaxError(`corrupt ledger line ${i + 1}: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return {
    append(entry) {
      appendFileSync(path, `${JSON.stringify(entry)}\n`);
      entries.push(entry);
    },
    all() {
      return entries.slice();
    },
    get tornTail() {
      return tornTail;
    },
  };
}

/**
 * Create a ledger over a store.
 * @param {{ store?: ReturnType<typeof memoryStore> }} [options]
 */
export function createLedger({ store = memoryStore() } = {}) {
  const entries = store.all();

  const lastHash = () =>
    entries.length > 0 ? entries[entries.length - 1].hash : GENESIS_HASH;

  /**
   * Append one entry to the spine. Returns the frozen entry.
   * @param {{
   *   identity: { sender: string, tier: import("./trust.js").TrustTier, agent?: string, node?: string },
   *   decision?: { verdict?: "allow" | "refuse" | "flag", rule?: string },
   *   action?: { kind?: string, target?: string, digest?: string },
   *   cost?: { tokens?: number, dollars?: number, durationMs?: number },
   *   outcome?: { status?: string, artifactRef?: string },
   *   refId?: string,
   *   eval?: { judge: string, score?: number, verdict?: string, note?: string },
   * }} [input]
   */
  function record(input = {}) {
    const { identity, decision = {}, action = {}, cost = {}, outcome = {}, refId = null, eval: evalPayload = null } = input;
    if (!identity || !identity.sender) {
      throw new Error("ledger.record requires identity.sender");
    }
    // Validates the tier and stamps the isolation the doctrine mandates —
    // the trail always shows what the trust model allowed.
    const routing = routingFor(identity.tier);
    const entry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      identity: {
        sender: identity.sender,
        tier: identity.tier,
        agent: identity.agent ?? null,
        node: identity.node ?? null,
      },
      decision: {
        verdict: decision.verdict ?? "allow",
        rule: decision.rule ?? null,
        isolation: routing.isolation,
      },
      action: {
        kind: action.kind ?? "run",
        target: action.target ?? null,
        digest: action.digest ?? null,
      },
      cost: {
        tokens: cost.tokens ?? 0,
        dollars: cost.dollars ?? 0,
        durationMs: cost.durationMs ?? 0,
      },
      outcome: {
        status: outcome.status ?? "ok",
        artifactRef: outcome.artifactRef ?? null,
      },
      refId: refId ?? null,
      eval: evalPayload,
      prev: lastHash(),
    };
    entry.hash = entryHash(entry);
    deepFreeze(entry);
    store.append(entry);
    entries.push(entry);
    return entry;
  }

  /**
   * Attach an evaluation to an existing entry — by appending a NEW entry.
   * Late truth lands as new truth; the judged run is never mutated.
   * @param {string} targetId id of the entry being judged
   * @param {{ judge: "mechanical" | "model" | "human", score?: number, verdict?: string, note?: string }} evaluation
   */
  function attachEval(targetId, evaluation = {}) {
    const target = entries.find((e) => e.id === targetId);
    if (!target) throw new Error(`no ledger entry ${targetId} to evaluate`);
    const { judge, score = null, verdict = null, note = null } = evaluation;
    if (!EVAL_JUDGES.has(judge)) {
      throw new Error(`attachEval requires judge one of ${[...EVAL_JUDGES].join("|")}`);
    }
    return record({
      identity: target.identity,
      decision: { verdict: "allow", rule: "eval" },
      action: { kind: "eval", target: targetId },
      outcome: { status: "judged" },
      eval: { judge, score, verdict, note },
    });
  }

  /**
   * The trail: entries in order, filtered by attribution.
   * @param {{ sender?: string, tier?: string, agent?: string, kind?: string }} [filter]
   */
  function trail(filter = {}) {
    return entries.filter((e) => {
      if (filter.sender && e.identity.sender !== filter.sender) return false;
      if (filter.tier && e.identity.tier !== filter.tier) return false;
      if (filter.agent && e.identity.agent !== filter.agent) return false;
      if (filter.kind && e.action.kind !== filter.kind) return false;
      return true;
    });
  }

  /** Evals that have landed against an entry, oldest first. */
  function evalsOf(entryId) {
    return trail({ kind: "eval" })
      .filter((e) => e.action.target === entryId)
      .map((e) => e.eval);
  }

  /**
   * Verify the chain: every hash recomputes, every link points at its
   * predecessor. Tampering with any recorded field breaks here.
   * @returns {{ ok: true, entries: number } | { ok: false, at: string, reason: string }}
   */
  function verify() {
    let prev = GENESIS_HASH;
    for (const entry of entries) {
      if (entry.prev !== prev) {
        return { ok: false, at: entry.id, reason: "broken chain link" };
      }
      if (entryHash(entry) !== entry.hash) {
        return { ok: false, at: entry.id, reason: "altered entry" };
      }
      prev = entry.hash;
    }
    return { ok: true, entries: entries.length };
  }

  const get = (id) => entries.find((e) => e.id === id) ?? null;
  const snapshot = () => entries.slice();

  return { record, attachEval, trail, evalsOf, verify, get, snapshot };
}
