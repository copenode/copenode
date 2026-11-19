import test from "node:test";
import assert from "node:assert/strict";
import { loadPolicy, resolveUserGroup, decide } from "./policy.js";

const DOC = {
  userGroups: {
    owners: { labels: ["oc/whatsapp/+33766657966"] },
    senders: { labels: ["oc/whatsapp/+1555000222"] },
  },
  rules: [
    {
      userGroup: "owners", agentGroup: "coding-fleet",
      allow: ["spawn", "steer"],
      bounds: { isolation: "worktree", spendCap: 2, maxDepth: 0, network: "open" },
    },
    {
      userGroup: "senders", agentGroup: "coding-fleet",
      allow: ["spawn"],
      bounds: { isolation: "sandbox", spendCap: 1, maxDepth: 0, network: "scoped" },
    },
    { userGroup: "senders", agentGroup: "browser-agent", deny: ["*"] },
    { userGroup: "*", agentGroup: "*", deny: ["*"] },
  ],
};

const policy = loadPolicy(DOC);

test("sandbox is the floor: no matching rule permits nothing", () => {
  const d = decide(policy, { userGroup: "system", agentGroup: "coding-fleet", action: "spawn" });
  assert.equal(d.allowed, false);
  assert.equal(d.rule, "deny-rule:3");
});

test("grants carry their bounds", () => {
  const owner = decide(policy, { userGroup: "owners", agentGroup: "coding-fleet", action: "spawn" });
  assert.equal(owner.allowed, true);
  assert.equal(owner.bounds.isolation, "worktree");
  assert.equal(owner.bounds.spendCap, 2);
  const sender = decide(policy, { userGroup: "senders", agentGroup: "coding-fleet", action: "spawn" });
  assert.equal(sender.allowed, true);
  assert.equal(sender.bounds.isolation, "sandbox");
});

test("deny beats allow across rules", () => {
  const d = decide(policy, { userGroup: "senders", agentGroup: "browser-agent", action: "spawn" });
  assert.equal(d.allowed, false);
  assert.equal(d.rule, "deny-rule:2");
});

test("unclassified agent groups hit only wildcard rules", () => {
  const d = decide(policy, { userGroup: "owners", agentGroup: "mystery-node", action: "spawn" });
  assert.equal(d.allowed, false);
  assert.equal(d.rule, "deny-rule:3");
});

test("ungranted actions are denied even for owners", () => {
  const d = decide(policy, { userGroup: "senders", agentGroup: "coding-fleet", action: "steer" });
  assert.equal(d.allowed, false);
  assert.equal(d.rule, "deny-rule:3");
});

test("unknown labels resolve to the outermost orbit", () => {
  assert.equal(resolveUserGroup(policy, "oc/telegram/999"), "system");
  assert.equal(resolveUserGroup(policy, "oc/whatsapp/+33766657966"), "owners");
});

test("broken policy refuses to load (fail closed)", () => {
  assert.throws(() => loadPolicy({ rules: "nope" }));
  assert.throws(() => loadPolicy({ userGroups: {}, rules: [{ userGroup: "ghost", allow: ["spawn"] }] }));
  assert.throws(() => loadPolicy({ userGroups: {}, rules: [{ allow: ["launch"] }] }));
  assert.throws(() => loadPolicy({ userGroups: { a: { labels: [] } }, rules: [{ userGroup: "a", bounds: { isolation: "chaos" }, allow: ["spawn"] }] }));
});
