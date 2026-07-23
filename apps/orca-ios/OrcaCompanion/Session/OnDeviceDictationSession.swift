import AVFoundation
import Foundation
import Observation
import Speech

/// On-device mic → text. Why: companion voice mode should not depend on desktop
/// speech models; the phone recognizes speech, then we `terminal.send`.
@MainActor
@Observable
final class OnDeviceDictationSession: NSObject {
  enum SessionError: Error, LocalizedError, Equatable {
    case recognizerUnavailable
    case speechPermissionDenied
    case microphonePermissionDenied
    case alreadyRunning
    case notRunning
    case noSpeech
    case engine(String)

    var errorDescription: String? {
      switch self {
      case .recognizerUnavailable:
        return "Speech recognition is not available on this device."
      case .speechPermissionDenied:
        return "Allow Speech Recognition for Orca Companion in Settings."
      case .microphonePermissionDenied:
        return "Allow Microphone access for Orca Companion in Settings."
      case .alreadyRunning:
        return "Dictation is already running."
      case .notRunning:
        return "Dictation is not running."
      case .noSpeech:
        return "No speech captured — try again."
      case .engine(let message):
        return message
      }
    }
  }

  private let audioEngine = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var recognizer: SFSpeechRecognizer?
  private var stopContinuation: CheckedContinuation<String, Error>?
  private var hasTap = false
  /// Text already finalized by Speech mid-hold (utterance boundaries).
  private var committedTranscript = ""
  private(set) var isRunning = false
  private(set) var transcript = ""

  func start() async throws {
    guard !isRunning else { throw SessionError.alreadyRunning }
    try await ensurePermissions()

    guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
      throw SessionError.recognizerUnavailable
    }
    self.recognizer = recognizer

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(
      .playAndRecord,
      mode: .measurement,
      options: [.duckOthers, .defaultToSpeaker]
    )
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    committedTranscript = ""
    transcript = ""

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw SessionError.engine("Microphone format is not ready — try again.")
    }
    removeTapIfNeeded()
    // Why: tap must follow `self.request` so segment restarts keep receiving audio.
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.request?.append(buffer)
    }
    hasTap = true

    audioEngine.prepare()
    try audioEngine.start()
    isRunning = true
    beginRecognitionSegment()
  }

  @discardableResult
  func stop() async throws -> String {
    guard isRunning else { throw SessionError.notRunning }

    let text = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
      self.stopContinuation = cont
      self.request?.endAudio()
      if self.audioEngine.isRunning {
        self.audioEngine.stop()
      }
      self.removeTapIfNeeded()

      // Why: if we already have a partial, don't wait the full Speech finalize window.
      let hasPartial = !self.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      let graceNs: UInt64 = hasPartial ? 280_000_000 : 900_000_000
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: graceNs)
        if self.stopContinuation != nil {
          self.finishStop(with: self.transcript)
        }
      }
    }

    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw SessionError.noSpeech }
    return trimmed
  }

  func cancel() {
    if let cont = stopContinuation {
      stopContinuation = nil
      cont.resume(throwing: CancellationError())
    }
    task?.cancel()
    request?.endAudio()
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    removeTapIfNeeded()
    teardownAudio()
  }

  /// Why: Speech finalizes after a short pause (~1–2s). Hold-to-talk must keep
  /// the mic up and start a new segment until the user releases.
  private func beginRecognitionSegment() {
    guard isRunning, let recognizer else { return }

    task?.cancel()
    task = nil

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    // Why: do not force requiresOnDeviceRecognition — empty results when the
    // locale model is missing; Apple recognition still runs from the phone UX.
    if #available(iOS 16.0, *) {
      request.addsPunctuation = true
    }
    self.request = request

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      Task { @MainActor in
        self?.handleRecognition(result: result, error: error)
      }
    }
  }

  private func handleRecognition(result: SFSpeechRecognitionResult?, error: Error?) {
    if let result {
      let segment = result.bestTranscription.formattedString
      transcript = joinTranscript(committed: committedTranscript, segment: segment)
      if result.isFinal {
        committedTranscript = transcript
        if stopContinuation != nil {
          finishStop(with: transcript)
          return
        }
        if isRunning {
          beginRecognitionSegment()
        }
        return
      }
    }

    guard let error else { return }
    let ns = error as NSError

    if stopContinuation != nil {
      let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
      // No-speech / canceled after endAudio — deliver whatever we have.
      if ns.domain == "kAFAssistantErrorDomain", ns.code == 1110 || ns.code == 203 {
        finishStop(with: transcript)
        return
      }
      if text.isEmpty {
        finishStop(error: SessionError.engine(error.localizedDescription))
      } else {
        finishStop(with: text)
      }
      return
    }

    // Still holding: silence / segment end — keep listening.
    if isRunning, isRestartableRecognitionError(ns) {
      beginRecognitionSegment()
    }
  }

  private func isRestartableRecognitionError(_ error: NSError) -> Bool {
    guard error.domain == "kAFAssistantErrorDomain" else { return false }
    // 1110 no speech, 203 canceled, 216/301 timeout-ish segment ends.
    return [1110, 203, 216, 301].contains(error.code)
  }

  private func joinTranscript(committed: String, segment: String) -> String {
    let left = committed.trimmingCharacters(in: .whitespacesAndNewlines)
    let right = segment.trimmingCharacters(in: .whitespacesAndNewlines)
    if left.isEmpty { return right }
    if right.isEmpty { return left }
    return left + " " + right
  }

  private func finishStop(with text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let cont = stopContinuation else { return }
    stopContinuation = nil
    teardownAudio()
    cont.resume(returning: trimmed)
  }

  private func finishStop(error: Error) {
    guard let cont = stopContinuation else { return }
    stopContinuation = nil
    teardownAudio()
    cont.resume(throwing: error)
  }

  private func removeTapIfNeeded() {
    guard hasTap else { return }
    audioEngine.inputNode.removeTap(onBus: 0)
    hasTap = false
  }

  private func teardownAudio() {
    isRunning = false
    task = nil
    request = nil
    recognizer = nil
    removeTapIfNeeded()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func ensurePermissions() async throws {
    let speech = await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
    }
    guard speech == .authorized else { throw SessionError.speechPermissionDenied }

    let micGranted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
      AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
    }
    guard micGranted else { throw SessionError.microphonePermissionDenied }
  }
}
