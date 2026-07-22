import ExpoModulesCore

// Why: registers the placeholder Ghostty host view + stub view functions so the JS
// TerminalSurfaceHandle can bind now; libghostty wiring lands in a later phase.
public class ExpoGhosttyTerminalModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoGhosttyTerminal")

        View(GhosttyTerminalView.self) {
            Events("onReady", "onTerminalInput", "onQueryReply")

            AsyncFunction("initTerminal") { (view: GhosttyTerminalView, cols: Int, rows: Int) in
                // Stub: signal readiness so callers can proceed; no terminal yet.
                view.onReady()
            }

            AsyncFunction("write") { (_: GhosttyTerminalView, _: String) in
                // Stub: Ghostty is not wired up yet.
            }

            AsyncFunction("resize") { (_: GhosttyTerminalView, _: Int, _: Int) in
                // Stub: Ghostty is not wired up yet.
            }

            AsyncFunction("clear") { (_: GhosttyTerminalView) in
                // Stub: Ghostty is not wired up yet.
            }
        }
    }
}
