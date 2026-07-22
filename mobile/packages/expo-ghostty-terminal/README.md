# Orca Ghostty Terminal

Vendored Expo module that **will** host [Ghostty](https://ghostty.org) as the native
terminal surface for the Orca mobile app (iOS and Android).

> [!IMPORTANT]
> This package is a **scaffold**. The native Ghostty renderer is **not implemented
> yet** — the view is a placeholder black surface and the view functions are stubs.
> It exists so the JS terminal handle can be frozen and swapped in ahead of the
> `react-native-webview` terminal being cut off (for energy reasons). libghostty
> wiring lands in a later phase.

## Status

| Area                     | State                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| TS public API            | **Real** — typed handle, props, event guards (see below)              |
| Pure event guards        | **Real** — `isGhosttyTerminalInputEvent`, `isGhosttyTerminalQueryReplyEvent` (unit-tested) |
| iOS native view/module   | **Stub** — placeholder `ExpoView`, no-op `write`/`resize`/`clear`     |
| Android native view/module | **Stub** — placeholder `ExpoView`, no-op `write`/`resize`/`clear`   |
| Web                      | **Stub** — renders a "not available on web" placeholder, no-op handle |
| Ghostty rendering        | **Not implemented** — will host libghostty later                      |

## Public exports

```ts
import {
  GhosttyTerminalView,
  isGhosttyTerminalInputEvent,
  isGhosttyTerminalQueryReplyEvent,
  type GhosttyTerminalHandle,
  type GhosttyTerminalViewProps,
  type GhosttyTerminalInputEvent,
  type GhosttyTerminalQueryReplyEvent,
  type GhosttyTerminalEventMap,
  type GhosttyTerminalReadyCallback,
  type GhosttyTerminalInputCallback,
  type GhosttyTerminalQueryReplyCallback
} from '@orca/expo-ghostty-terminal'
```

### `GhosttyTerminalHandle`

Intentionally a subset of the existing `TerminalSurfaceHandle`. The scaffold only
freezes the methods needed to swap `TerminalWebView` later:

```ts
interface GhosttyTerminalHandle {
  init: (cols: number, rows: number) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  clear: () => void
}
```

### `GhosttyTerminalView`

```tsx
import { useRef } from 'react'
import { GhosttyTerminalView, type GhosttyTerminalHandle } from '@orca/expo-ghostty-terminal'

function Example() {
  const ref = useRef<GhosttyTerminalHandle>(null)
  return (
    <GhosttyTerminalView
      ref={ref}
      style={{ flex: 1 }}
      onReady={() => ref.current?.init(80, 24)}
      onTerminalInput={(event) => console.log('input', event.bytes)}
      onQueryReply={(event) => console.log('reply', event.bytes)}
    />
  )
}
```

> The view is **not** wired into `TerminalPaneView` / session screens yet — doing so
> would change the live terminal path. That integration happens in a later phase.

## Installation

Consumed as a workspace `file:` dependency from `mobile/package.json`:

```jsonc
"@orca/expo-ghostty-terminal": "file:./packages/expo-ghostty-terminal"
```

Native code is registered automatically via `expo-module.config.json` and requires a
**dev client** build (it will not load under Expo Go). `requireNativeView` throws a
clear "native module not linked" error if the dev client is missing.

## Testing

Pure TS logic (the event type guards) is unit-tested with vitest:

```bash
# from this package directory
npx vitest run
# or
pnpm test:unit
```

The native stubs and the `GhosttyTerminalView` React bindings are exercised in a later
phase once libghostty is integrated and a dev-client build is available on device.
