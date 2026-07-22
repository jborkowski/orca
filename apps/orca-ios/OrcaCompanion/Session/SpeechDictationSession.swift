import Foundation

/// Desktop speech/dictation setup errors surfaced clearly to the companion UI.
enum SpeechDictationError: Error, Equatable, LocalizedError {
  case inputBlockedWhileNotify
  case voiceDictationDisabled
  case voiceModelNotSelected
  case voiceModelNotReady(String)
  case legacyDesktop
  case message(String)

  var errorDescription: String? {
    switch self {
    case .inputBlockedWhileNotify:
      return "Dictation requires an interactive attach (foreground)."
    case .voiceDictationDisabled:
      return "Voice dictation is disabled on the desktop. Enable it in Orca speech settings."
    case .voiceModelNotSelected:
      return "No speech model selected on the desktop. Choose a model in Orca speech settings."
    case .voiceModelNotReady(let detail):
      return "Speech model not ready: \(detail)"
    case .legacyDesktop:
      return "Update the paired desktop Orca app to use mobile voice settings."
    case .message(let text):
      return text
    }
  }

  /// Maps desktop RPC error codes/messages to actionable companion copy.
  static func fromDesktop(code: String?, message: String) -> SpeechDictationError {
    if message.contains("speech.models.list"),
       code == "method_not_found" || message.contains("not available to mobile clients")
    {
      return .legacyDesktop
    }
    switch message {
    case "voice_dictation_disabled":
      return .voiceDictationDisabled
    case "voice_model_not_selected":
      return .voiceModelNotSelected
    default:
      if message.hasPrefix("voice_model_not_ready:") {
        let detail = String(message.dropFirst("voice_model_not_ready:".count))
        return .voiceModelNotReady(detail.isEmpty ? "not ready" : detail)
      }
      return .message(message)
    }
  }
}

/// Snapshot of `speech.models.list` / `speech.dictation.setup` result.
struct SpeechDictationSetup: Equatable, Sendable {
  var enabled: Bool
  var selectedModelId: String?
  var models: [SpeechModel]

  struct SpeechModel: Equatable, Sendable {
    var id: String
    var status: String
  }

  var isReady: Bool {
    guard enabled, let selectedModelId else { return false }
    return models.contains { $0.id == selectedModelId && $0.status == "ready" }
  }

  static func parse(from result: [String: Any]) -> SpeechDictationSetup {
    let modelsRaw = result["models"] as? [[String: Any]] ?? []
    let models = modelsRaw.compactMap { row -> SpeechModel? in
      guard let id = row["id"] as? String, !id.isEmpty else { return nil }
      return SpeechModel(id: id, status: row["status"] as? String ?? "")
    }
    return SpeechDictationSetup(
      enabled: result["enabled"] as? Bool ?? false,
      selectedModelId: result["selectedModelId"] as? String,
      models: models
    )
  }
}
