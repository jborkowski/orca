# ET-Style Durable Link — Status

Tracks the [remote-connection-reliability plan](./remote-connection-reliability-plan.md)
against shipped code. "ET-style" = an EternalTerminal-like durable link:
multi-endpoint candidates, event-driven revival, and no indefinite background
retry timers.

## Shipped (plan fully implemented)

| Plan item | Where it lives |
| --- | --- |
| Pairing offer v2 keeps required `endpoint`, adds optional ordered `endpoints` | `src/shared/pairing.ts`, `mobile/src/transport/types.ts` (`PairingOfferSchema`) |
| Persist candidate endpoints in host profiles; normalize legacy record to one candidate; promote authenticated endpoint | `mobile/src/transport/host-store.ts`, `save-paired-host.ts` |
| Mobile RPC client tries every candidate in a round; backoff increments only after the full round fails | `rpc-client.ts` → `scheduleNextCandidateOrReconnectRound` / `scheduleReconnectRound` |
| Centralized socket-failure finalization (constructor, handshake send, encrypted send, close, stale/dup events → finalize at most once) | `rpc-client.ts` → `finalizeSocketFailure` / `ignoreStaleSocketEvent` / `handleSocketClosed` |
| Reset backoff only after E2EE auth is stable for 30s; auth-retry accounting is separate and resets on auth | `rpc-client.ts` → `scheduleStableConnectionReset`; `STABLE_CONNECTION_RESET_MS` |
| Park after the fast retry budget with **no** timers; retain mobile streams / desktop logical subscriptions | mobile `scheduleReconnectRound` (`parked = true`), desktop `SharedControlRecovery` / `scheduleSharedControlReconnectOrFinish` |
| Revive parked links on foreground, network restore, network type/IP change, new request | `connection-revival-triggers.ts`, `rpc-client.ts` → `notifyConnectionMayBeAvailable` |
| Revive desktop connections on power resume, window focus, new request; fan-out over cached connections | `src/main/index.ts` (`powerMonitor`/`browser-window-focus`), `runtime-environment-request-connections.ts` → `notifyAllRemoteRuntimeConnectionsMayBeAvailable` |
| Auth revocation / invalid key / protocol incompatibility stay terminal; only connectivity failures park | mobile `handleAuthRejection` / `handleProtocolFailure`; desktop `finishTerminalSharedControlSubscriptions` |
| Redacted diagnostics (candidate index, reconnect round, stable-reset, parked/revived) with no tokens/URLs | `rpc-client-recovery-policy.ts` → `redactedEndpoint`; `remote-runtime-shared-control-recovery.ts` logs |

## Gap closed this pass

- **Handshake-stall backoff regression tests** were missing. The connect-timeout
  path (onopen never arrives) was covered, but the distinct handshake-timeout
  path (onopen arrives, `e2ee_authenticated` never does) had no lock, and the
  plan's "handshake stalls do not reset backoff" behavior was unverified.
  Added two tests to `mobile/src/transport/rpc-client.test.ts`:
  - a stalled handshake terminates the socket and enters `reconnecting`;
  - a stalled handshake on a retried socket keeps backoff climbing (never reaches
    `connected`, so the 30s stable-reset never arms).

## Still open

- None against this plan. Endpoint mobility is intentionally limited to
  candidates captured at pairing time — DHCP changes not represented by those
  candidates still require re-pairing (see plan Assumptions).
