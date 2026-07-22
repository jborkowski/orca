# Orca Companion (Swift, Dev)

Separate **power-efficient** iOS companion for the Orca fork. Speaks the same desktop / `orca serve` WS RPC as Expo mobile.

**Does not replace** the Expo app in `mobile/`. Bundle id: `dev.orca.companion.swift`.

See [`docs/reference/swift-native-companion-plan.md`](../../docs/reference/swift-native-companion-plan.md).

## Constraints

- Do **not** install/overwrite `/Applications/Orca.app` or relaunch desktop from this tree.
- Pair later against your already-running Orca on `:6768`.
- Slice S0 = scaffold + protocol gate + Keychain smoke.
- Slice S1–S2 (first usable) = Liquid Glass host list, paste-pair, E2EE connect, worktree list + tab peek.
- Slice S3 = one-pane terminal: Ghostty VT + **Metal glyph atlas** (render-state → MTKView).

## Generate & open

```bash
cd apps/orca-ios
xcodegen generate
open OrcaCompanion.xcodeproj
```

## Vendor Ghostty VT (required for spike / tests)

```bash
cd apps/orca-ios
./Scripts/fetch-ghostty-vt.sh
```

This installs tip `ghostty-vt.xcframework` (iOS + simulator + macOS VT core). **Not** a Metal glyph renderer — see `docs/reference/swift-native-companion-plan.md`.

## Prove S0–S1 wire + Ghostty-vt spike (simulator unit tests — no live Orca)

```bash
cd apps/orca-ios
xcodegen generate
xcodebuild test \
  -project OrcaCompanion.xcodeproj \
  -scheme OrcaCompanion \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -quiet
```

If the simulator name differs, list with `xcrun simctl list devices available`.
