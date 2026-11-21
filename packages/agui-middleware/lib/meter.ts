/**
 * The meter: turns AG-UI event streams into copenode ledger rows.
 *
 * One row per run: spawn on RUN_STARTED, finish on RUN_FINISHED/ERROR —
 * linked by refId, carrying tool-call and subagent counts. The middleware
 * never judges a third party's work; it guarantees attribution.
 *
 * The ledger is opened once and shared; metering failures are silent
 * (the lane's traffic must never be broken by the observer).
 */

import { createLedger, type Ledger, type LedgerStore } from "@copenode/core";
import { meterEvent, newRunMeter, SseParser, type AguiEvent, type RunMeter } from "./agui.ts";

export interface MeterConfig {
  /** identity recorded on every row this instance meters */
  sender: string;
  tier: "owner" | "sender" | "system";
}

export interface ActiveRun {
  runMeter: RunMeter;
  ledgerEntryId: string;
  started: number;
}

export class AguiMeter {
  readonly ledger: Ledger;
  private readonly config: MeterConfig;
  private readonly parser = new SseParser();
  private active: ActiveRun | null = null;

  constructor(config: MeterConfig, store: LedgerStore) {
    this.config = config;
    this.ledger = createLedger({ store });
  }

  get activeRun(): ActiveRun | null {
    return this.active;
  }

  /** Feed one parsed AG-UI event. */
  consume(event: AguiEvent): void {
    try {
      if (!this.active) {
        if (event.type !== "RUN_STARTED") return; // pre-run events are not metered
        const entry = this.ledger.record({
          identity: { sender: this.config.sender, tier: this.config.tier },
          decision: { verdict: "allow", rule: "agui-metered" },
          action: { kind: "run", target: String(event.data.runId ?? event.data.threadId ?? "unknown") },
          outcome: { status: "running" },
        });
        this.active = { runMeter: newRunMeter(), ledgerEntryId: entry.id, started: Date.now() };
      }

      const meter = this.active.runMeter;
      meterEvent(meter, event, Date.now());

      if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") {
        const run = this.active;
        const durationMs = run.startedAtMs !== null && meter.finishedAtMs !== null
          ? meter.finishedAtMs - run.startedAtMs
          : null;
        this.ledger.record({
          identity: { sender: this.config.sender, tier: this.config.tier },
          decision: { verdict: "allow", rule: "agent-finished" },
          action: { kind: "run", target: String(event.data.runId ?? "unknown") },
          cost: { durationMs: durationMs ?? (Date.now() - run.started) },
          outcome: {
            status: event.type === "RUN_ERROR" ? "error" : "finished",
            artifactRef: meter.toolCalls > 0 ? `tool_calls:${meter.toolCalls}` : null,
          },
          refId: run.ledgerEntryId,
        });
        this.ledger.attachEval(run.ledgerEntryId, {
          judge: "mechanical",
          verdict: event.type === "RUN_ERROR" || meter.errored ? "fail" : "pass",
          note: `finished: ${meter.toolCalls} tool call(s), ${meter.subagents} subagent(s)`,
        });
        this.active = null;
      }
    } catch (err) {
      console.error("[copenode-agui] metering error:", err instanceof Error ? err.message : err);
    }
  }

  /** Feed raw SSE bytes (a chunk may split events). */
  consumeRaw(chunk: string): void {
    for (const event of this.parser.push(chunk)) this.consume(event);
  }

  /** True when the current stream has delivered a terminal run event. */
  get settled(): boolean {
    return this.active === null;
  }
}
