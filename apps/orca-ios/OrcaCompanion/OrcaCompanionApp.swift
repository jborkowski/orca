import SwiftUI

// Why: separate Swift companion (dev/fork only). Does not replace the Expo App Store app.
@main
struct OrcaCompanionApp: App {
  @State private var session = CompanionSession()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(session)
    }
    .onChange(of: scenePhase) { _, phase in
      // Why: background → role=notify (no glyph stream); foreground → interactive + snapshot.
      session.handleScenePhase(phase)
    }
  }
}
