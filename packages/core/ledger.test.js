import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLedger,
  memoryStore,
  jsonlStore,
  entryHash,
  GENESIS_HASH,
  senderToLabel,
  routingFor,
  classifySender,
} from "./index.js";

const OWNER = { sender: "oc/whatsapp/+1555000111", tier: "owner", agent: "paseo/main", node: "paseo-local" };
const COLLEAGUE = { sender: "oc/whatsapp/+1555000222", tier: "sender", agent: "paseo/main", node: "paseo-local" };

test("entries chain link to link, genesis first", () => {
  const ledger = createLedger();
  const a = ledger.record({ identity: OWNER, action: { kind: "message" } });
  const b = ledger.record({ identity: COLLEAGUE, action: { kind: "run" }, cost: { tokens: 1200, dollars: 0.004 } });
  assert.equal(a.prev, GENESIS_HASH);
  assert.equal(b.prev, a.hash);
  assert.deepEqual(ledger.verify(), { ok: true, entries: 2 });
});

test("tampering with a recorded cost is detected", () => {
  const ledger = createLedger();
  ledger.record({ identity: OWNER, cost: { tokens: 100 } });
  const tampered = ledger.snapshot().map((e) => structuredClone(e));
  tampered[0].cost.tokens = 1; // rewrite history
  const forensic = createLedger({ store: memoryStore(tampered) });
  const result = forensic.verify();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "altered entry");
});

test("trail filters by sender and keeps order", () => {
  const ledger = createLedger();
  ledger.record({ identity: OWNER, action: { kind: "run" } });
  ledger.record({ identity: COLLEAGUE, action: { kind: "run" } });
  ledger.record({ identity: COLLEAGUE, action: { kind: "tool_call" } });
  const hers = ledger.trail({ sender: COLLEAGUE.sender });
  assert.equal(hers.length, 2);
  assert.deepEqual(hers.map((e) => e.action.kind), ["run", "tool_call"]);
});

test("refusals are recorded and carry the rule", () => {
  const ledger = createLedger();
  const refused = ledger.record({
    identity: { sender: "oc/telegram/999", tier: "system" },
    decision: { verdict: "refuse", rule: "sender-not-allowlisted" },
    action: { kind: "run", target: "paseo:workspace-7" },
  });
  assert.equal(refused.decision.verdict, "refuse");
  assert.equal(refused.decision.rule, "sender-not-allowlisted");
  assert.equal(refused.decision.isolation, "sandbox");
});

test("owner tier stamps worktree isolation", () => {
  const ledger = createLedger();
  const entry = ledger.record({ identity: OWNER });
  assert.equal(entry.decision.isolation, "worktree");
});

test("evals append as new entries; the judged run is never mutated", () => {
  const ledger = createLedger();
  const run = ledger.record({ identity: COLLEAGUE, action: { kind: "run" }, outcome: { artifactRef: "diff:abc123" } });
  const before = structuredClone(run);
  ledger.attachEval(run.id, { judge: "mechanical", verdict: "tests-pass" });
  ledger.attachEval(run.id, { judge: "human", verdict: "approve", score: 5 });
  assert.deepEqual(ledger.get(run.id), before); // untouched
  const evals = ledger.evalsOf(run.id);
  assert.equal(evals.length, 2);
  assert.equal(evals[0].judge, "mechanical");
  assert.equal(evals[1].judge, "human");
  assert.deepEqual(ledger.verify(), { ok: true, entries: 3 });
});

test("attachEval rejects unknown judges and missing targets", () => {
  const ledger = createLedger();
  const run = ledger.record({ identity: OWNER });
  assert.throws(() => ledger.attachEval(run.id, { judge: "vibes" }));
  assert.throws(() => ledger.attachEval("no-such-id", { judge: "human" }));
});

test("record validates identity and tier", () => {
  const ledger = createLedger();
  assert.throws(() => ledger.record({ identity: { tier: "owner" } }));
  assert.throws(() => ledger.record({ identity: { sender: "x", tier: "guest" } }));
});

test("jsonl store roundtrips and stays verifiable", () => {
  const dir = mkdtempSync(join(tmpdir(), "copenode-ledger-"));
  const path = join(dir, "ledger.jsonl");
  try {
    const ledger = createLedger({ store: jsonlStore(path) });
    const run = ledger.record({ identity: COLLEAGUE, cost: { tokens: 900, dollars: 0.003 } });
    ledger.attachEval(run.id, { judge: "model", score: 4, verdict: "on-target" });

    const reopened = createLedger({ store: jsonlStore(path) });
    assert.equal(reopened.snapshot().length, 2);
    assert.deepEqual(reopened.verify(), { ok: true, entries: 2 });
    assert.equal(reopened.evalsOf(run.id)[0].judge, "model");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("jsonl store tolerates a torn tail, refuses mid-file corruption", () => {
  const dir = mkdtempSync(join(tmpdir(), "copenode-ledger-"));
  const path = join(dir, "ledger.jsonl");
  try {
    const ledger = createLedger({ store: jsonlStore(path) });
    ledger.record({ identity: OWNER, cost: { dollars: 0.5 } });
    ledger.record({ identity: COLLEAGUE, cost: { dollars: 0.25 } });
    const store = jsonlStore(path);
    const good = readFileSync(path, "utf8");

    // power loss mid-append: last line cut in half, no trailing newline
    writeFileSync(path, good.slice(0, good.length - 30));
    const healed = jsonlStore(path);
    assert.equal(healed.tornTail, true);
    assert.equal(healed.all().length, 1); // the complete entry survived

    // corruption mid-file is never swallowed
    const lines = good.split("\n");
    writeFileSync(path, [lines[0], "{oops not json", ...lines.slice(1)].join("\n"));
    assert.throws(() => jsonlStore(path), SyntaxError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("classifySender is default-deny and label-driven", () => {
  const policy = { ownerLabels: ["oc/whatsapp/+1555000111"], allowlistedLabels: ["oc/whatsapp/+1555000222"] };
  const owner = classifySender({ channel: "whatsapp", senderId: "+1555000111" }, policy);
  assert.deepEqual(owner, { label: "oc/whatsapp/+1555000111", tier: "owner" });
  const colleague = classifySender({ channel: "whatsapp", senderId: "+1555000222" }, policy);
  assert.deepEqual(colleague, { label: "oc/whatsapp/+1555000222", tier: "sender" });
  const stranger = classifySender({ channel: "telegram", senderId: "999" }, policy);
  assert.equal(stranger.tier, null);
  assert.equal(stranger.reason, "sender-not-allowlisted");
  assert.equal(stranger.label, "oc/telegram/999");
});

test("trust primitives hold (moved to trust.js, still exported)", () => {
  assert.equal(senderToLabel({ channel: "WhatsApp", senderId: "+1555 000-111" }), "oc/whatsapp/+1555000-111");
  assert.deepEqual(routingFor("owner"), { isolation: "worktree", scopedCredentials: false });
  assert.deepEqual(routingFor("system"), { isolation: "sandbox", scopedCredentials: true });
  assert.throws(() => routingFor("intern"));
});
