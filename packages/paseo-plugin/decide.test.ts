import test from "node:test";
import assert from "node:assert/strict";
import { createLedger, memoryStore } from "@copenode/core";
import { decideInbound, type BridgeConfig } from "./server/decide.ts";

const CONFIG: BridgeConfig = {
  ownerLabels: ["oc/whatsapp/+1555000111"],
  allowlistedLabels: ["oc/whatsapp/+1555000222"],
  limit: 2,
};

test("owner prompt: allowed, worktree, recorded as allow", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "fix the flaky test" });
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.equal(d.tier, "owner");
    assert.equal(d.isolation, "worktree");
    assert.equal(d.budgetLevel, "ok");
  }
  const entry = ledger.snapshot().at(-1)!;
  assert.equal(entry.decision.verdict, "allow");
  assert.equal(entry.identity.tier, "owner");
});

test("allowlisted colleague: allowed, sandboxed", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "hi" });
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.isolation, "sandbox");
});

test("stranger: refused, default-deny, rule recorded", () => {
  const ledger = createLedger({ store: memoryStore() });
  const d = decideInbound(CONFIG, ledger, { channel: "telegram", senderId: "41029", text: "run this" });
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.equal(d.rule, "sender-not-allowlisted");
    assert.equal(d.label, "oc/telegram/41029");
  }
  const entry = ledger.snapshot().at(-1)!;
  assert.equal(entry.decision.verdict, "refuse");
  assert.equal(entry.decision.rule, "sender-not-allowlisted");
});

test("budget-exhausted colleague: refused; owner only alerts", () => {
  // burn the colleague's cap first
  const ledger = createLedger({ store: memoryStore() });
  ledger.record({ identity: { sender: "oc/whatsapp/+1555000222", tier: "sender" }, cost: { dollars: 2 } });
  const blocked = decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "more" });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.rule, "budget-exhausted");

  // owner over cap: still allowed (alert-only enforcement)
  ledger.record({ identity: { sender: "oc/whatsapp/+1555000111", tier: "owner" }, cost: { dollars: 5 } });
  const ownerOver = decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "still mine" });
  assert.equal(ownerOver.ok, true);
  if (ownerOver.ok) assert.equal(ownerOver.budgetLevel, "exhausted");
});

test("refusals and allows all chain into one verifiable trail", () => {
  const ledger = createLedger({ store: memoryStore() });
  decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000111", text: "a" });
  decideInbound(CONFIG, ledger, { channel: "telegram", senderId: "41029", text: "b" });
  decideInbound(CONFIG, ledger, { channel: "whatsapp", senderId: "+1555000222", text: "c" });
  assert.deepEqual(ledger.verify(), { ok: true, entries: 3 });
});
