#!/usr/bin/env node
/**
 * copenode — CLI for the metering ledger and the constitution.
 *
 *   copenode trail  <ledger.jsonl> [--sender S] [--kind K] [--json]
 *   copenode verify <ledger.jsonl>
 *   copenode token show [--home <dir>]
 *   copenode policy authorize [--home <dir>] [--source <dir>]
 *   copenode policy verify   [--home <dir>] [--source <dir>]
 *
 * Zero dependencies beyond the core. The ledger is a file; the CLI just
 * reads it — local-first, grep-able, yours.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createLedger, jsonlStore, digestTree } from "@copenode/core";

const HELP = `copenode — the metering ledger and the constitution, from the shell

usage:
  copenode trail  <file> [--sender <s>] [--kind <k>] [--json]
  copenode verify <file>
  copenode token show [--home <dir>]
  copenode policy authorize [--home <dir>] [--source <dir>]
  copenode policy verify   [--home <dir>] [--source <dir>]

commands:
  trail            print entries in order, filtered by attribution
  verify           check the hash chain; exits non-zero if history was altered
  token show       print the ingress shared secret (for the gateway config)
  policy authorize pin the current config/policy/source digests — then reload
  policy verify    compare live digests against the pin`;

function fail(message, code = 1) {
  process.stderr.write(`copenode: ${message}\n\n${HELP}\n`);
  process.exit(code);
}

/** tiny argv parser: --flag value | --flag */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function fmt(entry) {
  const { identity, decision, action, cost, outcome } = entry;
  const who = `${identity.sender} (${identity.tier})`;
  const cost$ = cost.dollars > 0 ? ` $${cost.dollars.toFixed(4)}` : "";
  const eval_ = action.kind === "eval" ? ` -> ${entry.eval.judge}:${entry.eval.verdict ?? ""}` : "";
  return `${entry.ts}  ${decision.verdict.padEnd(6)} ${decision.isolation.padEnd(8)} ${who.padEnd(38)} ${action.kind.padEnd(16)}${cost$} ${outcome.status}${eval_}`;
}

const [topCommand, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (!topCommand || topCommand === "help" || args.help) {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

const home = args.home ?? join(
  process.env.HOME ?? process.env.USERPROFILE ?? ".",
  ".paseo", "copenode",
);
const sourceDir = args.source ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "paseo-plugin");

function liveDigests() {
  const digests = {};
  for (const name of ["config.json", "policy.json"]) {
    const p = join(home, name);
    digests[name] = existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : "absent";
  }
  digests.source = existsSync(sourceDir) ? digestTree(sourceDir) : "absent";
  return digests;
}

if (topCommand === "token") {
  if (args._[0] !== "show") fail("token requires: show");
  const tokenPath = join(home, "token");
  if (!existsSync(tokenPath)) fail(`no token yet at ${tokenPath} — it is created on first plugin start`);
  process.stdout.write(readFileSync(tokenPath, "utf8").trim() + "\n");
  process.exit(0);
}

if (topCommand === "policy") {
  const sub = args._[0];
  if (sub !== "authorize" && sub !== "verify") fail("policy requires: authorize | verify");

  if (sub === "authorize") {
    const digests = liveDigests();
    writeFileSync(
      join(home, "authorize.json"),
      JSON.stringify({ digests, ts: new Date().toISOString() }, null, 2),
    );
    process.stdout.write(
      `pinned:\n` +
        Object.entries(digests).map(([k, v]) => `  ${k.padEnd(12)} ${v.slice(0, 16)}…`).join("\n") +
        `\nnow apply it:  paseo plugin reload copenode\n`,
    );
    process.exit(0);
  }

  // verify
  const pinPath = join(home, "authorize.json");
  if (!existsSync(pinPath)) fail(`no pin at ${pinPath} — run: copenode policy authorize`);
  const pin = JSON.parse(readFileSync(pinPath, "utf8")).digests ?? {};
  const live = liveDigests();
  let drift = false;
  for (const k of Object.keys(live)) {
    const ok = pin[k] === live[k];
    if (!ok) drift = true;
    process.stdout.write(`${k.padEnd(12)} ${ok ? "MATCH" : "DRIFT"}  ${live[k].slice(0, 16)}…\n`);
  }
  process.stdout.write(drift ? "DRIFT detected — re-authorize or expect safe mode\n" : "all pinned\n");
  process.exit(drift ? 1 : 0);
}

const command = topCommand;
const file = args._[0];
if (!file) fail(`${command} requires a ledger file path`);
if (command !== "trail" && command !== "verify") fail(`unknown command: ${command}`);

const store = jsonlStore(file);
if (store.tornTail) {
  process.stderr.write("copenode: warning — torn final line skipped (crash mid-append)\n");
}
const ledger = createLedger({ store });

if (command === "verify") {
  const result = ledger.verify();
  if (result.ok) {
    process.stdout.write(`ok — ${result.entries} entries, chain intact\n`);
    process.exit(0);
  }
  process.stderr.write(`BROKEN — ${result.reason} at ${result.at}\n`);
  process.exit(1);
}

// trail
const filter = {};
if (args.sender) filter.sender = args.sender;
if (args.kind) filter.kind = args.kind;
const entries = ledger.trail(filter);
if (args.json) {
  process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
} else {
  for (const entry of entries) process.stdout.write(`${fmt(entry)}\n`);
  process.stdout.write(`${entries.length} entr${entries.length === 1 ? "y" : "ies"}\n`);
}
