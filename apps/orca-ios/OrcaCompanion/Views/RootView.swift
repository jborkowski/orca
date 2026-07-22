import SwiftUI

/// Host list → pair → connect → worktrees.
struct RootView: View {
  // Why: session lives on `OrcaCompanionApp` so scenePhase can flip attach role.
  @Environment(CompanionSession.self) private var session
  @State private var showPair = false
  @State private var hostPendingRemoval: HostProfile?
  @State private var keychainOK = KeychainStore.shared.smokeTest()

  var body: some View {
    NavigationStack {
      ZStack {
        CompanionBackdrop()
        content
      }
      .navigationTitle("Orca")
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button {
            showPair = true
          } label: {
            Image(systemName: "qrcode.viewfinder")
          }
          .accessibilityLabel("Pair host")
        }
      }
      .sheet(isPresented: $showPair) {
        PairHostSheet()
          .environment(session)
      }
      .confirmationDialog(
        "Remove \(hostPendingRemoval?.name ?? "host")?",
        isPresented: Binding(
          get: { hostPendingRemoval != nil },
          set: { if !$0 { hostPendingRemoval = nil } }
        ),
        titleVisibility: .visible
      ) {
        Button("Remove", role: .destructive) {
          if let id = hostPendingRemoval?.id {
            session.removeHost(id)
          }
          hostPendingRemoval = nil
        }
        Button("Cancel", role: .cancel) {
          hostPendingRemoval = nil
        }
      } message: {
        Text("Deletes the saved pairing token. You’ll need a fresh orca://pair link to reconnect.")
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    if session.hosts.isEmpty {
      emptyState
    } else {
      List {
        Section {
          metaStrip
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 4, bottom: 4, trailing: 4))
        }
        Section {
          ForEach(session.hosts, id: \.id) { host in
            NavigationLink(value: host.id) {
              hostRowLabel(host)
            }
            .listRowBackground(CompanionTheme.card)
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
              Button(role: .destructive) {
                hostPendingRemoval = host
              } label: {
                Label("Remove", systemImage: "trash")
              }
            }
            .contextMenu {
              Button("Connect") {
                Task { await session.connect(to: host) }
              }
              Button("Remove", role: .destructive) {
                hostPendingRemoval = host
              }
            }
          }
        }
      }
      .scrollContentBackground(.hidden)
      .listStyle(.insetGrouped)
      .padding(.top, 4)
      .navigationDestination(for: String.self) { hostId in
        if let host = session.hosts.first(where: { $0.id == hostId }) {
          HostDetailView(host: host)
        }
      }
    }
  }

  private var metaStrip: some View {
    HStack {
      Label(keychainOK ? "Keychain ok" : "Keychain fail", systemImage: "key.fill")
      Spacer()
      Text("v\(ProtocolVersion.clientVersion)")
        .font(.caption.monospaced())
    }
    .font(.caption)
    .foregroundStyle(CompanionTheme.mutedForeground)
  }

  private func hostRowLabel(_ host: HostProfile) -> some View {
    let status = session.status(for: host.id)
    return HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 6) {
        Text(host.name)
          .font(.headline)
          .foregroundStyle(CompanionTheme.foreground)
        Text(host.endpoint)
          .font(.caption.monospaced())
          .foregroundStyle(CompanionTheme.mutedForeground)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Label(status.label, systemImage: status.systemImage)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(statusTint(status))
        .labelStyle(.titleAndIcon)
    }
    .padding(.vertical, 4)
  }

  private func statusTint(_ status: HostRuntimeStatus) -> Color {
    switch status {
    case .connected: return .green
    case .parked: return .orange
    case .incompatible: return .red
    case .idle: return CompanionTheme.mutedForeground
    }
  }

  private var emptyState: some View {
    VStack(spacing: 18) {
      Spacer()
      Text("Orca")
        .font(.system(size: 44, weight: .bold, design: .rounded))
        .foregroundStyle(CompanionTheme.foreground)
      Text("Pair your desktop to open worktrees on this phone — Expo stays the daily driver.")
        .font(.subheadline)
        .foregroundStyle(CompanionTheme.mutedForeground)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 28)
      Button {
        showPair = true
      } label: {
        Text("Pair host")
          .font(.headline)
          .padding(.horizontal, 28)
          .padding(.vertical, 14)
      }
      .companionPrimaryButton()
      Spacer()
    }
  }
}

#Preview {
  RootView()
    .environment(CompanionSession())
}
