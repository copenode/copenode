/**
 * The ingress: a small HTTP server inside the daemon plugin process that
 * the OpenClaw side posts to. Loopback/tailnet by default — the same
 * transport rule the daemon itself follows.
 *
 * Two gates before any decision:
 *   1. shared-secret token (`x-copenode-token`) — no header, no entry;
 *      forgery attempts are witnessed in the ledger, rate-limited
 *   2. per-sender concurrency cap — a spawn storm is a refusal, not an
 *      outage
 *
 * Refusals are answered, never silently dropped: every path writes its
 * decision to the ledger first.
 */

import { createServer, type Server } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLedger, jsonlStore, memoryStore, type Ledger, type LedgerStore } from "@copenode/core";
import { decideInbound, type BridgeConfig } from "./decide.ts";
import { spawnWorkspace, type SpawnRequest } from "./workspace.ts";
import { trackRun } from "./finish.ts";

export interface IngressOptions {
  config: BridgeConfig;
  ledgerPath: string;
  port: number;
  host?: string;
  /** project directory agents work in; null until configured */
  projectPath?: string | null;
  /** provider passed to `paseo run --provider` */
  provider?: string | null;
  /** model passed to `paseo run --model` — operator-set, e.g. opencode-go/glm-5.3-flash */
  model?: string | null;
  /** shared secret; every spawn must carry it in `x-copenode-token` */
  token: string;
  /** max in-flight spawns per sender label (default 3) */
  maxConcurrentPerSender?: number;
  /** how long to wait for an agent before judging it as timed out */
  finishTimeoutMs?: number;
  /** injected for tests; defaults to the real seam */
  spawn?: (
    req: SpawnRequest,
    projectPath: string | null,
    provider: string | null,
    model: string | null,
  ) => Promise<{ workspaceId: string | null; agentId: string | null }>;
  /** injected for tests */
  store?: LedgerStore;
}

export function startIngress(opts: IngressOptions): { stop: () => void; port: () => number } {
  // The daemon's cwd is wherever it was launched from — never trust it with
  // state. Create the ledger's home explicitly.
  mkdirSync(dirname(opts.ledgerPath), { recursive: true });
  const ledger: Ledger = createLedger({ store: opts.store ?? jsonlStore(opts.ledgerPath) });
  const spawn = opts.spawn ?? spawnWorkspace;
  const maxConcurrent = opts.maxConcurrentPerSender ?? 3;
  const inFlight = new Map<string, number>();
  let lastAuthLog = 0;

  function witnessAuthFailure(reason: string) {
    // Rate-limited: an unauthenticated flood must not flood the ephemeris.
    if (Date.now() - lastAuthLog < 10_000) return;
    lastAuthLog = Date.now();
    try {
      ledger.record({
        identity: { sender: "<unauthenticated>", tier: "system" },
        decision: { verdict: "refuse", rule: reason },
        action: { kind: "run" },
        outcome: { status: "refused" },
      });
    } catch {
      // the trail must never be the thing that crashes the gate
    }
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, spine: "copenode", verify: ledger.verify().ok }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/spawn") {
      // Gate 1: shared-secret token. Reachability is not authorization.
      const presented = req.headers["x-copenode-token"];
      if (!opts.token || presented !== opts.token) {
        witnessAuthFailure(presented ? "bad-token" : "no-token");
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy(); // 1MB hard cap
      });
      req.on("end", () => {
        try {
          const decision = decideInbound(opts.config, ledger, JSON.parse(body));

          if (!decision.ok) {
            res.writeHead(403, { "content-type": "application/json" });
            res.end(JSON.stringify(decision));
            return;
          }

          // Gate 2: per-sender concurrency cap — a spawn storm is a refusal.
          const inUse = inFlight.get(decision.label) ?? 0;
          if (inUse >= maxConcurrent) {
            ledger.record({
              identity: { sender: decision.label, tier: decision.tier },
              decision: { verdict: "refuse", rule: "concurrency-limit" },
              action: { kind: "run", target: null },
              outcome: { status: "refused" },
            });
            res.writeHead(429, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, label: decision.label, rule: "concurrency-limit" }));
            return;
          }
          inFlight.set(decision.label, inUse + 1);
          const release = () => {
            const n = (inFlight.get(decision.label) ?? 1) - 1;
            if (n <= 0) inFlight.delete(decision.label);
            else inFlight.set(decision.label, n);
          };

          const payload = JSON.parse(body) as { text?: string; threadRef?: string };
          spawn(
            {
              label: decision.label,
              tier: decision.tier,
              isolation: decision.isolation,
              text: payload.text ?? "",
              threadRef: payload.threadRef,
              ledgerEntryId: decision.ledgerEntryId,
            },
            opts.projectPath ?? null,
            opts.provider ?? null,
            opts.model ?? null,
          )
            .then((result) => {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ ...decision, workspaceId: result.workspaceId, agentId: result.agentId }));
              if (result.agentId) {
                // Fire-and-forget: the finish hook judges the run and appends
                // the truth to the ledger. The HTTP answer never waits for it.
                void trackRun(ledger, {
                  agentId: result.agentId,
                  originalEntryId: decision.ledgerEntryId,
                  timeoutMs: opts.finishTimeoutMs ?? 120_000,
                })
                  .catch((err: unknown) => {
                    console.error("[copenode] finish tracking failed:", err instanceof Error ? err.message : err);
                  })
                  .finally(release);
              } else {
                release();
              }
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, label: decision.label, rule: "spawn-failed", error: message }));
              release();
            });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "bad request: " + message }));
        }
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });

  const host = opts.host ?? "127.0.0.1";
  server.listen(opts.port, host);
  const port = () => {
    const address = server.address();
    return typeof address === "object" && address ? address.port : opts.port;
  };
  const ready = new Promise<number>((resolve, reject) => {
    server.once("listening", () => resolve(port()));
    server.once("error", reject);
  });
  return {
    stop: () => {
      server.close();
      server.closeAllConnections(); // hanging spawns must not pin the process
    },
    port,
    ready,
  };
}
