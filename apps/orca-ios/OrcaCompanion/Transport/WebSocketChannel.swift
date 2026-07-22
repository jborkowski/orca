import Foundation

/// Thin socket facade so unit tests inject a mock without touching the network.
protocol WebSocketChannel: AnyObject {
  var onOpen: (() -> Void)? { get set }
  var onText: ((String) -> Void)? { get set }
  var onBinary: ((Data) -> Void)? { get set }
  var onClose: ((Error?) -> Void)? { get set }
  func connect()
  func sendText(_ text: String) throws
  func close()
}

enum WebSocketChannelError: Error {
  case notOpen
  case sendFailed(String)
}

/// Production channel over `URLSessionWebSocketTask`.
final class URLSessionWebSocketChannel: WebSocketChannel {
  var onOpen: (() -> Void)?
  var onText: ((String) -> Void)?
  var onBinary: ((Data) -> Void)?
  var onClose: ((Error?) -> Void)?

  private let url: URL
  private let session: URLSession
  private var task: URLSessionWebSocketTask?
  private var receiving = false
  private var generation = 0
  private var closeReported = true

  init(url: URL, session: URLSession = .shared) {
    self.url = url
    self.session = session
  }

  func connect() {
    // Why: cancel any prior task before opening so revive/reconnect never stacks sockets.
    receiving = false
    task?.cancel(with: .goingAway, reason: nil)
    task = nil

    closeReported = false
    generation += 1
    let generation = self.generation

    let task = session.webSocketTask(with: url)
    self.task = task
    task.resume()
    onOpen?()
    startReceiveLoop(generation: generation)
  }

  func sendText(_ text: String) throws {
    guard let task else { throw WebSocketChannelError.notOpen }
    let semaphore = DispatchSemaphore(value: 0)
    var sendError: Error?
    task.send(.string(text)) { error in
      sendError = error
      semaphore.signal()
    }
    semaphore.wait()
    if let sendError {
      throw WebSocketChannelError.sendFailed(sendError.localizedDescription)
    }
  }

  func close() {
    receiving = false
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    reportCloseOnce(nil)
  }

  private func startReceiveLoop(generation: Int) {
    receiving = true
    receiveNext(generation: generation)
  }

  private func receiveNext(generation: Int) {
    guard receiving, self.generation == generation, let task else { return }
    task.receive { [weak self] result in
      guard let self, self.receiving, self.generation == generation else { return }
      switch result {
      case .failure(let error):
        self.receiving = false
        self.task = nil
        self.reportCloseOnce(error)
      case .success(let message):
        switch message {
        case .string(let text):
          self.onText?(text)
        case .data(let data):
          self.onBinary?(data)
        @unknown default:
          break
        }
        self.receiveNext(generation: generation)
      }
    }
  }

  private func reportCloseOnce(_ error: Error?) {
    // Why: cancel + receive-failure both surface close; park/revive must see one event per open.
    guard !closeReported else { return }
    closeReported = true
    receiving = false
    onClose?(error)
  }
}
