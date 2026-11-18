/**
 * @copenode/core — trust primitives
 *
 * The doctrine as code: who asked (identity), and what their question
 * is allowed to reach (routing). Prompts you didn't type never run
 * unsandboxed.
 */

/**
 * Trust tiers. Drives workspace routing:
 *  - "owner"    -> prompts you typed: plain worktree, your authority
 *  - "sender"   -> prompts from people you allowlisted: sandboxed workspace
 *  - "system"   -> schedules, heartbeats, internet-sourced content: sandboxed
 * @typedef {"owner" | "sender" | "system"} TrustTier
 */

export const TIERS = Object.freeze(["owner", "sender", "system"]);

/**
 * Map an OpenClaw channel sender to a stable Paseo agent label.
 * Same sender -> same label -> per-person usage and history line up
 * across both daemons (metering key).
 *
 * @param {{ channel: string, senderId: string }} from
 * @returns {string} label safe for Paseo's label filter, e.g. "oc/whatsapp/+1555…"
 */
export function senderToLabel({ channel, senderId }) {
  if (!channel || !senderId) {
    throw new Error("senderToLabel requires channel and senderId");
  }
  const safeChannel = String(channel).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const safeSender = String(senderId).replace(/[^a-zA-Z0-9._+-]/g, "");
  return `oc/${safeChannel}/${safeSender}`;
}

/**
 * Routing decision for a workspace, from the trust model:
 * prompts you didn't type never run unsandboxed.
 *
 * @param {TrustTier} tier
 * @returns {{ isolation: "worktree" | "sandbox", scopedCredentials: boolean }}
 */
export function routingFor(tier) {
  switch (tier) {
    case "owner":
      return { isolation: "worktree", scopedCredentials: false };
    case "sender":
    case "system":
      return { isolation: "sandbox", scopedCredentials: true };
    default:
      throw new Error(`unknown trust tier: ${tier}`);
  }
}
