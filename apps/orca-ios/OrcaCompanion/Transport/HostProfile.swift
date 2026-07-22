import Foundation

/// Full in-memory host — mirrors `mobile/src/transport/types.ts` `HostProfile`.
struct HostProfile: Equatable, Sendable, Codable {
  var id: String
  var name: String
  var endpoint: String
  var endpoints: [String]
  var deviceToken: String
  var publicKeyB64: String
  var lastConnected: TimeInterval

  var candidateEndpoints: [String] {
    HostEndpointOrdering.orderedCandidates(
      primary: endpoint,
      extras: endpoints,
      preferTailscale: true
    )
  }

  static func fromPairing(_ offer: PairingOffer, name: String, id: String = UUID().uuidString) -> HostProfile {
    HostProfile(
      id: id,
      name: name,
      endpoint: offer.endpoint,
      endpoints: offer.endpoints,
      deviceToken: offer.deviceToken,
      publicKeyB64: offer.publicKeyB64,
      lastConnected: 0
    )
  }
}

/// Durable metadata without the pairing token — mirrors `StoredHostProfile`.
/// Why: deviceToken stays in Keychain (WHEN_UNLOCKED_THIS_DEVICE_ONLY); metadata can live in app defaults.
struct StoredHostProfile: Equatable, Sendable, Codable {
  var id: String
  var name: String
  var endpoint: String
  var endpoints: [String]
  var publicKeyB64: String
  var lastConnected: TimeInterval

  init(from host: HostProfile) {
    id = host.id
    name = host.name
    endpoint = host.endpoint
    endpoints = Array(Set([host.endpoint] + host.endpoints))
    publicKeyB64 = host.publicKeyB64
    lastConnected = host.lastConnected
  }

  func withToken(_ token: String) -> HostProfile {
    HostProfile(
      id: id,
      name: name,
      endpoint: endpoint,
      endpoints: endpoints,
      deviceToken: token,
      publicKeyB64: publicKeyB64,
      lastConnected: lastConnected
    )
  }
}
