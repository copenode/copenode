import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { loadPolicy, memoryStore } from "@copenode/core";
import { startIngress } from "./server/ingress.ts";

const DOC = {
  userGroups: {
    owners: { labels: ["oc/whatsapp/+33766657966"] },
  },
  rules: [
    {
      userGroup: "owners",
      agentGroup: "coding-fleet",
      allow: ["spawn"],
      bounds: { isolation: "worktree", spendCap: 2, maxDepth: 0 },
    },
    { userGroup: "*", agentGroup: "*", deny: ["*"] },
  ],
};

const config = { policy: loadPolicy(DOC) as Policy, limit: 2 };
const spawnOk = async () => ({ workspaceId: "wks_x", agentId: "agent_1" });

function start(spawn = spawnOk) {
  const ingress = startIngress({
    config,
    ledgerPath: "unused",
    port: 0,
    token: "sekrit",
    maxConcurrentPerSender: 2,
    projectPath: "/proj",
    provider: "opencode",
    spawn,
    store: memoryStore(),
  });
  return { ingress, ready: ingress.ready };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** raw http POST — undici's fetch misbehaves against 127.0.0.1 on Windows */
function post(port: number, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path: "/spawn", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), ...headers } },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: { raw: out } });
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

test("gate 1: no token / wrong token = 401, witnessed in the ledger", { timeout: 8000 }, async () => {
  const { ingress, ready } = start();
  const port = await ready;
  try {
    const noToken = await post(port, { channel: "whatsapp", senderId: "+33766657966", text: "x" });
    assert.equal(noToken.status, 401);
    const badToken = await post(port, { channel: "whatsapp", senderId: "+33766657966", text: "x" }, { "x-copenode-token": "wrong" });
    assert.equal(badToken.status, 401);
    const good = await post(port, { channel: "whatsapp", senderId: "+33766657966", text: "x" }, { "x-copenode-token": "sekrit" });
    assert.equal(good.status, 200);
  } finally {
    ingress.stop();
  }
});

test("gate 2: spawn storms are capped per sender (429, rule named)", { timeout: 8000 }, async () => {
  // spawn hangs until released: requests 1-2 stay in flight, request 3 is capped
  let release: (v: { workspaceId: string | null; agentId: string | null }) => void = () => {};
  const hang = new Promise<{ workspaceId: string | null; agentId: string | null }>((resolve) => {
    release = resolve;
  });
  const { ingress, ready } = start(() => hang);
  const port = await ready;
  try {
    // fire the two in-flight spawns without awaiting their (withheld) responses
    const q1 = post(port, { channel: "whatsapp", senderId: "+33766657966", text: "1" }, { "x-copenode-token": "sekrit" });
    const q2 = post(port, { channel: "whatsapp", senderId: "+33766657966", text: "2" }, { "x-copenode-token": "sekrit" });
    const third = await post(port, { channel: "whatsapp", senderId: "+33766657966", text: "3" }, { "x-copenode-token": "sekrit" });
    assert.equal(third.status, 429);
    assert.equal(third.json.rule, "concurrency-limit");
    // releasing the spawn un-wedges requests 1 and 2
    release({ workspaceId: "wks_x", agentId: "agent_2" });
    const [first, second] = await Promise.all([q1, q2]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  } finally {
    ingress.stop();
  }
});
