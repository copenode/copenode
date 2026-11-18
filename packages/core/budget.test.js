import test from "node:test";
import assert from "node:assert/strict";
import { createLedger, createBudgetGuard, memoryStore, entryHash, GENESIS_HASH } from "./index.js";

const ALICE = "oc/whatsapp/+1555000222";
const OWNER = "oc/whatsapp/+1555000111";

/** Build a standalone (non-chained) cost entry for seeding windows. */
function costEntry({ sender = ALICE, tier = "sender", dollars = 0, ts = new Date().toISOString() }) {
  const entry = {
    id: crypto.randomUUID(),
    ts,
    identity: { sender, tier, agent: null, node: null },
    decision: { verdict: "allow", rule: null, isolation: "sandbox" },
    action: { kind: "run", target: null, digest: null },
    cost: { tokens: 0, dollars, durationMs: 0 },
    outcome: { status: "ok", artifactRef: null },
    refId: null,
    eval: null,
    prev: GENESIS_HASH,
  };
  entry.hash = entryHash(entry);
  return entry;
}

test("sender tier hard-blocks at the limit", () => {
  const ledger = createLedger({ store: memoryStore([costEntry({ dollars: 1.5 })]) });
  ledger.record({ identity: { sender: ALICE, tier: "sender" }, cost: { dollars: 0.6 } });
  const guard = createBudgetGuard({ ledger, limit: 2 });
  const check = guard.check({ sender: ALICE, tier: "sender" });
  assert.equal(check.allowed, false);
  assert.equal(check.level, "exhausted");
  assert.equal(check.enforcement, "block");
  assert.equal(check.remaining, 0);
});

test("alert fires at the threshold but work is allowed", () => {
  const ledger = createLedger({ store: memoryStore([costEntry({ dollars: 1.7 })]) });
  const guard = createBudgetGuard({ ledger, limit: 2 });
  const check = guard.check({ sender: ALICE, tier: "sender" });
  assert.equal(check.allowed, true);
  assert.equal(check.level, "alert");
});

test("owner tier is alert-only — never blocked", () => {
  const ledger = createLedger({ store: memoryStore([costEntry({ sender: OWNER, tier: "owner", dollars: 3 })]) });
  const guard = createBudgetGuard({ ledger, limit: 2 });
  const check = guard.check({ sender: OWNER, tier: "owner" });
  assert.equal(check.level, "exhausted");
  assert.equal(check.allowed, true); // instruments, not walls
  assert.equal(check.enforcement, "alert");
});

test("spend outside the rolling window does not count", () => {
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // yesterday
  const ledger = createLedger({
    store: memoryStore([costEntry({ dollars: 1.9, ts: stale })]),
  });
  const guard = createBudgetGuard({ ledger, limit: 2 });
  const check = guard.check({ sender: ALICE, tier: "sender" });
  assert.equal(check.level, "ok");
  assert.equal(check.spent, 0);
});

test("pending dollars are pre-flighted against the cap", () => {
  const ledger = createLedger({ store: memoryStore([costEntry({ dollars: 1.5 })]) });
  const guard = createBudgetGuard({ ledger, limit: 2 });
  const fine = guard.check({ sender: ALICE, tier: "sender", pendingDollars: 0.4 });
  assert.equal(fine.level, "alert"); // 1.9 >= 80% of 2
  assert.equal(fine.allowed, true);
  const over = guard.check({ sender: ALICE, tier: "sender", pendingDollars: 0.6 });
  assert.equal(over.level, "exhausted");
  assert.equal(over.allowed, false);
});

test("guard validates its inputs", () => {
  const ledger = createLedger();
  assert.throws(() => createBudgetGuard({ ledger, limit: 0 }));
  const guard = createBudgetGuard({ ledger, limit: 1 });
  assert.throws(() => guard.check({ tier: "owner" }));
  assert.throws(() => guard.check({ sender: "x", tier: "guest" }));
});
