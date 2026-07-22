import SwiftUI

struct HostDetailView: View {
  @Environment(CompanionSession.self) private var session
  let host: HostProfile
  @State private var tabPeek: TabPeek?
  @State private var openTerminal: SessionTerminalTab?

  private struct TabPeek: Identifiable {
    var id: String { worktreeId }
    var worktreeId: String
    var title: String
    var tabs: [SessionTerminalTab]
  }

  var body: some View {
    ZStack {
      CompanionBackdrop()
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          connectionCard
          worktreeSection
        }
        .padding(20)
      }
    }
    .navigationTitle(host.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          Task { await session.connect(to: host) }
        } label: {
          Image(systemName: "arrow.triangle.2.circlepath")
        }
      }
    }
    .task {
      // Why: switching hosts must reconnect even if another host is already connected.
      if session.activeHostId != host.id || session.connectionState != .connected {
        await session.connect(to: host)
      }
    }
    .sheet(item: $tabPeek) { peek in
      NavigationStack {
        ZStack {
          CompanionBackdrop()
          List {
            if peek.tabs.isEmpty {
              Button("Create terminal") {
                Task {
                  if let created = await session.createTerminal(worktreeId: peek.worktreeId) {
                    tabPeek = nil
                    openTerminal = created
                  }
                }
              }
            } else {
              ForEach(peek.tabs) { tab in
                Button(tab.title) {
                  tabPeek = nil
                  openTerminal = tab
                }
              }
            }
          }
          .scrollContentBackground(.hidden)
        }
        .navigationTitle(peek.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Close") { tabPeek = nil }
          }
        }
      }
      .presentationDetents([.medium, .large])
    }
    .navigationDestination(item: $openTerminal) { tab in
      // Why: identity forces unmount of the previous pane so the mount gate
      // tears down terminal.subscribe before the next interactive stream.
      TerminalPaneView(tab: tab)
        .id(tab.id)
    }
  }

  private var connectionCard: some View {
    let hostStatus = session.status(for: host.id)
    return VStack(alignment: .leading, spacing: 8) {
      Text(session.statusLine)
        .font(.headline)
      Text(host.endpoint)
        .font(.caption.monospaced())
        .foregroundStyle(.secondary)
      HStack {
        Label(hostStatus.label, systemImage: hostStatus.systemImage)
          .font(.caption)
        Spacer()
        if session.connectionState == .connected {
          Button("Refresh") {
            Task { await session.refreshWorktrees() }
          }
          .font(.caption.weight(.semibold))
        }
      }
      if let err = session.lastError {
        Text(err)
          .font(.footnote)
          .foregroundStyle(.orange)
      }
      if let compat = session.protocolCompat, compat != .ok {
        Text("Protocol: \(String(describing: compat))")
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .companionGlassCard()
  }

  private var worktreeSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Worktrees")
        .font(.title3.weight(.semibold))
      if session.worktrees.isEmpty {
        Text(session.connectionState == .connected ? "No worktrees yet." : "Connect to load worktrees.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .padding(16)
          .frame(maxWidth: .infinity, alignment: .leading)
          .companionGlassCard(cornerRadius: 16)
      } else {
        ForEach(session.worktrees) { wt in
          Button {
            Task {
              await session.activateWorktree(wt)
              let tabs = await session.listTabs(worktreeId: wt.worktreeId)
              tabPeek = TabPeek(worktreeId: wt.worktreeId, title: wt.displayName, tabs: tabs)
            }
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Text(wt.displayName)
                  .font(.headline)
                  .foregroundStyle(.primary)
                Spacer()
                if wt.isActive {
                  Text("active")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(CompanionTheme.accent.opacity(0.25), in: Capsule())
                }
              }
              Text(wt.branch.isEmpty ? wt.repo : "\(wt.branch) · \(wt.repo)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
              if !wt.preview.isEmpty {
                Text(wt.preview)
                  .font(.caption2.monospaced())
                  .foregroundStyle(.secondary)
                  .lineLimit(2)
              }
              Text("\(wt.liveTerminalCount) live terminal\(wt.liveTerminalCount == 1 ? "" : "s")")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .companionGlassCard(cornerRadius: 16)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}
