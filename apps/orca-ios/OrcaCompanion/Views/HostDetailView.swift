import SwiftUI

struct HostDetailView: View {
  @Environment(CompanionSession.self) private var session
  @Environment(\.dismiss) private var dismiss
  let host: HostProfile
  @State private var tabPeek: TabPeek?
  @State private var openTerminal: SessionTerminalTab?
  @State private var confirmRemove = false

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
          Button(role: .destructive) {
            confirmRemove = true
          } label: {
            Text("Remove host")
              .font(.headline)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 14)
          }
          .background(CompanionTheme.destructive.opacity(0.2), in: Capsule())
          .foregroundStyle(CompanionTheme.destructive)
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
        .accessibilityLabel("Reconnect")
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button(role: .destructive) {
          confirmRemove = true
        } label: {
          Image(systemName: "trash")
        }
        .accessibilityLabel("Remove host")
      }
    }
    .confirmationDialog(
      "Remove \(host.name)?",
      isPresented: $confirmRemove,
      titleVisibility: .visible
    ) {
      Button("Remove", role: .destructive) {
        session.removeHost(host.id)
        dismiss()
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Deletes the saved pairing token. You’ll need a fresh orca://pair link to reconnect.")
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
        .foregroundStyle(CompanionTheme.foreground)
      Text(host.endpoint)
        .font(.caption.monospaced())
        .foregroundStyle(CompanionTheme.mutedForeground)
      HStack {
        Label(hostStatus.label, systemImage: hostStatus.systemImage)
          .font(.caption)
          .foregroundStyle(CompanionTheme.foreground)
        Spacer()
        if session.connectionState == .connected {
          Button("Refresh") {
            Task { await session.refreshWorktrees() }
          }
          .font(.caption.weight(.semibold))
          .foregroundStyle(CompanionTheme.foreground)
        }
      }
      if let err = session.lastError {
        Text(err)
          .font(.footnote)
          .foregroundStyle(CompanionTheme.destructive)
      }
      if let compat = session.protocolCompat, compat != .ok {
        Text("Protocol: \(String(describing: compat))")
          .font(.footnote)
          .foregroundStyle(CompanionTheme.destructive)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .companionCard()
  }

  private var worktreeSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Worktrees")
        .font(.title3.weight(.semibold))
        .foregroundStyle(CompanionTheme.foreground)
      if session.worktrees.isEmpty {
        Text(session.connectionState == .connected ? "No worktrees yet." : "Connect to load worktrees.")
          .font(.subheadline)
          .foregroundStyle(CompanionTheme.mutedForeground)
          .padding(16)
          .frame(maxWidth: .infinity, alignment: .leading)
          .companionCard(cornerRadius: 12)
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
                  .foregroundStyle(CompanionTheme.foreground)
                Spacer()
                if wt.isActive {
                  Text("active")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(CompanionTheme.muted, in: Capsule())
                    .foregroundStyle(CompanionTheme.foreground)
                }
              }
              Text(wt.branch.isEmpty ? wt.repo : "\(wt.branch) · \(wt.repo)")
                .font(.caption)
                .foregroundStyle(CompanionTheme.mutedForeground)
                .lineLimit(1)
              if !wt.preview.isEmpty {
                Text(wt.preview)
                  .font(.caption2.monospaced())
                  .foregroundStyle(CompanionTheme.mutedForeground)
                  .lineLimit(2)
              }
              Text("\(wt.liveTerminalCount) live terminal\(wt.liveTerminalCount == 1 ? "" : "s")")
                .font(.caption2)
                .foregroundStyle(CompanionTheme.mutedForeground)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .companionCard(cornerRadius: 12)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}
