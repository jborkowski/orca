import Foundation

/// Mirror of `src/shared/remote-runtime-tailscale-hint.ts` `isTailscaleEndpoint`.
enum HostEndpointOrdering {
  /// Why: companion is a remote/power client — prefer Tailscale so leaving home
  /// does not stick on a promoted LAN IP that only works on the same Wi‑Fi.
  static func orderedCandidates(
    primary: String,
    extras: [String],
    preferTailscale: Bool = true
  ) -> [String] {
    var seen = Set<String>()
    var raw: [String] = []
    for item in [primary] + extras {
      let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, seen.insert(trimmed).inserted else { continue }
      raw.append(trimmed)
    }
    guard preferTailscale else { return raw }
    let tailscale = raw.filter { isTailscaleEndpoint($0) }
    let other = raw.filter { !isTailscaleEndpoint($0) }
    return tailscale + other
  }

  /// Short timeout for LAN probes when a Tailscale candidate remains.
  static func connectTimeoutMs(for endpoint: String, remainingIncludesTailscale: Bool) -> Int {
    if isTailscaleEndpoint(endpoint) { return 20_000 }
    return remainingIncludesTailscale ? 3_000 : 20_000
  }

  static func isTailscaleEndpoint(_ endpoint: String) -> Bool {
    guard let host = extractHost(endpoint)?.lowercased() else { return false }
    if host == "ts.net" || host.hasSuffix(".ts.net") { return true }
    if isTailscaleCGNAT(host) { return true }
    if host.hasPrefix("fd7a:115c:a1e0:") { return true }
    return false
  }

  private static func isTailscaleCGNAT(_ host: String) -> Bool {
    let parts = host.split(separator: ".").map(String.init)
    guard parts.count == 4,
          let a = Int(parts[0]), a == 100,
          let b = Int(parts[1]), (64...127).contains(b),
          let c = Int(parts[2]), (0...255).contains(c),
          let d = Int(parts[3]), (0...255).contains(d)
    else { return false }
    return true
  }

  private static func extractHost(_ endpoint: String) -> String? {
    if let url = URL(string: endpoint), let host = url.host, !host.isEmpty {
      return normalizeHost(host)
    }
    var stripped = endpoint
    if let range = stripped.range(of: "://") {
      stripped = String(stripped[range.upperBound...])
    }
    let end = stripped.firstIndex(where: { ":/?#".contains($0) }) ?? stripped.endIndex
    return normalizeHost(String(stripped[..<end]))
  }

  private static func normalizeHost(_ host: String) -> String {
    var h = host
    if h.hasPrefix("["), h.hasSuffix("]") {
      h.removeFirst()
      h.removeLast()
    }
    while h.hasSuffix(".") { h.removeLast() }
    return h
  }
}
