# Remote Connection Reliability

## Summary

Create `fix/remote-connection-reliability` from the current `main`, carrying the existing dirty changes without modifying or staging them. Implement all four findings across mobile pairing, mobile WebSocket recovery, and desktop remote-runtime subscriptions.

## Key Changes

- Keep pairing offer version 2 and the required `endpoint` field, but add an optional ordered `endpoints` array. Old clients continue using `endpoint`; new clients try all candidates.
- Generate QR candidates from the selected interface first, followed by the other available non-internal IPv4 addresses. Explicit tunnel/Tailscale addresses remain supported. Do not add mDNS or a native dependency.
- Persist candidate endpoints in mobile host profiles, normalize legacy records to one candidate, and promote the endpoint that successfully completes E2EE authentication.
- Update the mobile RPC client to try every candidate within a reconnect round. Increment backoff only after the full round fails.
- Centralize socket failure finalization. Catch constructor, handshake send, encrypted send, and close exceptions; stale or duplicate events must finalize at most once.
- Reset reconnect backoff only after E2EE authentication remains stable for 30 seconds. Authentication retry accounting remains separate and resets immediately after valid authentication.
- After the fast retry budget, enter a parked state without timers. Retain mobile streams and desktop logical subscriptions.
- Revive parked connections on mobile foreground, network restoration, network type/IP-address changes, and a new RPC request. Revive desktop remote connections on Electron power resume, window focus, or a new request.
- Keep authentication revocation, invalid keys, and protocol incompatibility terminal. Only connectivity failures enter parked recovery.
- Add redacted diagnostics for candidate index, reconnect round, stable-reset state, and parked/revived transitions; never log tokens or full pairing URLs.

## Interfaces

- Extend pairing and stored-host schemas with optional `endpoints: string[]`, retaining `endpoint` as the preferred/backward-compatible value.
- Extend mobile `ConnectOptions` with candidate endpoints and an authenticated-endpoint callback.
- Replace the mobile-specific foreground nudge with `notifyConnectionMayBeAvailable()`.
- Add the same nudge method and a parked diagnostic flag to `RemoteRuntimeSharedControlConnection`, plus a main-process fan-out function for all cached connections.

## Test Plan

- Mobile tests: handshake stalls do not reset backoff; constructor/send exceptions recover without uncaught errors; duplicate close/error events are idempotent; candidate fallback and promotion work; legacy single-endpoint hosts still connect.
- Revival tests: same-type Wi-Fi IP changes, foregrounding, and new requests revive parked clients without duplicate sockets or subscriptions.
- Desktop tests: retry exhaustion retains subscriptions; focus, wake, and new requests reconnect and replay each subscription exactly once; explicit close and auth failures remain terminal.
- Pairing tests: optional candidates round-trip in shared and mobile parsers while old single-endpoint payloads remain valid.
- Run focused mobile Vitest and typecheck, focused shared/main Vitest, then node and web typechecks. Do not launch the Electron or Expo applications for verification.

## Assumptions

- Branch creation occurs when execution is allowed: `git switch -c fix/remote-connection-reliability`.
- Existing mobile UI and `tsconfig` changes remain untouched and unstaged.
- Recovery is event-driven after the fast budget; there is no indefinite background timer.
- Endpoint mobility is limited to candidates captured during pairing. DHCP changes not represented by those candidates may still require re-pairing.
