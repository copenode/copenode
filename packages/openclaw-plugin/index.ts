import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnAtSpine, spineHealth, type SpineConfig } from "./lib/spine.ts";
import { formatSpawnDecision } from "./lib/verdict.ts";

/**
 * copenode — the OpenClaw side of the bridge.
 *
 * The plugin never decides policy. It attests the requester (requesterSenderId
 * comes from OpenClaw's trusted runtime context), relays the spawn to the
 * spine, and relays the verdict back into the thread. Authorization rides the
 * shared token; the law lives on the spine.
 */

function readSpineConfig(): SpineConfig {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const tokenPath = process.env.COPENODE_TOKEN_FILE ?? join(home, ".paseo", "copenode", "token");
  const token = process.env.COPENODE_TOKEN ?? readFileSync(tokenPath, "utf8").trim();
  return {
    ingressUrl: process.env.COPENODE_INGRESS ?? "http://127.0.0.1:6789",
    token,
  };
}

function spineError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `⚠️ copenode spine unreachable: ${message}. Is the Paseo daemon (and the copenode plugin) running?`;
}

export default definePluginEntry({
  id: "copenode",
  name: "copenode",
  description: "The policy spine beneath agent nodes: governed, metered Paseo spawns from chat.",
  register(api) {
    api.registerTool((toolContext) => ({
      name: "copenode_spawn",
      description:
        "Spawn a governed coding-agent workspace for the current requester via the copenode policy spine. " +
        "The spine classifies the requester, enforces policy, applies the budget, and records the attempt. " +
        "Use this when the user asks for coding-agent work in a Paseo workspace.",
      parameters: Type.Object({
        task: Type.String({ description: "The task for the agent, in the requester's own words" }),
        threadRef: Type.Optional(Type.String({ description: "Originating thread reference for the result to return to" })),
      }),
      async execute(_id, params) {
        try {
          const config = readSpineConfig();
          const channel = toolContext.nativeChannelId ?? "openclaw";
          const senderId = toolContext.requesterSenderId ?? "local-dashboard";
          const decision = await spawnAtSpine(config, {
            channel,
            senderId,
            text: params.task,
            threadRef: params.threadRef,
          });
          const body = decision.body;
          if ("error" in body) {
            return { content: [{ type: "text", text: `⚠️ copenode: ingress error (${decision.status}): ${body.error}` }] };
          }
          return {
            content: [{ type: "text", text: formatSpawnDecision(body) }],
            details: body,
          };
        } catch (err: unknown) {
          return { content: [{ type: "text", text: spineError(err) }] };
        }
      },
    }));

    api.registerTool(() => ({
      name: "copenode_status",
      description:
        "Check the copenode policy spine: is the ingress reachable, and does the ledger chain verify?",
      parameters: Type.Object({}),
      async execute() {
        try {
          const health = await spineHealth(readSpineConfig());
          return {
            content: [{
              type: "text",
              text: health.ok
                ? `✅ copenode spine up — ledger chain ${health.verify ? "verified" : "UNVERIFIED"}.`
                : "❌ copenode spine reports not-ok.",
            }],
            details: health,
          };
        } catch (err: unknown) {
          return { content: [{ type: "text", text: spineError(err) }] };
        }
      },
    }));
  },
});
