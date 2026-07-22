import SwiftUI

/// Quiet monochrome chrome aligned with Orca dark tokens (`main.css` `.dark`).
/// Why: the prior cyan/indigo glass gradient made text unreadable on device.
enum CompanionTheme {
  static let background = Color(red: 0.039, green: 0.039, blue: 0.039) // #0a0a0a
  static let foreground = Color(red: 0.980, green: 0.980, blue: 0.980) // #fafafa
  static let card = Color(red: 0.090, green: 0.090, blue: 0.090) // #171717
  static let muted = Color(red: 0.149, green: 0.149, blue: 0.149) // #262626
  static let mutedForeground = Color(red: 0.639, green: 0.639, blue: 0.639) // #a3a3a3
  static let border = Color(red: 0.227, green: 0.227, blue: 0.227) // #3a3a3a
  static let primary = Color(red: 0.898, green: 0.898, blue: 0.898) // #e5e5e5
  static let primaryForeground = Color(red: 0.090, green: 0.090, blue: 0.090) // #171717
  static let destructive = Color(red: 0.937, green: 0.267, blue: 0.267)
}

struct CompanionBackdrop: View {
  var body: some View {
    CompanionTheme.background.ignoresSafeArea()
  }
}

extension View {
  func companionCard(cornerRadius: CGFloat = 12) -> some View {
    self
      .background(CompanionTheme.card, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(CompanionTheme.border, lineWidth: 1)
      )
  }

  func companionPrimaryButton() -> some View {
    self
      .foregroundStyle(CompanionTheme.primaryForeground)
      .background(CompanionTheme.primary, in: Capsule())
  }

  /// Back-compat name used across views — solid card, not glass.
  func companionGlassCard(cornerRadius: CGFloat = 12) -> some View {
    companionCard(cornerRadius: cornerRadius)
  }

  /// Back-compat name used across views — solid primary pill, not cyan glass.
  func companionGlassButton() -> some View {
    companionPrimaryButton()
  }
}
