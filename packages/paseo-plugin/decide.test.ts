import test from "node:test";
import assert from "node:assert/strict";
import { createLedger, memoryStore, loadPolicy, type Policy } from "@copenode/core";
import { decideInbound } from "./server/decide.ts";

const DOC = {
  userGroups: {
    owners: { labels: ["oc/whatsapp/+1555000111"] },
    senders: { labels: ["oc/whatsapp/+1555000222"] },
  },
  rules: [
    {
      userGroup: "owners", agentGroup: "coding-fleet",
      allow: ["spawn", "steer"],
      bounds: { isolation: "worktree", spendCap: 2, maxDepth: 0 },
    },
    {
      userGroup: "senders", agentGroup: "coding-fleet",
      allow: ["spawn"],
      bounds: { isolation: "sandbox", spendCap: 1, maxDepth: 0 },
    },
    { userGroup: "*", agentGroup: "*", deny: ["*"] },
  ],
};

const config = { policy: loadPolicy(DOC) as Policy, limit: 2 };

test("owner grant: allowed, worktree, rule named", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "fix the flaky test" });
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.equal(d.tier, "owner");
    assert.equal(d.isolation, "worktree");
  }
  const entry = ledger.snapshot().at(-1)!;
  assert.equal(entry.decision.rule, "policy:rule0");
});

test("sender grant: allowed, sandboxed at the grant's cap", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "hi" });
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.equal(d.isolation, "sandbox");
    assert.equal(d.budgetLevel, "ok");
  }
});

test("unknown sender: refused, no petition (system orbit doesn't petition)", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(config, ledger, { channel: "telegram", senderId: "41029", text: "run this" });
  assert.equal(d.ok, false);
  if (!d.ok) assert.match(d.rule, /policy:/);
  const kinds = ledger.snapshot().map((e) => e.action.kind);
  assert.ok(!kinds.includes("policy-request"));
});

test("known-group denial leaves exactly one petition (deduped)", () => {
  // a policy where the owners' coding-fleet grant is absent
  const restrictive = {
    policy: loadPolicy({
      userGroups: { owners: { labels: ["oc/whatsapp/+1555000111"] } },
      rules: [{ userGroup: "*", agentGroup: "*", deny: ["*"] }],
    }) as Policy,
    limit: 2,
  };
  const ledger = createLedger({ store: memoryStore() });
  decideInbound(restrictive, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "a" });
  decideInbound(restrictive, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "b" });
  const petitions = ledger.trail({ kind: "policy-request" });
  assert.equal(petitions.length, 1);
  assert.equal(petitions[0].action.target, "owners/coding-fleet/spawn");
});

test("grant cap replaces the fallback: sender blocked at the grant's $1", () => {
  const ledger = createLedger({ store: memoryStore() });
  ledger.record({ identity: { sender: "oc/whatsapp/+1555000222", tier: "sender" }, cost: { dollars: 1 } });
  const d = decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "more" });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.rule, "budget-exhausted");
});

test("owner over the grant cap: alert-only, still allowed", () => {
  const ledger = createLedger({ store: memoryStore() });
  ledger.record({ identity: { sender: "oc/whatsapp/+1555000111", tier: "owner" }, cost: { dollars: 5 } });
  const d = decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "still mine" });
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.budgetLevel, "exhausted");
});

test("every path chains into one verifiable trail", () => {
  const ledger = createLedger({ store: memoryStore() });
  decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "a" });
  decideInbound(config, ledger, { channel: "telegram", senderId: "41029", text: "b" });
  decideInbound(config, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "c" });
  assert.deepEqual(ledger.verify(), { ok: true, entries: 3 });
});
