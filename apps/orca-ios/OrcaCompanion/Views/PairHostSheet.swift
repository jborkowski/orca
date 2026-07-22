import SwiftUI

struct PairHostSheet: View {
  @Environment(CompanionSession.self) private var session
  @Environment(\.dismiss) private var dismiss

  @State private var rawOffer = ""
  @State private var hostName = ""
  @State private var errorText: String?
  @State private var busy = false

  var body: some View {
    NavigationStack {
      ZStack {
        CompanionBackdrop()
        VStack(alignment: .leading, spacing: 16) {
          Text("Paste an `orca://pair?code=…` link from the desktop QR / pair sheet.")
            .font(.subheadline)
            .foregroundStyle(CompanionTheme.mutedForeground)

          TextField("Host name (optional)", text: $hostName)
            .textInputAutocapitalization(.words)
            .foregroundStyle(CompanionTheme.foreground)
            .padding(14)
            .companionCard(cornerRadius: 14)

          TextField("Pairing URL or code", text: $rawOffer, axis: .vertical)
            .lineLimit(4...8)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .foregroundStyle(CompanionTheme.foreground)
            .padding(14)
            .companionCard(cornerRadius: 14)

          if let errorText {
            Text(errorText)
              .font(.footnote)
              .foregroundStyle(CompanionTheme.destructive)
          }

          Button {
            Task { await save() }
          } label: {
            Text(busy ? "Saving…" : "Save host")
              .font(.headline)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 14)
          }
          .disabled(busy || rawOffer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          .companionPrimaryButton()

          Spacer()
        }
        .padding(20)
      }
      .navigationTitle("Pair host")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }

  private func save() async {
    busy = true
    errorText = nil
    defer { busy = false }
    do {
      let host = try session.pair(
        from: rawOffer,
        name: hostName.isEmpty ? nil : hostName
      )
      dismiss()
      await session.connect(to: host)
    } catch {
      errorText = error.localizedDescription
    }
  }
}
