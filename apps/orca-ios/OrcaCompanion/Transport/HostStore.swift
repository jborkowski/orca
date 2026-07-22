import Foundation

protocol HostMetadataStore: AnyObject {
  func readHostsJSON() throws -> Data?
  func writeHostsJSON(_ data: Data) throws
}

protocol HostTokenStore: AnyObject {
  func readToken(hostId: String) throws -> String?
  func writeToken(_ token: String, hostId: String) throws
  func deleteToken(hostId: String) throws
}

/// UserDefaults-backed host metadata list.
final class UserDefaultsHostMetadataStore: HostMetadataStore {
  private let defaults: UserDefaults
  private let key: String

  init(defaults: UserDefaults = .standard, key: String = "orca.hosts") {
    self.defaults = defaults
    self.key = key
  }

  func readHostsJSON() throws -> Data? {
    defaults.data(forKey: key)
  }

  func writeHostsJSON(_ data: Data) throws {
    defaults.set(data, forKey: key)
  }
}

/// Keychain-backed per-host device tokens (`orca.host-token.<id>`).
final class KeychainHostTokenStore: HostTokenStore {
  private let keychain: KeychainStore
  private let prefix = "orca.host-token."

  init(keychain: KeychainStore = .shared) {
    self.keychain = keychain
  }

  func readToken(hostId: String) throws -> String? {
    guard let data = try keychain.get(prefix + hostId) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func writeToken(_ token: String, hostId: String) throws {
    try keychain.set(Data(token.utf8), forKey: prefix + hostId)
  }

  func deleteToken(hostId: String) throws {
    try keychain.delete(prefix + hostId)
  }
}

/// In-memory metadata — unit tests only.
final class InMemoryHostMetadataStore: HostMetadataStore {
  var blob: Data?

  func readHostsJSON() throws -> Data? { blob }
  func writeHostsJSON(_ data: Data) throws { blob = data }
}

/// In-memory tokens — unit tests only.
final class InMemoryHostTokenStore: HostTokenStore {
  private var tokens: [String: String] = [:]

  func readToken(hostId: String) throws -> String? { tokens[hostId] }
  func writeToken(_ token: String, hostId: String) throws { tokens[hostId] = token }
  func deleteToken(hostId: String) throws { tokens.removeValue(forKey: hostId) }
}

/// Persists paired hosts. Metadata first, then Keychain token (same crash order as Expo).
final class HostStore {
  private let metadata: HostMetadataStore
  private let tokens: HostTokenStore
  private let lock = NSLock()
  private var tokenCache: [String: String] = [:]

  init(metadata: HostMetadataStore, tokens: HostTokenStore) {
    self.metadata = metadata
    self.tokens = tokens
  }

  static func live() -> HostStore {
    HostStore(metadata: UserDefaultsHostMetadataStore(), tokens: KeychainHostTokenStore())
  }

  func loadHosts() throws -> [HostProfile] {
    lock.lock()
    defer { lock.unlock() }
    let stored = try readStoredLocked()
    var out: [HostProfile] = []
    for item in stored {
      let token: String
      if let cached = tokenCache[item.id] {
        token = cached
      } else if let fetched = try tokens.readToken(hostId: item.id) {
        tokenCache[item.id] = fetched
        token = fetched
      } else {
        // Orphaned metadata — skip rather than surface a half-broken host.
        continue
      }
      out.append(item.withToken(token))
    }
    return out
  }

  func saveHost(_ host: HostProfile) throws {
    lock.lock()
    defer { lock.unlock() }
    var stored = try readStoredLocked()
    let next = StoredHostProfile(from: host)
    if let index = stored.firstIndex(where: { $0.id == next.id }) {
      stored[index] = next
    } else {
      stored.append(next)
    }
    // Why: metadata before token — crash leaves orphan metadata (skipped on load), not orphan Keychain.
    try writeStoredLocked(stored)
    try tokens.writeToken(host.deviceToken, hostId: host.id)
    tokenCache[host.id] = host.deviceToken
  }

  func removeHost(id: String) throws {
    lock.lock()
    defer { lock.unlock() }
    var stored = try readStoredLocked()
    stored.removeAll { $0.id == id }
    try writeStoredLocked(stored)
    tokenCache.removeValue(forKey: id)
    try? tokens.deleteToken(hostId: id)
  }

  func renameHost(id: String, name: String) throws {
    lock.lock()
    defer { lock.unlock() }
    var stored = try readStoredLocked()
    guard let index = stored.firstIndex(where: { $0.id == id }) else { return }
    stored[index].name = name
    try writeStoredLocked(stored)
  }

  func updateLastConnected(id: String, at time: TimeInterval = Date().timeIntervalSince1970 * 1000) throws {
    lock.lock()
    defer { lock.unlock() }
    var stored = try readStoredLocked()
    guard let index = stored.firstIndex(where: { $0.id == id }) else { return }
    stored[index].lastConnected = time
    try writeStoredLocked(stored)
  }

  func promoteEndpoint(id: String, endpoint: String) throws {
    lock.lock()
    defer { lock.unlock() }
    var stored = try readStoredLocked()
    guard let index = stored.firstIndex(where: { $0.id == id }) else { return }
    var host = stored[index]
    if host.endpoint == endpoint { return }
    host.endpoints = Array(Set([endpoint] + host.endpoints + [host.endpoint]))
    host.endpoint = endpoint
    stored[index] = host
    try writeStoredLocked(stored)
  }

  private func readStoredLocked() throws -> [StoredHostProfile] {
    guard let data = try metadata.readHostsJSON() else { return [] }
    let decoded = try JSONDecoder().decode([StoredHostProfile].self, from: data)
    // Drop legacy records that baked deviceToken into metadata JSON.
    return decoded
  }

  private func writeStoredLocked(_ hosts: [StoredHostProfile]) throws {
    let data = try JSONEncoder().encode(hosts)
    try metadata.writeHostsJSON(data)
  }
}
