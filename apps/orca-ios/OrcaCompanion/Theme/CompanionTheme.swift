import SwiftUI

/// Liquid Glass chrome for the companion (iOS 26+), with material fallback.
enum CompanionTheme {
  static let accent = Color.cyan
  static let backgroundTop = Color(red: 0.07, green: 0.09, blue: 0.14)
  static let backgroundBottom = Color(red: 0.04, green: 0.05, blue: 0.08)
}

struct CompanionBackdrop: View {
  var body: some View {
    LinearGradient(
      colors: [CompanionTheme.backgroundTop, CompanionTheme.backgroundBottom],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
    .ignoresSafeArea()
    .overlay {
      Circle()
        .fill(CompanionTheme.accent.opacity(0.18))
        .frame(width: 280, height: 280)
        .blur(radius: 60)
        .offset(x: -90, y: -180)
      Circle()
        .fill(Color.indigo.opacity(0.22))
        .frame(width: 320, height: 320)
        .blur(radius: 70)
        .offset(x: 110, y: 220)
    }
  }
}

extension View {
  @ViewBuilder
  func companionGlassCard(cornerRadius: CGFloat = 20) -> some View {
    if #available(iOS 26, *) {
      self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
    } else {
      self.background(
        .ultraThinMaterial,
        in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
      )
    }
  }

  @ViewBuilder
  func companionGlassButton() -> some View {
    if #available(iOS 26, *) {
      self.glassEffect(.regular.interactive().tint(CompanionTheme.accent))
    } else {
      self.background(CompanionTheme.accent.opacity(0.25), in: Capsule())
    }
  }
}
