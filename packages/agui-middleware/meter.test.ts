import test from "node:test";
import assert from "node:assert/strict";
import { SseParser, meterEvent, newRunMeter, type AguiEvent } from "./lib/agui.ts";
import { AguiMeter } from "./meter.ts";
import { createLedger, memoryStore } from "@copenode/core";

const EVENTS: AguiEvent[] = [
  { type: "RUN_STARTED", data: { runId: "run-1" } },
  { type: "TEXT_MESSAGE_START", data: {} },
  { type: "TOOL_CALL_START", data: { toolCallId: "t1" } },
  { type: "TOOL_CALL_END", data: { toolCallId: "t1" } },
  { type: "TOOL_CALL_START", data: { toolCallId: "t2" } },
  { type: "SUBAGENT_STARTED", data: {} },
  { type: "RUN_FINISHED", data: { runId: "run-1" } },
];

test("SseParser handles chunk boundaries and data framing", () => {
  const parser = new SseParser();
  const split = EVENTS.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  const full = split.join("");
  const mid = Math.floor(full.length / 3);
  const first = parser.push(full.slice(0, mid));
  const second = parser.push(full.slice(mid));
  const all = [...first, ...second];
  assert.equal(all.length, EVENTS.length);
  assert.deepEqual(all.map((e) => e.type), EVENTS.map((e) => e.type));
});

test("meter: one run row, finish with tool count, eval attached", () => {
  const meter = new AguiMeter({ sender: "oc/openclaw/+33665039280", tier: "owner" }, memoryStore());
  const ledger = meter.ledger;
  for (const e of EVENTS) meter.consume(e);
  assert.equal(meter.settled, true);
  const rows = ledger.trail();
  assert.equal(rows.length, 3); // spawn + finish + eval
  assert.equal(rows[0].outcome.status, "running");
  assert.equal(rows[1].outcome.status, "finished");
  assert.equal(rows[1].action.target, "run-1");
  assert.equal(rows[1].refId, rows[0].id);
  const evals = ledger.evalsOf(rows[0].id);
  assert.equal(evals.length, 1);
  assert.match(evals[0].note ?? "", /2 tool call/);
});

test("meter: RUN_ERROR finishes with a fail verdict", () => {
  const meter = new AguiMeter({ sender: "x", tier: "system" }, memoryStore());
  const ledger = meter.ledger;
  meter.consume({ type: "RUN_STARTED", data: {} });
  meter.consume({ type: "RUN_ERROR", data: { message: "boom" } });
  const rows = ledger.trail();
  assert.equal(rows.length, 3);
  assert.equal(rows[1].outcome.status, "error");
  const evals = ledger.evalsOf(rows[0].id);
  assert.equal(evals[0].verdict, "fail");
});

test("meter: pre-run events are not metered; identity is per-instance", () => {
  const meter = new AguiMeter({ sender: "oc/other/agent-9", tier: "sender" }, memoryStore());
  const ledger = meter.ledger;
  meter.consume({ type: "TEXT_MESSAGE_START", data: {} });
  assert.equal(meter.activeRun, null);
  meter.consume({ type: "RUN_STARTED", data: {} });
  assert.equal(meter.activeRun?.runMeter.started, true);
  assert.equal(ledger.trail()[0].identity.sender, "oc/other/agent-9");
});

test("meterEvent: counts tools and subagents", () => {
  const meter = newRunMeter();
  meterEvent(meter, { type: "RUN_STARTED", data: {} });
  meterEvent(meter, { type: "TOOL_CALL_START", data: {} });
  meterEvent(meter, { type: "TOOL_CALL_START", data: {} });
  meterEvent(meter, { type: "SUBAGENT_STARTED", data: {} });
  meterEvent(meter, { type: "RUN_FINISHED", data: {} });
  assert.equal(meter.toolCalls, 2);
  assert.equal(meter.subagents, 1);
  assert.equal(meter.finished, true);
});
