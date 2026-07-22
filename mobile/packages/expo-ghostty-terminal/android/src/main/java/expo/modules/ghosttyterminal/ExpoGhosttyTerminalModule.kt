package expo.modules.ghosttyterminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Why: registers the placeholder Ghostty host view + stub view functions so the JS
// TerminalSurfaceHandle can bind now; libghostty wiring lands in a later phase.
class ExpoGhosttyTerminalModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoGhosttyTerminal")

        View(GhosttyTerminalView::class) {
            Events("onReady", "onTerminalInput", "onQueryReply")

            AsyncFunction("initTerminal") { view: GhosttyTerminalView, cols: Int, rows: Int ->
                // Stub: signal readiness so callers can proceed; no terminal yet.
                view.onReady(mapOf())
            }

            AsyncFunction("write") { _: GhosttyTerminalView, _: String ->
                // Stub: Ghostty is not wired up yet.
            }

            AsyncFunction("resize") { _: GhosttyTerminalView, _: Int, _: Int ->
                // Stub: Ghostty is not wired up yet.
            }

            AsyncFunction("clear") { _: GhosttyTerminalView ->
                // Stub: Ghostty is not wired up yet.
            }
        }
    }
}
