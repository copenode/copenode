import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLedger, jsonlStore } from "@copenode/core";

const run = promisify(execFile);
const BIN = new URL("./bin/copenode.js", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

async function makeLedger() {
  const dir = mkdtempSync(join(tmpdir(), "copenode-cli-"));
  const file = join(dir, "ledger.jsonl");
  const ledger = createLedger({ store: jsonlStore(file) });
  const run1 = ledger.record({
    identity: { sender: "oc/whatsapp/+1555000222", tier: "sender", agent: "paseo/main" },
    action: { kind: "run" },
    cost: { dollars: 0.42 },
  });
  ledger.record({ identity: { sender: "oc/whatsapp/+1555000111", tier: "owner" } });
  ledger.attachEval(run1.id, { judge: "human", verdict: "approve" });
  return { dir, file };
}

test("trail prints attribution lines and a count", async () => {
  const { dir, file } = await makeLedger();
  try {
    const { stdout } = await run(process.execPath, [BIN, "trail", file]);
    assert.match(stdout, /oc\/whatsapp\/\+1555000222 \(sender\)/);
    assert.match(stdout, /\$0\.42/);
    assert.match(stdout, /human:approve/);
    assert.match(stdout, /3 entries/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trail filters by sender; verify exits 0 on an intact chain", async () => {
  const { dir, file } = await makeLedger();
  try {
    const filtered = await run(process.execPath, [BIN, "trail", file, "--sender", "oc/whatsapp/+1555000111"]);
    assert.match(filtered.stdout, /1 entry\n/);
    assert.doesNotMatch(filtered.stdout, /\+1555000222/);

    const verified = await run(process.execPath, [BIN, "verify", file]);
    assert.match(verified.stdout, /ok — 3 entries, chain intact/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
