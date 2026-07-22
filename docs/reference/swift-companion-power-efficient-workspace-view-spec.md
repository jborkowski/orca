# Spec: Power-efficient Swift companion workspace view

Local fork spec only — not filed against upstream `stablyai/orca`.
Companion tree: `apps/orca-ios/`. Related plan: `docs/reference/swift-native-companion-plan.md`.
Attach vocabulary: `docs/reference/workspace-attach-contract.md`, `src/shared/workspace-attach.ts`.

## Problem Statement

Using Orca from an iPhone drains battery when the client stays interactive (glyph stream, live terminal surface, transport) while the user is mostly viewing a workspace and only occasionally typing or dictating. The Expo app remains the App Store daily driver; the Swift companion exists to be a lighter client. Today the companion can open a session, but it does not yet reliably flip to notify-only when backgrounded, park transport, or survive repeated workspace reloads across multiple paired hosts without leaving expensive interactive work running.

## Solution

Ship a power-first Swift companion workflow: pair to already-running desktop / `orca serve` hosts, open a workspace to **view** it, type and use voice when foregrounded, drop to `role=notify` (no glyph stream) when backgrounded, and support **re-attaching / reloading workspaces more than once across different hosts**. Local notifications for agent-complete are secondary. Do not replace Expo or relaunch `/Applications/Orca.app`.

## User Stories

1. As an iPhone user, I want the companion to use far less battery than an always-interactive terminal client, so that I can leave workspaces attached without draining the phone.
2. As an iPhone user, I want to open a worktree session and view its terminal, so that I can monitor agent / shell progress away from the desktop.
3. As an iPhone user, I want to type into the active terminal when the app is foreground, so that I can steer the session without returning to the Mac.
4. As an iPhone user, I want to dictate with voice into the active terminal when the app is foreground, so that I can send prompts hands-free.
5. As an iPhone user, I want exactly one live terminal surface when viewing, so that inactive tabs do not keep rendering or streaming glyphs.
6. As an iPhone user, when I background the app, I want the client to switch to `role=notify` and stop the glyph stream, so that background time is cheap.
7. As an iPhone user, when I foreground the app again, I want to return to `role=interactive` and restore the terminal from subscribe snapshot, so that viewing resumes without a full cold spawn.
8. As an iPhone user, I want transport to park after fast retry when the network drops, so that reconnect storms do not burn battery.
9. As an iPhone user, I want transport to revive on foreground or network restore, so that I can resume viewing without re-pairing.
10. As an iPhone user, I want to pair multiple desktop hosts, so that home and work (or laptop and desktop) are both available.
11. As an iPhone user, I want to switch between hosts and reload workspaces more than once, so that re-opening sessions does not leave stale interactive subscriptions.
12. As an iPhone user, I want leaving one workspace and opening another (same or different host) to tear down the previous interactive stream, so that only the current view costs power.
13. As an iPhone user, I want a protocol-version gate on connect, so that an incompatible host fails clearly instead of half-working.
14. As an iPhone user, I want paste-pair (and later camera QR) against an already-running host on `:6768`, so that I never need the companion to launch desktop Orca.
15. As an iPhone user, I want Keychain-backed host tokens, so that re-connect across app launches stays secure and low-friction.
16. As an iPhone user, I want agent-complete notifications only as a secondary path while notify-attached, so that I can glance at progress without keeping the terminal hot.
17. As an iPhone user, I want notifications to be optional / secondary to viewing + input, so that power work is not blocked on full push parity.
18. As an iPhone user, I want no WKWebView terminal, so that the view path stays on VT + Metal (or an explicit TerminalEngine escape hatch), not a WebView battery profile.
19. As an iPhone user, I want inactive session tabs unmounted and restored from snapshot, so that multi-tab later still obeys the one-live-surface rule.
20. As an iPhone user, I want dictation setup errors from the desktop speech APIs to surface clearly, so that voice works when the host is configured and fails honestly when it is not.
21. As an iPhone user, I want typing and dictation disabled (or clearly blocked) while `role=notify`, so that a backgrounded client cannot steal the terminal write floor.
22. As an an iPhone user, I want host list status that reflects connected / parked / incompatible, so that I know which host is safe to open without retry thrash.
23. As a fork maintainer, I want Expo `mobile/` left untouched as the App Store app, so that this companion stays a dev/power track.
24. As a fork maintainer, I want the companion bundle id to remain `dev.orca.companion.swift`, so that it never collides with the store app.
25. As a developer, I want attach role flips proven at the wire seam, so that power behavior does not regress when UI changes.
26. As a developer, I want repeated open/close/reload across two hosts covered by tests, so that subscription leaks are caught before Instruments.
27. As a developer, I want Instruments / energy guidance as an acceptance gate for background notify, so that “feels lighter” is measurable.
28. As a developer, I want full Expo source-control / PR / files / tasks / browser parity deferred, so that power + view + voice/typing + multi-host reload ships first.

