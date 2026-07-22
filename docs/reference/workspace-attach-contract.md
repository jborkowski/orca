# Workspace Attach Contract

## Goal

Define the persistent-workspace attach model Orca uses so that clients can leave
and re-attach without losing terminal state, and so that notification-only
clients coexist with interactive ones. This is a product-model contract for
Phase 2; it names the identity and role vocabulary in
[`src/shared/workspace-attach.ts`](../../src/shared/workspace-attach.ts).

## The Coder Analogy

Coder separates a long-lived **workspace** (a dev environment that keeps running
on a host) from the **clients** that connect to it. You can close your editor,
switch devices, or drop your network, and the workspace — with its processes —
is still there when you reconnect.

Orca's equivalent:

- **Workspace** = the `orca serve` / desktop **runtime** plus its **daemon PTY
  identity**. The runtime owns the terminal model, PTY sessions, snapshots, and
  side-effect facts (see
  [`terminal-model-view-contract.md`](./terminal-model-view-contract.md)).
- **Clients** = the disposable views that attach to it: the desktop remote
  runtime, mobile, and the CLI read/subscribe surfaces. A client is a *view*,
  not the *owner* of state.
- **Session IDs outlive clients.** A minted PTY session id encodes its owning
  worktree (`${repoId}::${path}@@…`, see
  [`pty-session-id-format.ts`](../../src/shared/pty-session-id-format.ts)) and
  belongs to the runtime, not to whichever client last drew it. Re-attach
  reconnects to the same session id; it does not spawn a new one.

Running the workspace as a headless host is the clearest form of this split —
see [`headless-linux-server.md`](./headless-linux-server.md). The runtime keeps
advancing whether or not a client is attached.

## This Is Not tmux

tmux multiplexes one terminal server: it keeps raw PTY byte streams alive and
re-paints a client by replaying bytes. The daemon here does **not** work that
way, and tmux does not replace it:

- The runtime owns an authoritative **model** derived from PTY bytes, plus
  bounded **snapshots** for restore — not an unbounded byte log to replay.
- Terminal **query authority** is singular and structural; the daemon emulator
  never answers device queries (see the model/view contract). tmux has no
  equivalent notion.
- Non-terminal surfaces (browser pages, file/markdown tabs, agent status,
  notifications) attach to the same workspace. tmux only knows terminals.

Treat the daemon as the workspace runtime that clients re-attach to, not as a
terminal-stream multiplexer.

## Identity

`WorkspaceIdentity` names the persistent thing a client re-attaches to. All
fields are **non-secret** — the pairing `deviceToken` is auth material and never
appears here (per
[`remote-connection-reliability-plan.md`](./remote-connection-reliability-plan.md):
never log tokens).

| Field          | Source                                              | Notes |
| -------------- | --------------------------------------------------- | ----- |
| `runtimeId`    | `RuntimeStatus.runtimeId`                            | The runtime instance that owns model state. Optional: pre-contract runtimes or clients that have not read `status.get` may not know it yet. |
| `hostNamespace`| `getRemoteWorkspaceNamespace` (sha256 of the target)| Stable per-host namespace the remote-workspace sync already scopes snapshots by. Absent for a purely local runtime. |
| `deviceScope`  | `RuntimeStatus.deviceScope` / pairing scope         | Advisory (`mobile` / `runtime`). The runtime still authorizes from the token itself. |

`workspaceIdentityKey(identity)` yields a stable, non-secret key
(`runtimeId::hostNamespace`) for maps, dedupe, and redacted diagnostics. Two
attaches to the same workspace share the key across reconnects; it deliberately
excludes client IDs and session IDs.

## Client Roles

`WorkspaceAttachClientRole` distinguishes how a client participates:

- **`interactive`** — drives PTY input and browser; may take the terminal write
  floor (`RuntimeTerminalDriverState`). This is the default.
- **`notify`** — a read-through push subscriber that rides the existing
  `notifications.subscribe` channel and never takes the write floor.

`parseWorkspaceAttachClientRole(raw)` resolves a missing, null, or unknown role
to `interactive`. This keeps the change **additive**: pre-Phase-2 clients that
send no role behave exactly as they do today. `isInteractiveAttachRole(role)`
gates write-floor eligibility.

`WorkspaceAttachClient` extends the fields the remote-workspace sync already
tracks for a connected client (`clientId`, `name`, `lastSeenAt`; see
`RemoteWorkspaceConnectedClient`) with the attach `role`.

## Compatibility

- Additive only. No existing protocol field changes meaning; no field is
  removed. `RUNTIME_PROTOCOL_VERSION` does not need to bump for adding these
  optional fields (see
  [`protocol-version.ts`](../../src/shared/protocol-version.ts)).
- Defaults preserve today's behavior: absent role ⇒ `interactive`, absent
  identity fields ⇒ tolerated.
- Later phases (2c and on) that add attach RPCs or persistence must keep the
  non-secret identity rule and the interactive default.
