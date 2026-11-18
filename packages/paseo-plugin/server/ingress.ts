/**
 * The ingress: a small HTTP server inside the daemon plugin process that
 * the OpenClaw side posts to. Loopback/tailnet by default — the same
 * transport rule the daemon itself follows. Refusals are answered, never
 * silently dropped: every path writes its decision to the ledger first.
 */

import { createServer, type Server } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLedger, jsonlStore } from "@copenode/core";
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
  /** model passed to `paseo run --model` (e.g. opencode-go/kimi-k3) */
  model?: string | null;
  /** how long to wait for an agent before judging it as timed out */
  finishTimeoutMs?: number;
  /** injected for tests; defaults to the real seam */
  spawn?: (
    req: SpawnRequest,
    projectPath: string | null,
    provider: string | null,
    model: string | null,
  ) => Promise<{ workspaceId: string | null; agentId: string | null }>;
}

export function startIngress(opts: IngressOptions): { stop: () => void; port: () => number } {
  // The daemon's cwd is wherever it was launched from — never trust it with
  // state. Create the ledger's home explicitly.
  mkdirSync(dirname(opts.ledgerPath), { recursive: true });
  const ledger = createLedger({ store: jsonlStore(opts.ledgerPath) });
  const spawn = opts.spawn ?? spawnWorkspace;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, spine: "copenode", verify: ledger.verify().ok }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/spawn") {
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
          // Allowed: hand to the workspace seam, then answer with ids.
          const payload = JSON.parse(body) as { text?: string; threadRef?: string };
          spawn({
            label: decision.label,
            tier: decision.tier,
            isolation: decision.isolation,
            text: payload.text ?? "",
            threadRef: payload.threadRef,
            ledgerEntryId: decision.ledgerEntryId,
          }, opts.projectPath ?? null, opts.provider ?? null, opts.model ?? null)
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
                }).catch((err: unknown) => {
                  console.error("[copenode] finish tracking failed:", err instanceof Error ? err.message : err);
                });
              }
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, label: decision.label, rule: "spawn-failed", error: message }));
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
  const address = server.address();
  return {
    stop: () => server.close(),
    port: () => (typeof address === "object" && address ? address.port : opts.port),
  };
}
