import Foundation
import Security

/// Minimal Keychain wrapper for pairing tokens (S1 will store device token + keys).
/// Why: WHEN_UNLOCKED_THIS_DEVICE_ONLY keeps pairing material off iCloud backups (matches Expo SecureStore intent).
final class KeychainStore: @unchecked Sendable {
  static let shared = KeychainStore()

  private let service = "dev.orca.companion.swift"

  private init() {}

  @discardableResult
  func smokeTest() -> Bool {
    let probeKey = "scaffold.smoke"
    let payload = Data("ok".utf8)
    do {
      try set(payload, forKey: probeKey)
      let read = try get(probeKey)
      try delete(probeKey)
      return read == payload
    } catch {
      return false
    }
  }

  func set(_ data: Data, forKey key: String) throws {
    try delete(key)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw KeychainError.unhandled(status)
    }
  }

  func get(_ key: String) throws -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    return item as? Data
  }

  func delete(_ key: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw KeychainError.unhandled(status)
    }
  }

  enum KeychainError: Error {
    case unhandled(OSStatus)
  }
}
