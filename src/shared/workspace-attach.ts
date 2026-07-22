import { z } from 'zod'
import type { DeviceScope } from './runtime-types'

// Why: Phase 2 product model — an Orca "workspace" (the `orca serve`/desktop
// runtime plus its daemon PTY identity) outlives the clients that attach to it.
// These types name the attach contract so re-attach, notify-only, and
// interactive clients share one vocabulary. See
// docs/reference/workspace-attach-contract.md.

// Why: an interactive client drives PTY input/browser (RuntimeTerminalDriverState
// 'mobile'/'desktop'); a notify client only rides the notifications.subscribe
// push channel and never takes the terminal write floor.
export const WORKSPACE_ATTACH_CLIENT_ROLES = ['interactive', 'notify'] as const

export type WorkspaceAttachClientRole = (typeof WORKSPACE_ATTACH_CLIENT_ROLES)[number]

export const WorkspaceAttachClientRoleSchema = z.enum(WORKSPACE_ATTACH_CLIENT_ROLES)

// Why: additive default — pre-Phase-2 clients send no role and must keep their
// existing interactive behavior, so a missing/invalid role resolves here.
export const DEFAULT_WORKSPACE_ATTACH_CLIENT_ROLE: WorkspaceAttachClientRole = 'interactive'

// Why: mirrors RuntimeStatus.deviceScope / the pairing offer scope. Kept local
// (not imported from a non-exported pairing schema) so this contract stays
// self-contained; the inferred union equals DeviceScope.
const DeviceScopeSchema = z.enum(['mobile', 'runtime']) satisfies z.ZodType<DeviceScope>

// Why: the persistent workspace identity a client re-attaches to. All fields are
// non-secret; the pairing deviceToken is auth material and never belongs here
// (remote-connection-reliability-plan: never log tokens).
export const WorkspaceIdentitySchema = z.object({
  // Why: the runtime instance that owns terminal model state and PTY sessions.
  // Optional because pre-contract runtimes and clients that have not yet read
  // status.get may not know it (mirrors RuntimeStatus.runtimeId absence handling).
  runtimeId: z.string().min(1).optional(),
  // Why: stable, non-secret per-host namespace (the sha256 the remote-workspace
  // sync derives from the connection target via getRemoteWorkspaceNamespace).
  // Absent for a purely local runtime that has no remote pairing.
  hostNamespace: z.string().min(1).optional(),
  // Why: the access scope the attaching device token grants; advisory only, the
  // runtime still authorizes from the token itself.
  deviceScope: DeviceScopeSchema.optional()
})

export type WorkspaceIdentity = z.infer<typeof WorkspaceIdentitySchema>

// Why: one attached client. Extends the fields RemoteWorkspaceConnectedClient
// already tracks (clientId/name/lastSeenAt) with the attach role so notify-only
// clients are distinguishable without a breaking protocol change.
export const WorkspaceAttachClientSchema = z.object({
  clientId: z.string().min(1),
  role: WorkspaceAttachClientRoleSchema.default(DEFAULT_WORKSPACE_ATTACH_CLIENT_ROLE),
  name: z.string().optional(),
  lastSeenAt: z.number().optional()
})

export type WorkspaceAttachClient = z.infer<typeof WorkspaceAttachClientSchema>

// Why: tolerant parse for a role arriving over RPC/JSON where the field may be
// missing, null, or an unknown string. Defaults to interactive so today's
// behavior is preserved.
export function parseWorkspaceAttachClientRole(raw: unknown): WorkspaceAttachClientRole {
  const parsed = WorkspaceAttachClientRoleSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_WORKSPACE_ATTACH_CLIENT_ROLE
}

// Why: only interactive clients may take the terminal write floor / drive
// browser; notify clients are read-through push subscribers.
export function isInteractiveAttachRole(role: WorkspaceAttachClientRole): boolean {
  return role === 'interactive'
}

// Why: a stable, non-secret key for maps, dedupe, and redacted diagnostics. Two
// clients attaching to the same runtime+host share this key even across
// reconnects; session IDs and clientIds are intentionally excluded.
export function workspaceIdentityKey(identity: WorkspaceIdentity): string {
  return `${identity.runtimeId ?? '-'}::${identity.hostNamespace ?? 'local'}`
}
