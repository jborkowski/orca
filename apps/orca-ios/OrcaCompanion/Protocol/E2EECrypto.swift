import Foundation
import Sodium

/// NaCl box.after framing — mirrors `src/shared/e2ee-crypto.ts` / `mobile/src/transport/e2ee.ts`.
enum E2EECrypto {
  static let nonceLength = 24
  static let overheadLength = 16

  struct KeyPair {
    let publicKey: Bytes
    let secretKey: Bytes
  }

  static func generateKeyPair() -> KeyPair {
    let sodium = Sodium()
    let kp = sodium.box.keyPair()!
    return KeyPair(publicKey: kp.publicKey, secretKey: kp.secretKey)
  }

  /// `nacl.box.before(serverPublic, clientSecret)`
  static func sharedKey(serverPublicKey: Bytes, clientSecretKey: Bytes) -> Bytes? {
    let sodium = Sodium()
    return sodium.box.beforenm(recipientPublicKey: serverPublicKey, senderSecretKey: clientSecretKey)
  }

  /// Bundle = nonce(24) || ciphertext(+16 tag). Text frames base64-encode the bundle.
  /// Uses libsodium beforenm seal which prepends a fresh nonce (same layout as Orca JS).
  static func encrypt(_ plaintext: Data, sharedKey: Bytes) -> Data? {
    let sodium = Sodium()
    // Disambiguate overloads: the Bytes?-returning seal prepends a 24-byte nonce.
    let sealed: Bytes? = sodium.box.seal(message: Array(plaintext), beforenm: sharedKey)
    guard let bundle = sealed else { return nil }
    return Data(bundle)
  }

  static func decrypt(_ bundle: Data, sharedKey: Bytes) -> Data? {
    guard bundle.count >= nonceLength + overheadLength else { return nil }
    let sodium = Sodium()
    guard let plain = sodium.box.open(
      nonceAndAuthenticatedCipherText: Array(bundle),
      beforenm: sharedKey
    ) else { return nil }
    return Data(plain)
  }

  static func encryptTextJSON(_ object: [String: Any], sharedKey: Bytes) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: object)
    guard let bundle = encrypt(data, sharedKey: sharedKey) else {
      throw E2EEError.encryptFailed
    }
    return bundle.base64EncodedString()
  }

  static func decryptTextJSON(_ base64: String, sharedKey: Bytes) throws -> [String: Any] {
    guard let bundle = Data(base64Encoded: base64),
          let plain = decrypt(bundle, sharedKey: sharedKey),
          let obj = try JSONSerialization.jsonObject(with: plain) as? [String: Any]
    else {
      throw E2EEError.decryptFailed
    }
    return obj
  }
}

enum E2EEError: Error {
  case encryptFailed
  case decryptFailed
  case badKey
}

typealias Bytes = [UInt8]
