import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digestTree, randomToken, evaluateStartup } from "./integrity.js";

test("digestTree: same files same digest, any edit changes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "copenode-digest-"));
  try {
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    const d1 = digestTree(dir);
    const d2 = digestTree(dir);
    assert.equal(d1, d2);
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    const d3 = digestTree(dir);
    assert.notEqual(d1, d3);
    // skipped dirs do not affect the digest
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "junk.js"), "x");
    const d4 = digestTree(dir);
    assert.equal(d3, d4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("randomToken is hex and long enough", () => {
  const t = randomToken();
  assert.match(t, /^[0-9a-f]{64}$/);
  assert.notEqual(t, randomToken());
});

test("startup gate: bootstrap, apply, and safe modes", () => {
  const pin = { config: "aaa", policy: "bbb", source: "ccc" };
  assert.deepEqual(
    evaluateStartup({ hasPin: false, pinDigests: null, liveDigests: pin, hasLastGood: false }),
    { mode: "bootstrap", reason: "first start — pinning current files", mismatched: [] },
  );
  assert.equal(
    evaluateStartup({ hasPin: true, pinDigests: pin, liveDigests: pin, hasLastGood: true }).mode,
    "apply",
  );
  const safe = evaluateStartup({
    hasPin: true,
    pinDigests: pin,
    liveDigests: { ...pin, policy: "hacked" },
    hasLastGood: true,
  });
  assert.equal(safe.mode, "safe");
  assert.match(safe.reason, /policy/);
  const noCeremony = evaluateStartup({ hasPin: false, pinDigests: null, liveDigests: pin, hasLastGood: true });
  assert.equal(noCeremony.mode, "safe");
  assert.match(noCeremony.reason, /without ceremony/);
});
