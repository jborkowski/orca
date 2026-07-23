import SwiftUI
import UIKit

/// Chrome colors from Orca `main.css` (`:root` light / `.dark`).
/// Follows the system appearance — do not force `.preferredColorScheme`.
enum CompanionTheme {
  static let background = adaptive(light: 0xFFFFFF, dark: 0x0A0A0A)
  static let foreground = adaptive(light: 0x0A0A0A, dark: 0xFAFAFA)
  static let card = adaptive(light: 0xFFFFFF, dark: 0x171717)
  static let muted = adaptive(light: 0xF5F5F5, dark: 0x262626)
  static let mutedForeground = adaptive(light: 0x737373, dark: 0xA3A3A3)
  static let border = adaptive(light: 0xE5E5E5, dark: 0x3A3A3A)
  static let primary = adaptive(light: 0x171717, dark: 0xE5E5E5)
  static let primaryForeground = adaptive(light: 0xFAFAFA, dark: 0x171717)
  static let destructive = Color(uiColor: UIColor(rgb: 0xE40014))

  /// Metal / UIKit terminal chrome (letterbox + empty drawable).
  static func terminalSurfaceUIColor(style: UIUserInterfaceStyle) -> UIColor {
    style == .dark ? UIColor(rgb: 0x0A0A0A) : UIColor(rgb: 0xFFFFFF)
  }

  private static func adaptive(light: UInt32, dark: UInt32) -> Color {
    Color(
      uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
          ? UIColor(rgb: dark)
          : UIColor(rgb: light)
      }
    )
  }
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

extension UIColor {
  convenience init(rgb: UInt32) {
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
