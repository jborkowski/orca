import Foundation
import Network

protocol WebSocketChannel: AnyObject {
  var onOpen: (() -> Void)? { get set }
  var onText: ((String) -> Void)? { get set }
  var onBinary: ((Data) -> Void)? { get set }
  var onClose: ((Error?) -> Void)? { get set }
  func connect()
  func sendText(_ text: String) throws
  func close()
}

enum WebSocketChannelError: Error, LocalizedError {
  case notOpen
  case badURL
  case sendFailed(String)
  case connectFailed(String)

  var errorDescription: String? {
    switch self {
    case .notOpen: return "WebSocket is not open yet"
    case .badURL: return "Invalid WebSocket URL"
    case .sendFailed(let message), .connectFailed(let message): return message
    }
  }
}

/// Live `ws://` / `wss://` client for Orca serve via Network.framework.
/// Why: URLSessionWebSocket often never reaches `.open` on Tailscale CGNAT;
/// NWConnection is the same cleartext path Expo's RN WebSocket uses successfully.
final class NWWebSocketChannel: WebSocketChannel {
  var onOpen: (() -> Void)?
  var onText: ((String) -> Void)?
  var onBinary: ((Data) -> Void)?
  var onClose: ((Error?) -> Void)?

  private let url: URL
  private let queue = DispatchQueue(label: "dev.orca.companion.ws")
  private var connection: NWConnection?
  private var generation = 0
  private var opened = false
  private var closeReported = true

  init(url: URL) {
    self.url = url
  }

  func connect() {
    queue.async { self.startLocked() }
  }

  func sendText(_ text: String) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var sendError: Error?

    queue.async {
      guard self.opened, let connection = self.connection else {
        sendError = WebSocketChannelError.notOpen
        semaphore.signal()
        return
      }
      let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
      let context = NWConnection.ContentContext(identifier: "text", metadata: [metadata])
      connection.send(
        content: Data(text.utf8),
        contentContext: context,
        isComplete: true,
        completion: .contentProcessed { error in
          if let error {
            sendError = WebSocketChannelError.sendFailed(error.localizedDescription)
          }
          semaphore.signal()
        }
      )
    }

    if semaphore.wait(timeout: .now() + 15) == .timedOut {
      throw WebSocketChannelError.sendFailed("WebSocket send timed out")
    }
    if let sendError { throw sendError }
  }

  func close() {
    queue.async {
      self.finishLocked(error: nil)
    }
  }

  private func startLocked() {
    finishLocked(error: nil, notify: false)
    closeReported = false
    opened = false
    generation += 1
    let generation = self.generation

    guard let scheme = url.scheme?.lowercased(), scheme == "ws" || scheme == "wss",
          url.host != nil, !url.host!.isEmpty
    else {
      finishLocked(error: WebSocketChannelError.badURL, generation: generation)
      return
    }

    let ws = NWProtocolWebSocket.Options()
    ws.autoReplyPing = true
    ws.maximumMessageSize = 16 * 1024 * 1024

    let tcp = NWProtocolTCP.Options()
    // Why: Tailscale CGNAT can take several seconds; keep TCP open long enough.
    tcp.connectionTimeout = 20
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 30

    let parameters: NWParameters
    if scheme == "wss" {
      parameters = NWParameters(tls: NWProtocolTLS.Options(), tcp: tcp)
    } else {
      parameters = NWParameters(tls: nil, tcp: tcp)
    }
    parameters.defaultProtocolStack.applicationProtocols.insert(ws, at: 0)
    parameters.includePeerToPeer = true

    // Why: URL endpoint carries path/query for the WS upgrade; host:port alone
    // can handshake to the wrong resource on some serve setups.
    let connection = NWConnection(to: .url(url), using: parameters)
    self.connection = connection
    connection.stateUpdateHandler = { [weak self] state in
      self?.queue.async { self?.onStateLocked(state, generation: generation) }
    }
    connection.start(queue: queue)
  }

  private func onStateLocked(_ state: NWConnection.State, generation: Int) {
    guard self.generation == generation else { return }
    switch state {
    case .ready:
      guard !opened else { return }
      opened = true
      pumpReceiveLocked(generation: generation)
      let open = onOpen
      DispatchQueue.global(qos: .userInitiated).async { open?() }
    case .failed(let error):
      finishLocked(
        error: WebSocketChannelError.connectFailed(error.localizedDescription),
        generation: generation
      )
    case .cancelled:
      finishLocked(error: nil, generation: generation)
    case .waiting(let error):
      // Why: Tailscale/VPN often sits in `.waiting` while the path comes up —
      // do not cancel; NW will move to `.ready` or `.failed`. Surface the
      // waiting reason only if it stays forever via the outer connect timeout.
      _ = error
    case .setup, .preparing:
      break
    @unknown default:
      break
    }
  }

  private func pumpReceiveLocked(generation: Int) {
    guard self.generation == generation, opened, let connection else { return }
    connection.receiveMessage { [weak self] data, context, _, error in
      self?.queue.async {
        guard let self, self.generation == generation else { return }
        if let error {
          self.finishLocked(
            error: WebSocketChannelError.connectFailed(error.localizedDescription),
            generation: generation
          )
          return
        }
        if let data, !data.isEmpty {
          let wsMeta = context?.protocolMetadata(definition: NWProtocolWebSocket.definition)
            as? NWProtocolWebSocket.Metadata
          if wsMeta?.opcode == .binary {
            self.onBinary?(data)
          } else if let text = String(data: data, encoding: .utf8) {
            self.onText?(text)
          } else {
            self.onBinary?(data)
          }
        }
        if self.opened, self.generation == generation {
          self.pumpReceiveLocked(generation: generation)
        }
      }
    }
  }

  private func finishLocked(error: Error?, generation: Int? = nil, notify: Bool = true) {
    let gen = generation ?? self.generation
    opened = false
    let conn = connection
    connection = nil
    conn?.stateUpdateHandler = nil
    conn?.cancel()
    guard notify else { return }
    guard self.generation == gen, !closeReported else { return }
    closeReported = true
    let callback = onClose
    DispatchQueue.global(qos: .userInitiated).async { callback?(error) }
  }
}

/// Alias kept for older call sites; same live Network.framework client.
typealias URLSessionWebSocketChannel = NWWebSocketChannel
