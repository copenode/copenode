import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mechanicalVerdict, harvestOpencodeUsage, type FinishObservation } from "./server/finish.ts";

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

test("mechanical verdict: error status fails even with no changes (not conversational)", () => {
  const v = mechanicalVerdict(obs({ observedStatus: "error" }));
  assert.equal(v.verdict, "fail");
  assert.match(v.note, /error/);
});

test("harvestOpencodeUsage maps the newest session in the worktree", () => {
  const dir = mkdtempSync(join(tmpdir(), "copenode-oc-"));
  const dbPath = join(dir, "opencode.db");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(
      `CREATE TABLE session_v2 (
        id text PRIMARY KEY, directory text NOT NULL,
        cost real DEFAULT 0 NOT NULL,
        tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL,
        tokens_reasoning integer DEFAULT 0 NOT NULL,
        summary_additions integer, summary_deletions integer, summary_files integer,
        time_created integer NOT NULL)`,
    );
    db.prepare(
      `INSERT INTO session_v2 (id, directory, cost, tokens_input, tokens_output, tokens_reasoning, time_created)
       VALUES ('ses_old', '/wt/other', 3.5, 999, 9, 0, ?)`,
    ).run(Date.now() - 60_000);
    db.prepare(
      `INSERT INTO session_v2 (id, directory, cost, tokens_input, tokens_output, tokens_reasoning,
       summary_additions, summary_deletions, summary_files, time_created)
       VALUES ('ses_mine', '/wt/mine', 0.0, 5803, 43, 7, 1, 0, 1, ?)`,
    ).run(Date.now());
    db.close();

    const u = harvestOpencodeUsage(dbPath, "/wt/mine", Date.now() - 30_000);
    assert.ok(u);
    assert.equal(u.sessionId, "ses_mine");
    assert.equal(u.tokens, 5853); // input + output + reasoning
    assert.equal(u.dollars, 0); // subscription run
    assert.equal(u.files, 1);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows file-lock quirk: temp dir left for OS cleanup */ }
  }
});

test("harvestOpencodeUsage: stale sessions and missing dbs return null", () => {
  assert.equal(harvestOpencodeUsage(join(tmpdir(), "copenode-nonexistent-xyz"), "/wt", Date.now()), null);
  const dir = mkdtempSync(join(tmpdir(), "copenode-oc-"));
  const dbPath = join(dir, "opencode.db");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(
      `CREATE TABLE session_v2 (id text PRIMARY KEY, directory text NOT NULL, cost real DEFAULT 0 NOT NULL,
       tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL,
       tokens_reasoning integer DEFAULT 0 NOT NULL, time_created integer NOT NULL)`,
    );
    db.prepare(
      `INSERT INTO session_v2 (id, directory, cost, tokens_input, tokens_output, tokens_reasoning, time_created)
       VALUES ('ses_stale', '/wt/mine', 1.0, 5, 5, 0, ?)`,
    ).run(Date.now() - 10 * 60_000);
    db.close();
    // the session predates this run window: not our metering
    assert.equal(harvestOpencodeUsage(dbPath, "/wt/mine", Date.now()), null);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows file-lock quirk */ }
  }
});
