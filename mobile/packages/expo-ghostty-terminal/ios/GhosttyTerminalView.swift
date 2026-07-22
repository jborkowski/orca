import ExpoModulesCore

// Why: this view will host Ghostty natively; the react-native-webview terminal is
// being cut off for energy reasons — do NOT implement full terminal rendering here yet.
public final class GhosttyTerminalView: ExpoView {
    let onReady = EventDispatcher()
    let onTerminalInput = EventDispatcher()
    let onQueryReply = EventDispatcher()

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        // Placeholder backing; the Ghostty surface will replace this later.
        backgroundColor = .black
    }
}
