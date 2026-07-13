import { Script } from 'node:vm'
import { GhosttyCore } from '@wterm/ghostty'
import { describe, expect, it } from 'vitest'
import { WTERM_GHOSTTY_WASM_BASE64 } from './terminal-webview-engine.generated'
import { TERMINAL_GHOSTTY_SCROLLBACK_JS } from './terminal-webview-ghostty-scrollback-injected'

type GhosttyScrollbackFacade = {
  init: (cols: number, rows: number) => void
  writeString: (value: string) => void
  getScrollbackCount: () => number
  getScrollbackLineLen: (offset: number) => number
  getScrollbackCell: (offset: number, col: number) => { char: number }
}

function scrollbackConstructor(): new (
  core: GhosttyCore,
  limit: number
) => GhosttyScrollbackFacade {
  const context: { result?: unknown } = {}
  new Script(
    `${TERMINAL_GHOSTTY_SCROLLBACK_JS}; result = OrcaGhosttyScrollbackCore;`
  ).runInNewContext(context)
  return context.result as new (core: GhosttyCore, limit: number) => GhosttyScrollbackFacade
}

function readOldestFirst(core: GhosttyScrollbackFacade): string[] {
  const count = core.getScrollbackCount()
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1
    const length = core.getScrollbackLineLen(offset)
    let value = ''
    for (let col = 0; col < length; col++) {
      value += String.fromCodePoint(core.getScrollbackCell(offset, col).char)
    }
    return value
  })
}

describe('Ghostty WebView scrollback facade', () => {
  it('preserves rows that leave the Ghostty viewport', async () => {
    const ghostty = await GhosttyCore.load({
      wasmPath: `data:application/wasm;base64,${WTERM_GHOSTTY_WASM_BASE64}`,
      scrollbackLimit: 100
    })
    const Core = scrollbackConstructor()
    const core = new Core(ghostty, 100)
    core.init(10, 4)
    core.writeString(`${Array.from({ length: 10 }, (_, index) => index + 1).join('\r\n')}\r\n`)

    expect(core.getScrollbackCount()).toBe(7)
    expect(readOldestFirst(core)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })
})
