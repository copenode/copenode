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
 *     "ledgerPath":         "~/.paseo/copenode/ledger.jsonl",
 *     "port":               6789
 *   }
 *   Env: COPENODE_PORT, COPENODE_LEDGER, COPENODE_LIMIT,
 *        COPENODE_OWNERS, COPENODE_SENDERS, COPENODE_PROJECT, COPENODE_CONFIG
 */

import os from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { startIngress } from "./server/ingress.ts";
import type { BridgeConfig } from "./server/decide.ts";

function readConfig(): { config: BridgeConfig; ledgerPath: string; port: number; projectPath: string | null } {
  const env = process.env;
  const baseDir = join(os.homedir(), ".paseo", "copenode");
  const configPath = env.COPENODE_CONFIG ?? join(baseDir, "config.json");

  let file: Record<string, unknown> = {};
  try {
    file = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

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

  return {
    config: { ownerLabels, allowlistedLabels, limit },
    ledgerPath,
    port,
    projectPath,
  };
}

export default function contribute(_server: PluginServerContext) {
  const { config, ledgerPath, port, projectPath } = readConfig();
  const ingress = startIngress({ config, ledgerPath, port, projectPath });
  console.log(
    `[copenode] ingress on 127.0.0.1:${ingress.port()} · limit $${config.limit}/sender/24h · ` +
    `owner labels: ${config.ownerLabels.length} · sender labels: ${config.allowlistedLabels.length} · ` +
    `project: ${projectPath ?? "(none)"} · ledger: ${ledgerPath}`,
  );
  return () => {
    ingress.stop();
  };
}
