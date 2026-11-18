import test from "node:test";
import assert from "node:assert/strict";
import { mechanicalVerdict, type FinishObservation } from "./server/finish.ts";

const obs = (over: Partial<FinishObservation>): FinishObservation => ({
  finishedClean: true,
  changedFiles: [],
  statSummary: null,
  worktree: "humane-skunk",
  observedStatus: "finished",
  ...over,
});

test("mechanical verdict: clean finish with changes passes", () => {
  const v = mechanicalVerdict(obs({ changedFiles: ["orbit.txt"] }));
  assert.equal(v.verdict, "pass");
  assert.match(v.note, /1 file\(s\) changed: orbit\.txt/);
});

test("mechanical verdict: clean finish without changes is a pass (conversational)", () => {
  const v = mechanicalVerdict(obs({}));
  assert.equal(v.verdict, "pass");
  assert.match(v.note, /no file changes/);
});

test("mechanical verdict: unclean finish fails with the reason", () => {
  const v = mechanicalVerdict(obs({ finishedClean: false, observedStatus: "timeout", error: "wait timed out" }));
  assert.equal(v.verdict, "fail");
  assert.match(v.note, /did not finish cleanly/);
});
