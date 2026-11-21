/**
 * The finish hook: when a spawned agent completes, observe what it did,
 * judge it mechanically, and append the truth to the ledger.
 *
 *   observe (paseo wait + ls + git) -> mechanicalVerdict (pure) -> record + attachEval
 *
 * The judged anchor is the ORIGINAL spawn entry (refId links the finish
 * event back to its spawn); the mechanical eval attaches to that same
 * anchor. Late truth lands as new truth — the spawn row is never edited.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Ledger } from "@copenode/core";

const run = promisify(execFile);

export interface FinishObservation {
  finishedClean: boolean;
  changedFiles: string[];
  statSummary: string | null;
  worktree: string | null;
  observedStatus: string;
  error?: string;
}

/** Pure: the mechanical judge — cheap, deterministic, no model. */
export function mechanicalVerdict(obs: FinishObservation): { verdict: "pass" | "fail"; note: string } {
  const badStatus = /error|fail/i.test(obs.observedStatus);
  if (!obs.finishedClean || badStatus) {
    return { verdict: "fail", note: `did not finish cleanly: ${obs.error ?? obs.observedStatus}` };
  }
  if (obs.changedFiles.length === 0) {
    return { verdict: "pass", note: "finished, no file changes (conversational task)" };
  }
  return { verdict: "pass", note: `finished; ${obs.changedFiles.length} file(s) changed: ${obs.changedFiles.join(", ").slice(0, 200)}` };
}

/**
 * Harvest the run's metering from OpenCode's own ledger: per-session cost
 * and token counts, recorded by the provider harness itself.
 *
 * Mapping: the agent ran in `worktreeDir`; OpenCode keys sessions by
 * `directory`, so the newest session in that directory created after the
 * run started is this run's session. Dollars come from the harness
 * (subscription runs report 0 — the tokens are the metered capacity).
 */
export function harvestOpencodeUsage(
  dbPath: string,
  worktreeDir: string,
  sinceMs: number,
): { sessionId: string; dollars: number; tokens: number; additions: number | null; deletions: number | null; files: number | null } | null {
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare(
        `SELECT id, cost, tokens_input, tokens_output, tokens_reasoning, summary_additions, summary_deletions, summary_files, time_created
         FROM session_v2 WHERE directory = ? ORDER BY time_created DESC LIMIT 1`,
      )
      .get(worktreeDir) as
      | { id: string; cost: number; tokens_input: number; tokens_output: number; tokens_reasoning: number; summary_additions: number | null; summary_deletions: number | null; summary_files: number | null; time_created: number }
      | undefined;
    db.close();
    if (!row) return null;
    // A session from before this run is not this run's metering (60s slack).
    if (typeof row.time_created === "number" && row.time_created < sinceMs - 60_000) return null;
    return {
      sessionId: row.id,
      dollars: row.cost ?? 0,
      tokens: (row.tokens_input ?? 0) + (row.tokens_output ?? 0) + (row.tokens_reasoning ?? 0),
      additions: row.summary_additions ?? null,
      deletions: row.summary_deletions ?? null,
      files: row.summary_files ?? null,
    };
  } catch {
    return null; // the metering lens must never fail the verdict
  }
}

async function safeRun(cmd: string, args: string[], cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { ...(cwd ? { cwd } : {}), encoding: "utf8" });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Track one spawned agent to completion, then write the finish event and
 * the mechanical eval. Fire-and-forget safe: never throws to the caller.
 */
