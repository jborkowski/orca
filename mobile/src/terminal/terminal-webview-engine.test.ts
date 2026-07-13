import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import {
  WTERM_ENGINE_CSS,
  WTERM_ENGINE_JS,
  WTERM_GHOSTTY_WASM_BASE64
} from './terminal-webview-engine.generated'
import { WTERM_HTML } from './terminal-webview-html'

const terminalHtmlSource = readFileSync(
  new URL('./terminal-webview-html.ts', import.meta.url),
  'utf8'
)

describe('terminal WebView bundled engine', () => {
  it('keeps the assembled terminal HTML free of external engine URLs', () => {
    expect(WTERM_HTML).not.toMatch(/\bhttps?:\/\//)
    expect(WTERM_HTML).not.toContain('cdn.jsdelivr.net')
    expect(WTERM_HTML).not.toContain('<script src=')
    expect(WTERM_HTML).not.toContain('rel="stylesheet" href=')
  })

  it('assembles the wterm adapter and inlined Ghostty core before initialization', () => {
    const adapterDefinition = WTERM_HTML.indexOf('function OrcaWtermTerminal(options)')
    const initDefinition = WTERM_HTML.indexOf('async function init(')

    expect(adapterDefinition).toBeGreaterThanOrEqual(0)
    expect(initDefinition).toBeGreaterThan(adapterDefinition)
    expect(WTERM_HTML).toContain('data:application/wasm;base64,')
    expect(WTERM_HTML).not.toContain('WebglAddon')
  })

  it('parses the bundled engine at the Chrome 74 syntax floor', () => {
    expect(() => parse(WTERM_ENGINE_JS, { ecmaVersion: 2019 })).not.toThrow()
  })

  it('exposes only the wterm renderer and Ghostty core globals', () => {
    const window: Record<string, unknown> = {}
    const context = {
      window,
      self: window,
      globalThis: window,
      console,
      setTimeout,
      clearTimeout,
      URL
    }

    new Script(WTERM_ENGINE_JS).runInNewContext(context)

    expect(window).toMatchObject({
      WTerm: expect.any(Function),
      GhosttyCore: expect.any(Function)
    })
    expect(window).not.toHaveProperty('WebglAddon')
    expect(window).not.toHaveProperty('Unicode11Addon')
  })

  it('embeds a real Ghostty WASM module in the offline document', () => {
    const bytes = Buffer.from(WTERM_GHOSTTY_WASM_BASE64, 'base64')
    expect(bytes.byteLength).toBeGreaterThan(400_000)
    expect([...bytes.subarray(0, 4)]).toEqual([0, 97, 115, 109])
  })

  it('keeps the bundled engine from breaking out of its inline script/style tags', () => {
    // Why: the engine JS/CSS are inlined into <script>/<style> blocks. </script
    // and </style are neutralized at build time; the tokenizer-escape openers that
    // could swallow the rest of the document must also be absent from the bundle.
    expect(WTERM_ENGINE_JS).not.toMatch(/<\/script/i)
    expect(WTERM_ENGINE_JS).not.toMatch(/<script/i)
    expect(WTERM_ENGINE_JS).not.toContain('<!--')
    expect(WTERM_ENGINE_CSS).not.toMatch(/<\/style/i)
  })

  it('reports WebView message handler failures instead of swallowing them', () => {
    const start = terminalHtmlSource.indexOf('function handleIncomingMessage')
    const end = terminalHtmlSource.indexOf("window.addEventListener('resize'", start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const handlerSource = terminalHtmlSource.slice(start, end)

    expect(handlerSource).toContain('reportEngineError(')
    expect(handlerSource).toContain("'terminal init failed'")
    expect(handlerSource).toContain("'terminal message failed'")
    expect(handlerSource).not.toContain('catch(ex) {}')
  })

  it('classifies runtime errors by a document-scoped ever-ready latch', () => {
    // Why: init() flips `ready` false on every re-init (live width reflow keeps the
    // old surface visible meanwhile), so the fatal default and the init-catch must
    // key off `everReady` — otherwise a transient reflow error blanks a live
    // terminal behind the fatal overlay. The latch stays set for the document.
    expect(terminalHtmlSource).toContain('var everReady = false;')
    expect(terminalHtmlSource).toContain('everReady = true;')
    expect(terminalHtmlSource).toContain('fatal === undefined ? !everReady : !!fatal')
    expect(terminalHtmlSource).toContain("msg.type === 'init' && !everReady")
    expect(terminalHtmlSource).not.toMatch(/fatal === undefined \? !ready\b/)
  })

  it('bounds error capture and non-fatal reporting on a degraded engine', () => {
    // Why: a constructed-but-broken engine can throw per render frame; both
    // onerror capture sites must cap the buffer and non-fatal notifies must
    // stop flooding RN while fatal reports always emit.
    const capSites = terminalHtmlSource.match(/__engineErrors\.length < 20/g) ?? []
    expect(capSites.length).toBe(2)
    expect(terminalHtmlSource).toContain('nonFatalErrorNotifies > 5')
  })

  it('answers native readiness probes from the live document', () => {
    expect(terminalHtmlSource).toContain("if (msg.type === 'ping')")
    expect(terminalHtmlSource).toContain("notify({ type: 'pong', pingId: msg.id })")
  })
})
