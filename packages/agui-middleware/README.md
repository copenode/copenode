# @copenode/agui-middleware

copenode's **AG-UI plane**: observe-only middleware that meters any
[AG-UI](https://docs.ag-ui.com) event stream into the policy spine's ledger.

Point an AG-UI client at this middleware instead of the agent's own URL;
it proxies bytes untouched and taps the event stream:

- `RUN_STARTED` → ledger row (spawned, attributed to the configured sender)
- `TOOL_CALL_START` → counted on the run
- `RUN_FINISHED` / `RUN_ERROR` → finish row + mechanical eval (tool and
  subagent counts)
- linked by `refId` — spawn, finish, eval: one run, three witnessed rows

**Observe-only**: the middleware reads streams; it never blocks, mutates,
or delays third-party traffic. Policy enforcement on this lane is a later,
explicit decision.

## Status

**Phase 3 scaffold** — the meter core is complete and tested; the HTTP
proxy/tee server lands next.

MIT. See the [monorepo](https://github.com/copenode/copenode) for status.
