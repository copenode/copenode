/**
 * copenode — Paseo plugin entry (daemon side).
 *
 * Starts the ingress the OpenClaw side posts to. No UI in v0: a plugin
 * with no client contributions omits index.client.tsx entirely.
 *
 * Configuration (env overrides file; file overrides defaults):
 *   ~/.paseo/copenode/config.json —
 *   {
 *     "ownerLabels":        ["oc/whatsapp/+33612345678"],
 *     "allowlistedLabels":  ["oc/telegram/alice"],
 *     "limit":              2,          // dollars / sender / 24h
 *     "projectPath":        "/home/uma/copenode-lab/demo-repo",
 *     "provider":           "opencode",
 *     "model":              "opencode-go/kimi-k3",
 *     "ledgerPath":         "~/.paseo/copenode/ledger.jsonl",
 *     "port":               6789
 *   }
 *   Env: COPENODE_PORT, COPENODE_LEDGER, COPENODE_LIMIT,
 *        COPENODE_OWNERS, COPENODE_SENDERS, COPENODE_PROJECT, COPENODE_CONFIG,
 *        COPENODE_PROVIDER, COPENODE_MODEL
 */

import os from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { startIngress } from "./server/ingress.ts";
import type { BridgeConfig } from "./server/decide.ts";

function readConfig(): {
  config: BridgeConfig;
  ledgerPath: string;
  port: number;
  projectPath: string | null;
  provider: string | null;
  model: string | null;
} {
  const env = process.env;
  const baseDir = join(os.homedir(), ".paseo", "copenode");
  const configPath = env.COPENODE_CONFIG ?? join(baseDir, "config.json");

  let file: Record<string, unknown> = {};
  try {
    file = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Policy config is operator-owned. Unknown keys are named and ignored —
  // most often an agent that went config-hunting instead of doing its job.
  const KNOWN_KEYS = new Set([
    "ownerLabels", "allowlistedLabels", "limit", "projectPath",
    "provider", "model", "ledgerPath", "port",
  ]);
  const unknownKeys = Object.keys(file).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    console.error(
      `[copenode] config: ignoring unknown key(s) ${unknownKeys.join(", ")} — ` +
        "this file is operator-owned policy, not a general config surface",
    );
  }

  // Fail closed on values: an invalid provider keeps the plugin DOWN
  // (visible in `paseo plugin logs`) rather than failing mysteriously at spawn.
  const KNOWN_PROVIDERS = new Set(["opencode", "claude", "codex", "copilot", "pi", "omp", "antigravity", "muse"]);

  const splitList = (v: string | undefined) =>
    (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const ownerLabels = env.COPENODE_OWNERS
    ? splitList(env.COPENODE_OWNERS)
    : Array.isArray(file.ownerLabels) ? (file.ownerLabels as string[]) : [];
  const allowlistedLabels = env.COPENODE_SENDERS
    ? splitList(env.COPENODE_SENDERS)
    : Array.isArray(file.allowlistedLabels) ? (file.allowlistedLabels as string[]) : [];

  const ledgerPath = env.COPENODE_LEDGER
    ?? (typeof file.ledgerPath === "string" ? file.ledgerPath : join(baseDir, "ledger.jsonl"));
  const port = Number(env.COPENODE_PORT ?? file.port ?? 6789);
  const limit = Number(env.COPENODE_LIMIT ?? file.limit ?? 2);
  const projectPath = env.COPENODE_PROJECT
    ?? (typeof file.projectPath === "string" ? file.projectPath : null);
  const provider = env.COPENODE_PROVIDER
    ?? (typeof file.provider === "string" ? file.provider : null);

  if (provider !== null && !KNOWN_PROVIDERS.has(provider)) {
    throw new Error(
      `copenode config: unknown provider "${provider}". ` +
        `Paseo providers are CLIs — one of ${[...KNOWN_PROVIDERS].join(", ")}. ` +
        `(Model providers like opencode-go/* live inside OpenCode's own config, not here.)`,
    );
  }
  const model = env.COPENODE_MODEL
    ?? (typeof file.model === "string" ? file.model : null);

  return {
    config: { ownerLabels, allowlistedLabels, limit },
    ledgerPath,
    port,
    projectPath,
    provider,
    model,
  };
}

export default function contribute(_server: PluginServerContext) {
  const { config, ledgerPath, port, projectPath, provider, model } = readConfig();
  const ingress = startIngress({ config, ledgerPath, port, projectPath, provider, model });
  console.log(
    `[copenode] ingress on 127.0.0.1:${ingress.port()} · limit $${config.limit}/sender/24h · ` +
    `owner labels: ${config.ownerLabels.length} · sender labels: ${config.allowlistedLabels.length} · ` +
    `project: ${projectPath ?? "(none)"} · provider: ${provider ?? "(none)"} · ` +
    `model: ${model ?? "(default)"} · ledger: ${ledgerPath}`,
  );
  return () => {
    ingress.stop();
  };
}
