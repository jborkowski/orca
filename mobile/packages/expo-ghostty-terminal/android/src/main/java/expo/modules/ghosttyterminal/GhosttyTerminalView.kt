package expo.modules.ghosttyterminal

import android.content.Context
import android.graphics.Color
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Why: this view will host Ghostty natively; the react-native-webview terminal is
// being cut off for energy reasons — do NOT implement full terminal rendering here yet.
class GhosttyTerminalView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    val onReady by EventDispatcher()
    val onTerminalInput by EventDispatcher()
    val onQueryReply by EventDispatcher()

    init {
        // Placeholder backing; the Ghostty surface will replace this later.
        setBackgroundColor(Color.BLACK)
    }
}
