/**
 * copenode — Paseo plugin entry (daemon side).
 *
 * Starts the ingress the OpenClaw side posts to. No UI in v0.
 *
 * Startup runs the gate (core/evaluateStartup):
 *   bootstrap — first start ever: apply the operator's files, pin them
 *   apply     — digests match the authorization pin: apply, refresh last-good
 *   safe      — anything else (edited files + agent reload, missing pin):
 *               run LAST-KNOWN-GOOD policy, refuse the files, testify
 *
 * The ingress token lives in ~/.paseo/copenode/token (generated on first
 * start); every /spawn call must carry it in `x-copenode-token`.
 *
 * Operator ceremony for policy/config changes:
 *   1. edit ~/.paseo/copenode/{config,policy}.json
 *   2. npx copenode policy authorize        (pins the new digests)
 *   3. paseo plugin reload copenode
 */

import os from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { loadPolicy, digestTree, randomToken, evaluateStartup, createLedger, jsonlStore, type Policy } from "@copenode/core";
import { startIngress } from "./server/ingress.ts";
import type { BridgeConfig } from "./server/decide.ts";

const KNOWN_PROVIDERS = new Set(["opencode", "claude", "codex", "copilot", "pi", "omp", "antigravity", "muse"]);

function buildFromDocs(
  env: NodeJS.ProcessEnv,
  configDoc: Record<string, unknown>,
  policyDoc: Record<string, unknown> | null,
  legacyLabels: { ownerLabels: string[]; allowlistedLabels: string[] },
): { config: BridgeConfig; ledgerPath: string; port: number; projectPath: string | null; provider: string | null; model: string | null } {
  const limit = Number(env.COPENODE_LIMIT ?? configDoc.limit ?? 2);
  const ledgerPath = env.COPENODE_LEDGER
    ?? (typeof configDoc.ledgerPath === "string" ? configDoc.ledgerPath : join(os.homedir(), ".paseo", "copenode", "ledger.jsonl"));
  const port = Number(env.COPENODE_PORT ?? configDoc.port ?? 6789);
  const projectPath = env.COPENODE_PROJECT
    ?? (typeof configDoc.projectPath === "string" ? configDoc.projectPath : null);
  const provider = env.COPENODE_PROVIDER
    ?? (typeof configDoc.provider === "string" ? configDoc.provider : null);
  const model = env.COPENODE_MODEL
    ?? (typeof configDoc.model === "string" ? configDoc.model : null);

  if (provider !== null && !KNOWN_PROVIDERS.has(provider)) {
    throw new Error(
      `copenode config: unknown provider "${provider}". ` +
        `Paseo providers are CLIs — one of ${[...KNOWN_PROVIDERS].join(", ")}.`,
    );
  }

  let policy: Policy;
  if (policyDoc) {
    policy = loadPolicy(policyDoc);
  } else {
    if (legacyLabels.ownerLabels.length > 0 || legacyLabels.allowlistedLabels.length > 0) {
      console.error(
        "[copenode] no policy.json — synthesizing a transitional policy from " +
          "ownerLabels/allowlistedLabels. Migrate to policy.json.",
      );
    }
    policy = loadPolicy({
      userGroups: {
        owners: { labels: legacyLabels.ownerLabels },
        senders: { labels: legacyLabels.allowlistedLabels },
      },
      rules: [
        {
          userGroup: "owners", agentGroup: "*",
          allow: ["spawn", "steer"],
          bounds: { isolation: "worktree", spendCap: limit, maxDepth: 0 },
        },
        {
          userGroup: "senders", agentGroup: "*",
          allow: ["spawn"],
          bounds: { isolation: "sandbox", spendCap: limit, maxDepth: 0 },
        },
        { userGroup: "*", agentGroup: "*", deny: ["*"] },
      ],
    });
  }

  return { config: { policy, limit }, ledgerPath, port, projectPath, provider, model };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The plugin's own source directory — import.meta is unreliable under Paseo's compiler. */
function resolveSourceDir(explicit: string | undefined): string | null {
  if (explicit) return explicit;
  try {
    const url = (import.meta as { url?: string } | undefined)?.url;
    if (typeof url === "string" && url.startsWith("file:")) {
      return dirname(fileURLToPath(url));
    }
  } catch {
    // bundled contexts may not carry import.meta — the pin carries the path instead
  }
  return null;
}

export default function contribute(_server: PluginServerContext) {
  const env = process.env;
  const baseDir = join(os.homedir(), ".paseo", "copenode");
  mkdirSync(baseDir, { recursive: true });
  const configPath = env.COPENODE_CONFIG ?? join(baseDir, "config.json");
  const policyPath = env.COPENODE_POLICY ?? join(baseDir, "policy.json");
  const pinPath = join(baseDir, "authorize.json");
  const lastGoodPath = join(baseDir, "last-good.json");
  const tokenPath = join(baseDir, "token");

  // Shared secret for the ingress: generated once, operator-distributed.
  const token = existsSync(tokenPath)
    ? readFileSync(tokenPath, "utf8").trim()
    : randomToken();
  if (!existsSync(tokenPath)) {
    writeFileSync(tokenPath, token + "\n", { mode: 0o600 });
    console.log(`[copenode] ingress token created at ${tokenPath} (share only with the gateway)`);
  }

  // The pin may carry the plugin's own source path (written by the CLI at
  // authorize time — Paseo's runtime context does not expose it).
  const hasPin = existsSync(pinPath);
  const pin = hasPin ? (JSON.parse(readFileSync(pinPath, "utf8")) as { digests?: Record<string, string>; sourcePath?: string }) : null;
  const hasLastGood = existsSync(lastGoodPath);
  const lastGood = hasLastGood ? (JSON.parse(readFileSync(lastGoodPath, "utf8")) as { configDoc?: object; policyDoc?: object }) : null;

  const sourceDir = resolveSourceDir(env.COPENODE_SOURCE ?? pin?.sourcePath);
  const liveDigests = {
    config: existsSync(configPath) ? sha256File(configPath) : "absent",
    policy: existsSync(policyPath) ? sha256File(policyPath) : "absent",
    source: sourceDir && existsSync(sourceDir) ? digestTree(sourceDir) : "pending",
  };
  const gate = evaluateStartup({
    hasPin,
    pinDigests: pin?.digests ?? null,
    liveDigests,
    hasLastGood,
  });

  // The ledger exists before the gate: the gate itself is witnessed.
  const ledgerPath = env.COPENODE_LEDGER ?? join(baseDir, "ledger.jsonl");
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const store = jsonlStore(ledgerPath);
  const ledger = createLedger({ store });

  let configDoc: Record<string, unknown>;
  let policyDoc: Record<string, unknown> | null;
  let mode = gate.mode;

  if (gate.mode === "safe" && lastGood?.configDoc) {
    // Refuse the files; run the last law the operator authorized.
    configDoc = lastGood.configDoc as Record<string, unknown>;
    policyDoc = (lastGood.policyDoc ?? null) as Record<string, unknown> | null;
  } else {
    configDoc = existsSync(configPath) ? (JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>) : {};
    policyDoc = existsSync(policyPath) ? (JSON.parse(readFileSync(policyPath, "utf8")) as Record<string, unknown>) : null;
    if (gate.mode === "bootstrap" || gate.mode === "apply") {
      writeFileSync(lastGoodPath, JSON.stringify({ configDoc, policyDoc, digests: liveDigests, ts: new Date().toISOString() }, null, 2));
    }
    if (gate.mode === "bootstrap") {
      writeFileSync(pinPath, JSON.stringify({ digests: liveDigests, sourcePath: sourceDir, ts: new Date().toISOString() }, null, 2));
    }
  }

  // The pin is deliberately reusable while digests match: ordinary daemon
  // crash-restarts re-apply the authorized law without ceremony. Drift from
  // the pin is what flips the gate to safe mode.

  const legacyLabels = {
    ownerLabels: Array.isArray(configDoc.ownerLabels) ? (configDoc.ownerLabels as string[]) : [],
    allowlistedLabels: Array.isArray(configDoc.allowlistedLabels) ? (configDoc.allowlistedLabels as string[]) : [],
  };
  const built = buildFromDocs(env, configDoc, policyDoc, legacyLabels);

  const gateRow = (rule: string, status: string) => {
    ledger.record({
      identity: { sender: "<gate>", tier: "system" },
      decision: { verdict: "allow", rule },
      action: { kind: "policy", target: "config+policy+source" },
      outcome: { status, artifactRef: liveDigests.source.slice(0, 16) },
    });
  };
  if (gate.mode === "bootstrap") gateRow("bootstrapped", "pinned");
  else if (gate.mode === "apply") gateRow("authorized-reload", "applied");
  else gateRow(`unauthorized-reload: ${gate.reason}`, "safe-mode");

  const ingress = startIngress({
    config: built.config,
    ledgerPath,
    port: built.port,
    projectPath: built.projectPath,
    provider: built.provider,
    model: built.model,
    token,
    store,
  });
  void ingress.ready.then((port) => {
    console.log(
      `[copenode] ${gate.mode.toUpperCase()} (${gate.reason}) · ingress on 127.0.0.1:${port} · ` +
      `limit $${built.config.limit}/sender/24h · groups: ${Object.keys(built.config.policy.userGroups).length} · ` +
      `rules: ${built.config.policy.rules.length} · project: ${built.projectPath ?? "(none)"} · ` +
      `provider: ${built.provider ?? "(none)"} · model: ${built.model ?? "(provider default)"}`,
    );
  });
  return () => {
    ingress.stop();
  };
}
