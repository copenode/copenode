/**
 * @copenode/core — the policy engine (the constitution as data).
 *
 * userGroup × agentGroup × action, with bounds. Semantics, fail-closed
 * throughout: deny beats allow; no matching rule permits nothing; a broken
 * policy refuses to load. Every allow carries its bound — the doctrine's
 * "every grant of autonomy ships with a systemic bound," as data.
 *
 * v1 bounds vocabulary:
 *   isolation: "sandbox" | "worktree"   (floor is sandbox, always)
 *   spendCap:  dollars per sender window (null = operator default)
 *   maxDepth:  delegation depth for spawned agents (0 = leaves only)
 *   network:   "none" | "scoped" | "open" (recorded; enforced as nodes
 *              expose network surfaces)
 *
 * Honest v1 boundary: the engine governs what crosses the spine's ingress.
 * Agent-initiated `paseo` CLI calls on the daemon host are contained by the
 * OS-user split (Phase 5), not by this engine — recorded so nobody mistakes
 * protocol for physics.
 */

export const ACTIONS = Object.freeze(["spawn", "steer", "delegate"]);
export const ISOLATIONS = Object.freeze(["sandbox", "worktree"]);
export const AGENT_GROUPS = Object.freeze(["coding-fleet", "browser-agent"]);

/**
 * Validate and normalize a policy document. Throws (fail closed) on any
 * shape or value the engine cannot interpret exactly.
 * @param {{ userGroups: Record<string, { labels: string[] }>, rules: Array<object> }} doc
 */
export function loadPolicy(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.rules)) {
    throw new Error("policy: missing rules array");
  }
  if (!doc.userGroups || typeof doc.userGroups !== "object") {
    throw new Error("policy: missing userGroups");
  }
  const userGroups = {};
  for (const [name, def] of Object.entries(doc.userGroups)) {
    if (!def || !Array.isArray(def.labels)) {
      throw new Error(`policy: userGroup "${name}" needs labels[]`);
    }
    userGroups[name] = { labels: def.labels.map(String) };
  }
  const rules = doc.rules.map((rule, index) => {
    if (!rule || typeof rule !== "object") {
      throw new Error(`policy: rule ${index} is not an object`);
    }
    const userGroup = String(rule.userGroup ?? "*");
    const agentGroup = String(rule.agentGroup ?? "*");
    if (userGroup !== "*" && !userGroups[userGroup]) {
      throw new Error(`policy: rule ${index} references unknown userGroup "${userGroup}"`);
    }
    if (rule.deny !== undefined) {
      const deny = Array.isArray(rule.deny) ? rule.deny : [rule.deny];
      return { userGroup, agentGroup, deny: deny.map(String), index };
    }
    const allow = Array.isArray(rule.allow) ? rule.allow : rule.allow ? [rule.allow] : [];
    for (const action of allow) {
      if (action !== "*" && !ACTIONS.includes(action)) {
        throw new Error(`policy: rule ${index} grants unknown action "${action}"`);
      }
    }
    const b = rule.bounds ?? {};
    const bounds = {
      isolation: b.isolation ?? "sandbox",
      spendCap: typeof b.spendCap === "number" ? b.spendCap : null,
      maxDepth: typeof b.maxDepth === "number" ? Math.max(0, b.maxDepth) : 0,
      network: b.network ?? "none",
    };
    if (!ISOLATIONS.includes(bounds.isolation)) {
      throw new Error(`policy: rule ${index} has invalid isolation "${bounds.isolation}"`);
    }
    return { userGroup, agentGroup, allow: allow.map(String), bounds, index };
  });
  return { userGroups, rules };
}

/**
 * Which user group does this sender label belong to? Unknown labels fall
 * to "system" — the outermost orbit, contained by the catch-all.
 */
export function resolveUserGroup(policy, label) {
  for (const [name, def] of Object.entries(policy.userGroups)) {
    if (def.labels.includes(label)) return name;
  }
  return "system";
}

/**
 * Decide one action for one (userGroup, agentGroup) pair.
 *
 * Most-specific-match-wins: an exact rule beats a wildcard on the same
 * axis; ties break to deny (fail closed); no match denies. A catch-all
 * deny is the floor beneath grants, never a ceiling above them.
 *
 * @returns {{ allowed: true, bounds: object, rule: number }}
 *        | {{ allowed: false, rule: string }}
 */
export function decide(policy, { userGroup, agentGroup, action }) {
  if (!ACTIONS.includes(action)) {
    return { allowed: false, rule: `unknown-action:${action}` };
  }
  const specificity = (value) => (value === "*" ? 1 : 2);
  let best = null;
  for (const rule of policy.rules) {
    if (rule.userGroup !== "*" && rule.userGroup !== userGroup) continue;
    if (rule.agentGroup !== "*" && rule.agentGroup !== agentGroup) continue;
    const deniesAction =
      rule.deny !== undefined &&
      (rule.deny.includes("*") || rule.deny.includes(action));
    const allowsAction =
      rule.deny === undefined &&
      (rule.allow.includes("*") || rule.allow.includes(action));
    if (!deniesAction && !allowsAction) continue;
    const score = specificity(rule.userGroup) + specificity(rule.agentGroup);
    const verdict = deniesAction ? "deny" : "allow";
    if (!best || score > best.score || (score === best.score && verdict === "deny")) {
      best = { score, rule, verdict };
    }
  }
  if (!best || best.verdict === "deny") {
    return {
      allowed: false,
      rule: best ? `deny-rule:${best.rule.index}` : "no-matching-rule",
    };
  }
  return { allowed: true, bounds: best.rule.bounds, rule: best.rule.index };
}