## Implementation Decisions

- **Primary seam (one):** power-efficient workspace-view attach lifecycle on the shared workspace-attach + WS RPC host contract (`interactive` ↔ `notify`, terminal subscribe/unsubscribe + snapshot restore, parked transport, speech dictation RPCs while interactive). Swift is a second client of the same host protocol Expo already speaks; prove behavior at that wire/role boundary via the existing injectable WebSocket channel test harness.
- **Product scope for this spec:** pair → multi-host store → worktree list → session view → typing + voice → background notify role + optional local notifications → reliable repeated re-attach/reload across hosts.
- **Notifications are secondary:** implement notify-role attach and stop glyph streaming first; local notifications for agent-complete may follow on `notifications.subscribe` without blocking the power path.
- **One live surface rule:** only the foreground active terminal mounts Metal/VT; switching worktree/host/tab must unsubscribe and unmount the previous interactive surface before starting the next.
- **Multi-host reload:** HostStore remains the source of paired host metadata + Keychain tokens; switching hosts must fully detach prior RPC client/subscriptions before connecting the next; reloading the same workspace more than once must be idempotent (no stacked `terminal.subscribe` / interactive roles).
- **Input:** typing uses existing `terminal.send`; voice uses the desktop speech/dictation RPC surface already used by Expo mobile (`speech.*` / dictation setup + start/stop/finish). Dictation is in-scope for foreground interactive view; it is out of scope while notify-only.
- **Do not relaunch desktop Orca** from the companion; pair only to an already-running `:6768` (or equivalent serve) endpoint.
- **Do not modify Expo `mobile/`** as part of delivering this companion power track (Expo may later mirror the same attach-role discipline, but that is a separate change).
- **No WKWebView terminal** in the Swift companion; keep Ghostty VT + Metal path (TerminalEngine escape hatch only if VT/Metal is blocked).
- **Protocol gate:** keep existing protocol-version check on `status.get`; incompatible hosts show a blocked state rather than partial interactive attach.
- **Deployment / UI:** iOS 26 Liquid Glass chrome may remain; power behavior must not depend on glass effects.
- **Bundle id:** `dev.orca.companion.swift` (dev/fork only).

## Testing Decisions

- Good tests assert **external behavior** at the attach/RPC seam: which role is sent, which subscribe/unsubscribe methods fire, that glyph/terminal streams stop on background or host switch, that reload across hosts does not leave duplicate interactive subscriptions, and that typing/dictation RPCs only occur while interactive.
- Prefer the existing injectable WebSocket channel + companion unit test style (RPC, E2EE, terminal stream protocol, VT/Metal capture) over new end-to-end stacks.
- Cover at least: foreground interactive attach; background → notify + terminal unsubscribe; foreground restore from subscribe snapshot; park then revive; host A → host B switch with full detach; open → close → reopen same workspace twice; dictation/typing blocked in notify role.
- Do not test SwiftUI layout details or Metal draw call counts as the primary gate; use role/subscription behavior plus an optional Instruments energy checklist for human acceptance.
- Prior art: companion tests under `OrcaCompanionTests`, Expo `rpc-client` role/subscribe tests, and `workspace-attach` shared contract tests on the host side.

## Out of Scope

- Publishing this spec or tracking issue to upstream `stablyai/orca`
- Replacing or deleting the Expo `mobile/` App Store app
- Full Expo parity slices (source control hub, PR review, files explorer, tasks, accounts, history, browser screencast, full settings surface) except where required for view + voice/typing + multi-host reload
- Relaunching, installing, or overwriting `/Applications/Orca.app`
- Android
- Making notifications the primary success metric
- Perfect glyph/UX parity with Expo’s WebView terminal quirks

## Further Notes

- Success metric is **lower iPhone energy** for the “view workspace + occasional type/dictate” habit, especially across repeated reloads and multiple hosts — not feature checklist completion vs Expo.
- Suggested delivery order: (1) role flip + single-surface teardown on background/host/workspace switch, (2) parked transport revive, (3) voice+typing hardened on interactive only, (4) secondary local notifications.
- This document lives on the fork (`origin` → `jborkowski/orca`) as reference only unless explicitly filed later on that fork’s Issues.
