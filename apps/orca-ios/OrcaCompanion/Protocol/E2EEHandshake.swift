import Foundation

/// Client-side handshake state — mirrors mobile `rpc-client` sequence without owning the socket.
enum E2EEHandshakeState: Equatable {
  case idle
  case sentHello
  case awaitingAuthResult
  case authenticated
  case failed(String)
}

struct E2EEHandshake {
  let deviceToken: String
  let serverPublicKey: Bytes
  let ephemeral: E2EECrypto.KeyPair
  private(set) var sharedKey: Bytes?
  private(set) var state: E2EEHandshakeState = .idle

  init(deviceToken: String, serverPublicKeyB64: String) throws {
    guard let key = Data(base64Encoded: serverPublicKeyB64), key.count == 32 else {
      throw E2EEError.badKey
    }
    self.deviceToken = deviceToken
    self.serverPublicKey = Array(key)
    self.ephemeral = E2EECrypto.generateKeyPair()
  }

  /// Plaintext first message after WS open.
  mutating func makeHelloJSON() throws -> Data {
    let pubB64 = Data(ephemeral.publicKey).base64EncodedString()
    let obj: [String: Any] = ["type": "e2ee_hello", "publicKeyB64": pubB64]
    sharedKey = E2EECrypto.sharedKey(
      serverPublicKey: serverPublicKey,
      clientSecretKey: ephemeral.secretKey
    )
    guard sharedKey != nil else { throw E2EEError.badKey }
    state = .sentHello
    return try JSONSerialization.data(withJSONObject: obj)
  }

  /// Handle a plaintext WS text frame during handshake.
  /// Returns nil for non-JSON (encrypted base64) so the caller can try decrypt.
  mutating func handlePlaintext(_ text: String) throws -> String? {
    guard let data = text.data(using: .utf8),
          let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let type = obj["type"] as? String
    else {
      return nil
    }
    if type == "e2ee_ready" {
      guard let sharedKey else { throw E2EEError.badKey }
      state = .awaitingAuthResult
      return try E2EECrypto.encryptTextJSON(
        ["type": "e2ee_auth", "deviceToken": deviceToken],
        sharedKey: sharedKey
      )
    }
    return nil
  }

  /// Handle an encrypted text frame during handshake / connected auth result.
  mutating func handleEncryptedText(_ base64: String) throws {
    guard let sharedKey else { throw E2EEError.badKey }
    let obj = try E2EECrypto.decryptTextJSON(base64, sharedKey: sharedKey)
    let type = obj["type"] as? String
    if type == "e2ee_authenticated" {
      state = .authenticated
      return
    }
    if type == "e2ee_error" {
      let code = (obj["error"] as? [String: Any])?["code"] as? String ?? "error"
      state = .failed(code)
      return
    }
  }
}
