import SwiftUI

/// First usable shell: liquid-glass host list → pair → connect → worktrees.
struct RootView: View {
  // Why: session lives on `OrcaCompanionApp` so scenePhase can flip attach role.
  @Environment(CompanionSession.self) private var session
  @State private var showPair = false
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
        }
      }
      .sheet(isPresented: $showPair) {
        PairHostSheet()
          .environment(session)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    if session.hosts.isEmpty {
      emptyState
    } else {
      ScrollView {
        LazyVStack(spacing: 12) {
          metaStrip
          ForEach(session.hosts, id: \.id) { host in
            NavigationLink(value: host.id) {
              hostRow(host)
            }
            .buttonStyle(.plain)
            .contextMenu {
              Button("Connect") {
                Task { await session.connect(to: host) }
              }
              Button("Remove", role: .destructive) {
                session.removeHost(host.id)
              }
            }
          }
        }
        .padding(20)
      }
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
    .foregroundStyle(.secondary)
    .padding(.horizontal, 4)
  }

  private func hostRow(_ host: HostProfile) -> some View {
    let status = session.status(for: host.id)
    return HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 6) {
        Text(host.name)
          .font(.headline)
        Text(host.endpoint)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Label(status.label, systemImage: status.systemImage)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(statusTint(status))
        .labelStyle(.titleAndIcon)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .companionGlassCard()
  }

  private func statusTint(_ status: HostRuntimeStatus) -> Color {
    switch status {
    case .connected: return .green
    case .parked: return .orange
    case .incompatible: return .red
    case .idle: return .secondary
    }
  }

  private var emptyState: some View {
    VStack(spacing: 18) {
      Spacer()
      Text("Orca")
        .font(.system(size: 44, weight: .bold, design: .rounded))
      Text("Pair your desktop to open worktrees on this phone — Expo stays the daily driver.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
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
      .companionGlassButton()
      Spacer()
    }
  }
}

#Preview {
  RootView()
    .environment(CompanionSession())
}
