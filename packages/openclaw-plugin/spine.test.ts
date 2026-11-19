import test from "node:test";
import assert from "node:assert/strict";
import { buildSpawnRequest, type SpawnDecision } from "./lib/spine.ts";
import { formatSpawnDecision } from "./lib/verdict.ts";

test("spawn request body matches the spine's wire contract", () => {
  const body = buildSpawnRequest({ channel: "whatsapp", senderId: "+33766657966", text: "fix the flaky test" });
  assert.deepEqual(body, { channel: "whatsapp", senderId: "+33766657966", text: "fix the flaky test" });
  const withThread = buildSpawnRequest({ channel: "telegram", senderId: "alice", text: "x", threadRef: "t1" });
  assert.equal(withThread.threadRef, "t1");
});

test("verdict text: accepted runs identify tier and isolation", () => {
  const accepted: SpawnDecision = {
    ok: true,
    label: "oc/whatsapp/+33766657966",
    tier: "owner",
    isolation: "worktree",
    workspaceId: null,
    agentId: "abc12345-0000",
    ledgerEntryId: "l1",
    budgetLevel: "ok",
  };
  const text = formatSpawnDecision(accepted);
  assert.match(text, /✅/);
  assert.match(text, /tier: owner · isolation: worktree/);
  assert.match(text, /agent: abc12345/);
});

test("verdict text: refusals name the rule and the witness", () => {
  const refused: SpawnDecision = {
    ok: false,
    label: "oc/telegram/41029",
    rule: "policy:deny-rule:3",
    ledgerEntryId: "l2",
  };
  const text = formatSpawnDecision(refused);
  assert.match(text, /🚫/);
  assert.match(text, /policy:deny-rule:3/);
  assert.match(text, /recorded in the ledger/);
});
