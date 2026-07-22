import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_ATTACH_CLIENT_ROLE,
  WORKSPACE_ATTACH_CLIENT_ROLES,
  WorkspaceAttachClientSchema,
  WorkspaceIdentitySchema,
  isInteractiveAttachRole,
  parseWorkspaceAttachClientRole,
  workspaceIdentityKey,
  type WorkspaceIdentity
} from './workspace-attach'

describe('workspace attach client role', () => {
  it('exposes exactly interactive and notify', () => {
    expect(WORKSPACE_ATTACH_CLIENT_ROLES).toEqual(['interactive', 'notify'])
  })

  it('defaults to interactive so pre-Phase-2 clients keep behavior', () => {
    expect(DEFAULT_WORKSPACE_ATTACH_CLIENT_ROLE).toBe('interactive')
    expect(parseWorkspaceAttachClientRole(undefined)).toBe('interactive')
    expect(parseWorkspaceAttachClientRole(null)).toBe('interactive')
    expect(parseWorkspaceAttachClientRole('')).toBe('interactive')
    expect(parseWorkspaceAttachClientRole('bogus')).toBe('interactive')
    expect(parseWorkspaceAttachClientRole(42)).toBe('interactive')
  })

  it('preserves valid roles', () => {
    expect(parseWorkspaceAttachClientRole('interactive')).toBe('interactive')
    expect(parseWorkspaceAttachClientRole('notify')).toBe('notify')
  })

  it('gates the terminal write floor to interactive', () => {
    expect(isInteractiveAttachRole('interactive')).toBe(true)
    expect(isInteractiveAttachRole('notify')).toBe(false)
  })
})

describe('workspace identity', () => {
  it('accepts a full non-secret identity', () => {
    const identity: WorkspaceIdentity = {
      runtimeId: 'rt-123',
      hostNamespace: 'a'.repeat(32),
      deviceScope: 'mobile'
    }
    expect(WorkspaceIdentitySchema.parse(identity)).toEqual(identity)
  })

  it('allows a purely local runtime with no host namespace', () => {
    expect(WorkspaceIdentitySchema.parse({ runtimeId: 'rt-1' })).toEqual({ runtimeId: 'rt-1' })
    expect(WorkspaceIdentitySchema.parse({})).toEqual({})
  })

  it('rejects empty string ids', () => {
    expect(WorkspaceIdentitySchema.safeParse({ runtimeId: '' }).success).toBe(false)
    expect(WorkspaceIdentitySchema.safeParse({ hostNamespace: '' }).success).toBe(false)
  })

  it('rejects an unknown device scope', () => {
    expect(WorkspaceIdentitySchema.safeParse({ deviceScope: 'desktop' }).success).toBe(false)
  })

  it('produces a stable key shared across reconnects', () => {
    const a: WorkspaceIdentity = { runtimeId: 'rt-1', hostNamespace: 'ns-1' }
    const b: WorkspaceIdentity = { runtimeId: 'rt-1', hostNamespace: 'ns-1', deviceScope: 'mobile' }
    expect(workspaceIdentityKey(a)).toBe('rt-1::ns-1')
    // Why: the key ignores scope/clientId so two attaches to the same workspace collapse.
    expect(workspaceIdentityKey(b)).toBe(workspaceIdentityKey(a))
  })

  it('keys a local runtime distinctly from a namespaced one', () => {
    expect(workspaceIdentityKey({ runtimeId: 'rt-1' })).toBe('rt-1::local')
    expect(workspaceIdentityKey({})).toBe('-::local')
  })
})

describe('workspace attach client', () => {
  it('defaults a missing role to interactive', () => {
    const parsed = WorkspaceAttachClientSchema.parse({ clientId: 'c1' })
    expect(parsed).toEqual({ clientId: 'c1', role: 'interactive' })
  })

  it('keeps an explicit notify role', () => {
    const parsed = WorkspaceAttachClientSchema.parse({
      clientId: 'c2',
      role: 'notify',
      name: 'iPhone',
      lastSeenAt: 1000
    })
    expect(parsed).toEqual({ clientId: 'c2', role: 'notify', name: 'iPhone', lastSeenAt: 1000 })
  })

  it('requires a clientId', () => {
    expect(WorkspaceAttachClientSchema.safeParse({ role: 'notify' }).success).toBe(false)
  })
})
