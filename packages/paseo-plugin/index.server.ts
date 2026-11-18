/**
 * copenode — Paseo plugin entry (daemon side).
 *
 * Starts the ingress the OpenClaw side posts to. No UI in v0: a plugin
 * with no client contributions omits index.client.tsx entirely.
 *
 * Configuration (for now, env on the daemon host — moves to plugin
 * settings when the lab confirms the canonical shape):
 *   COPENODE_PORT        default 6789
 *   COPENODE_LEDGER      default ./copenode-ledger.jsonl (daemon cwd)
 *   COPENODE_LIMIT       dollars per sender per 24h, default 2
 *   COPENODE_OWNERS      comma-separated owner labels
 *   COPENODE_SENDERS     comma-separated allowlisted labels
 */

import type { PluginServerContext } from "@getpaseo/plugin/server";
import { startIngress } from "./server/ingress.ts";

function readConfig() {
  const env = process.env;
  const port = Number(env.COPENODE_PORT ?? 6789);
  const limit = Number(env.COPENODE_LIMIT ?? 2);
  const ownerLabels = (env.COPENODE_OWNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowlistedLabels = (env.COPENODE_SENDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ledgerPath = env.COPENODE_LEDGER ?? "./copenode-ledger.jsonl";
  return { config: { ownerLabels, allowlistedLabels, limit }, ledgerPath, port };
}

export default function contribute(_server: PluginServerContext) {
  const { config, ledgerPath, port } = readConfig();
  const ingress = startIngress({ config, ledgerPath, port });
  console.log(`[copenode] ingress listening on 127.0.0.1:${ingress.port()} (limit $${config.limit}/sender/24h)`);
  return () => {
    ingress.stop();
  };
}
