/**
 * AG-UI event mapping — the protocol-lane grammar.
 *
 * AG-UI 1.0 streams Server-Sent Events whose `data:` payloads are typed
 * JSON objects. This module parses those payloads and maps them onto the
 * copenode ledger grammar:
 *
 *   RUN_STARTED            -> run row (spawned)
 *   TOOL_CALL_START        -> tool-call count on the current run
 *   RUN_FINISHED           -> run row (finished, with duration)
 *   RUN_ERROR              -> run row (error)
 *   SUBAGENT_STARTED       -> subagent count
 *
 * v0 is observe-only: the middleware reads streams, never blocks or
 * mutates a third party's traffic. Identity is per-instance config — the
 * operator points the meter at a known deployment.
 */

export type AguiEventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "STEP_STARTED"
  | "STEP_FINISHED"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TEXT_MESSAGE_CHUNK"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "MESSAGES_SNAPSHOT"
  | "REASONING_START"
  | "REASONING_END"
  | "SUBAGENT_STARTED"
  | "SUBAGENT_FINISHED"
  | "SUBAGENT_ERROR"
  | "CUSTOM"
  | "RAW"
  | string;

export interface AguiEvent {
  type: AguiEventType;
  data: Record<string, unknown>;
}

/**
 * Incremental SSE parser: feed raw bytes, get complete `data:` payloads.
 * Handles chunk boundaries; keeps unfinished tails in its own buffer.
 */
export class SseParser {
  private buffer = "";

  push(chunk: string): AguiEvent[] {
    this.buffer += chunk;
    const events: AguiEvent[] = [];
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { type?: string };
        if (parsed && typeof parsed.type === "string") {
          events.push({ type: parsed.type, data: parsed as Record<string, unknown> });
        }
      } catch {
        // a torn event tail: unattended-mode discipline, skip and carry on
      }
    }
    return events;
  }
}

/** The metered summary of one AG-UI run. */
export interface RunMeter {
  started: boolean;
  finished: boolean;
  errored: boolean;
  toolCalls: number;
  subagents: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
}

export function newRunMeter(): RunMeter {
  return {
    started: false,
    finished: false,
    errored: false,
    toolCalls: 0,
    subagents: 0,
    startedAtMs: null,
    finishedAtMs: null,
  };
}

/** Feed one event into the run meter. Pure state update. */
export function meterEvent(meter: RunMeter, event: AguiEvent, nowMs = Date.now()): void {
  switch (event.type) {
    case "RUN_STARTED":
      meter.started = true;
      meter.startedAtMs = nowMs;
      break;
    case "RUN_FINISHED":
      meter.finished = true;
      meter.finishedAtMs = nowMs;
      break;
    case "RUN_ERROR":
      meter.errored = true;
      meter.finishedAtMs = nowMs;
      break;
    case "TOOL_CALL_START":
      meter.toolCalls += 1;
      break;
    case "SUBAGENT_STARTED":
      meter.subagents += 1;
      break;
    default:
      break;
  }
}
