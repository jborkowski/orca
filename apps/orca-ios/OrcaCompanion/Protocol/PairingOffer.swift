import Foundation

/// Pairing offer version 2 — mirrors `src/shared/pairing.ts` / mobile `PairingOfferSchema`.
struct PairingOffer: Equatable, Sendable {
  static let version = 2

  var endpoint: String
  var endpoints: [String]
  var deviceToken: String
  /// Standard base64 of the desktop's static Curve25519 public key (32 bytes).
  var publicKeyB64: String
  var scope: String?

  var candidateEndpoints: [String] {
    var seen = Set<String>()
    var out: [String] = []
    for item in [endpoint] + endpoints {
      if seen.insert(item).inserted {
        out.append(item)
      }
    }
    return out
  }
}

enum PairingOfferError: Error, Equatable, LocalizedError {
  case invalidURL
  case missingCode
  case invalidBase64
  case invalidJSON
  case unsupportedVersion(Int)
  case missingField(String)
  case invalidPublicKey

  var errorDescription: String? {
    switch self {
    case .invalidURL: return "Not a valid orca://pair URL"
    case .missingCode: return "Pairing URL is missing a code"
    case .invalidBase64: return "Pairing code is not valid base64"
    case .invalidJSON: return "Pairing code is not valid JSON"
    case .unsupportedVersion(let v): return "Unsupported pairing version \(v)"
    case .missingField(let f): return "Pairing offer missing \(f)"
    case .invalidPublicKey: return "Pairing public key must be 32 bytes"
    }
  }
}

enum PairingOfferParser {
  /// Accepts `orca://pair?code=…`, `orca://pair#…`, or a bare base64url JSON blob.
  static func parse(_ raw: String) throws -> PairingOffer {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let code: String
    if trimmed.lowercased().hasPrefix("orca://") {
      code = try extractCode(from: trimmed)
    } else {
      code = trimmed
    }
    return try decodeOfferJSON(fromBase64URL: code)
  }

  private static func extractCode(from urlString: String) throws -> String {
    guard let url = URL(string: urlString) else { throw PairingOfferError.invalidURL }
    let host = (url.host ?? "").lowercased()
    guard host == "pair" else { throw PairingOfferError.invalidURL }

    if let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
       let queryCode = items.first(where: { $0.name == "code" })?.value,
       !queryCode.isEmpty
    {
      return queryCode
    }
    if let fragment = url.fragment, !fragment.isEmpty {
      return fragment
    }
    throw PairingOfferError.missingCode
  }

  private static func decodeOfferJSON(fromBase64URL code: String) throws -> PairingOffer {
    guard let data = Data(orcaBase64URLEncoded: code) else {
      throw PairingOfferError.invalidBase64
    }
    guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw PairingOfferError.invalidJSON
    }
    let version = obj["v"] as? Int ?? -1
    guard version == PairingOffer.version else {
      throw PairingOfferError.unsupportedVersion(version)
    }
    guard let endpoint = obj["endpoint"] as? String, !endpoint.isEmpty else {
      throw PairingOfferError.missingField("endpoint")
    }
    guard let deviceToken = obj["deviceToken"] as? String, !deviceToken.isEmpty else {
      throw PairingOfferError.missingField("deviceToken")
    }
    guard let publicKeyB64 = obj["publicKeyB64"] as? String, !publicKeyB64.isEmpty else {
      throw PairingOfferError.missingField("publicKeyB64")
    }
    guard let keyData = Data(base64Encoded: publicKeyB64), keyData.count == 32 else {
      throw PairingOfferError.invalidPublicKey
    }
    let endpoints = (obj["endpoints"] as? [String]) ?? []
    let scope = obj["scope"] as? String
    return PairingOffer(
      endpoint: endpoint,
      endpoints: endpoints,
      deviceToken: deviceToken,
      publicKeyB64: publicKeyB64,
      scope: scope
    )
  }
}

extension Data {
  /// Decode base64url (`-`/`_`, optional padding) the same way mobile `padBase64` does.
  init?(orcaBase64URLEncoded string: String) {
    var s = string
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let pad = (4 - (s.count % 4)) % 4
    if pad > 0 {
      s += String(repeating: "=", count: pad)
    }
    self.init(base64Encoded: s)
  }

  func orcaBase64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
