/**
 * @copenode/core — integrity utilities for the constitution.
 *
 * Protocol until Phase 5, physics after: these make tampering *evident*
 * and unauthorized application *refused*; the OS-user split makes them
 * impossible.
 */

import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "target", "dist", ".venv", "__pycache__"]);

/**
 * Deterministic digest of a directory tree: sha256 over sorted
 * "relpath:filehash" lines. Same files, same digest — any edit shows.
 * Synchronous so plugin startup can use it directly.
 * @param {string} dir absolute path
 * @returns {string} hex digest
 */
export function digestTree(dir) {
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(current, entry.name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) files.push(full);
    }
  }
  walk(dir);
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    const rel = relative(dir, file).split("\\").join("/");
    hash.update(`${rel}:${createHash("sha256").update(readFileSync(file)).digest("hex")}\n`);
  }
  return hash.digest("hex");
}

/** Random hex token for ingress/gateway shared secrets. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

/**
 * The startup gate: decide how a spine start should apply policy.
 *
 *   bootstrap  — first ever start (no pin, no last-known-good): apply the
 *                operator's files as-is and pin them
 *   apply      — pin exists and live digests match it: authorized
 *   safe       — anything else: run last-known-good policy, refuse the
 *                files, and testify about what was seen
 *
 * @returns {{ mode: "bootstrap" | "apply" | "safe", reason: string, mismatched: string[] }}
 */
export function evaluateStartup({ hasPin, pinDigests, liveDigests, hasLastGood }) {
  if (!hasPin && !hasLastGood) {
    return { mode: "bootstrap", reason: "first start — pinning current files", mismatched: [] };
  }
  if (!hasPin) {
    return { mode: "safe", reason: "no authorization pin — reloading without ceremony", mismatched: [] };
  }
  const keys = new Set([...Object.keys(pinDigests ?? {}), ...Object.keys(liveDigests ?? {})]);
  const mismatched = [...keys].filter((k) => (pinDigests?.[k] ?? "") !== (liveDigests?.[k] ?? ""));
  if (mismatched.length > 0) {
    return { mode: "safe", reason: `digest mismatch: ${mismatched.join(", ")}`, mismatched };
  }
  return { mode: "apply", reason: "digests match the authorization pin", mismatched: [] };
}
