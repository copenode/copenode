#!/usr/bin/env node
/**
 * copenode — CLI for the metering ledger.
 *
 *   copenode trail  <ledger.jsonl> [--sender S] [--kind K] [--json]
 *   copenode verify <ledger.jsonl>
 *
 * Zero dependencies beyond the core. The ledger is a file; the CLI just
 * reads it — local-first, grep-able, yours.
 */

import { createLedger, jsonlStore } from "@copenode/core";

const HELP = `copenode — the metering ledger, from the shell

usage:
  copenode trail  <file> [--sender <s>] [--kind <k>] [--json]
  copenode verify <file>

commands:
  trail    print entries in order, filtered by attribution
  verify   check the hash chain; exits non-zero if history was altered`;

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
  return `${entry.ts}  ${decision.verdict.padEnd(6)} ${decision.isolation.padEnd(8)} ${who.padEnd(38)} ${action.kind.padEnd(10)}${cost$} ${outcome.status}${eval_}`;
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (!command || command === "help" || args.help) {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

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