export async function trackRun(
  ledger: Ledger,
  opts: {
    agentId: string;
    originalEntryId: string;
    timeoutMs: number;
  },
): Promise<void> {
  const started = Date.now();
  const anchor = ledger.get(opts.originalEntryId);
  if (!anchor) throw new Error(`trackRun: unknown ledger entry ${opts.originalEntryId}`);

  let finishedClean = true;
  let error: string | undefined;
  try {
    await run("paseo", ["wait", opts.agentId, "--timeout", String(Math.ceil(opts.timeoutMs / 1000))]);
  } catch (err) {
    finishedClean = false;
    error = err instanceof Error ? err.message.slice(0, 200) : String(err);
  }

  // Observe: status + worktree dir from `paseo ls --json`.
  let observedStatus = finishedClean ? "finished" : "timeout";
  let cwd: string | null = null;
  const lsRaw = await safeRun("paseo", ["ls", "--json"]);
  if (lsRaw) {
    try {
      const agents = JSON.parse(lsRaw) as Array<{ id?: string; status?: string; cwd?: string }>;
      const me = agents.find((a) => a.id === opts.agentId);
      if (me) {
        if (typeof me.status === "string") observedStatus = me.status;
        if (typeof me.cwd === "string") {
          // Paseo reports tildified paths; exec() never expands them.
          cwd = me.cwd.startsWith("~") ? join(homedir(), me.cwd.slice(1)) : me.cwd;
        }
      }
    } catch {
      // unparseable listing; observation stays at wait-based values
    }
  }

  // Diff: stage everything in the worktree and read the summary.
  let changedFiles: string[] = [];
  let statSummary: string | null = null;
  if (cwd) {
    await safeRun("git", ["add", "-A"], cwd);
    const names = await safeRun("git", ["diff", "--cached", "--name-only"], cwd);
    if (names) changedFiles = names.split("\n").map((s) => s.trim()).filter(Boolean);
    const stat = await safeRun("git", ["diff", "--cached", "--stat"], cwd);
    if (stat) statSummary = stat.trim().split("\n").slice(-1)[0] ?? null;
  }

  const obs: FinishObservation = {
    finishedClean,
    changedFiles,
    statSummary,
    worktree: cwd ? basename(cwd) : null,
    observedStatus,
    error,
  };
  const verdict = mechanicalVerdict(obs);

  // Metering lens: harvest the run's cost + tokens from OpenCode's own
  // ledger. Subscription runs bill $0 — the tokens are the metered capacity.
  let usageNote = "";
  let usageCost = 0;
  let usageTokens = 0;
  try {
    if (cwd) {
      const usage = harvestOpencodeUsage(
        join(homedir(), ".local", "share", "opencode", "opencode.db"),
        cwd,
        started,
      );
      if (usage) {
        usageCost = usage.dollars;
        usageTokens = usage.tokens;
        usageNote = ` · usage: ${usage.tokens.toLocaleString()} tok${
          usage.dollars > 0 ? ` · $${usage.dollars.toFixed(4)}` : ""
        }`;
      }
    }
  } catch {
    // the metering lens must never fail the verdict
  }

  // Vendored Floorplan skill: a governed run may have updated the project's
  // map. When it did, the eval note says so — the thread's "how well it went"
  // then points at a visual, not just a diff stat.
  let extras = "";
  try {
    if (cwd) {
      const mapNote = join(cwd, "floorplan", "recent-work.json");
      if (existsSync(mapNote) && statSync(mapNote).mtimeMs >= started) {
        extras = " · floorplan map updated";
      }
    }
  } catch {
    // the note is best-effort; the run's verdict never depends on it
  }

  // The finish event, linked back to its spawn via refId.
  ledger.record({
    identity: anchor.identity,
    decision: { verdict: "allow", rule: "agent-finished" },
    action: { kind: "run", target: opts.agentId },
    cost: { dollars: usageCost, tokens: usageTokens, durationMs: Date.now() - started },
    outcome: {
      status: observedStatus,
      artifactRef: obs.worktree ? `worktree:${obs.worktree}` : null,
    },
    refId: opts.originalEntryId,
  });

  // The mechanical eval, attached to the spawn anchor (the judged run).
  ledger.attachEval(opts.originalEntryId, {
    judge: "mechanical",
    verdict: verdict.verdict,
    note: verdict.note + usageNote + extras,
  });

  console.log(`[copenode] finish ${opts.agentId.slice(0, 8)}: ${observedStatus} · ${verdict.verdict} · ${verdict.note}${usageNote}${extras}`);
}
