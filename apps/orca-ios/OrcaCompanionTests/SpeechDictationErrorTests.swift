import Foundation
@testable import OrcaCompanion
import XCTest

final class SpeechDictationErrorTests: XCTestCase {
  func testMapsDesktopSetupCodes() {
    XCTAssertEqual(
      SpeechDictationError.fromDesktop(code: nil, message: "voice_dictation_disabled"),
      .voiceDictationDisabled
    )
    XCTAssertEqual(
      SpeechDictationError.fromDesktop(code: nil, message: "voice_model_not_selected"),
      .voiceModelNotSelected
    )
    XCTAssertEqual(
      SpeechDictationError.fromDesktop(code: nil, message: "voice_model_not_ready:extracting"),
      .voiceModelNotReady("extracting")
    )
  }

  func testMapsLegacyDesktopSpeechApi() {
    let err = SpeechDictationError.fromDesktop(
      code: "method_not_found",
      message: "Method speech.models.list is not available to mobile clients"
    )
    XCTAssertEqual(err, .legacyDesktop)
    XCTAssertTrue(err.localizedDescription.contains("Update the paired desktop"))
  }

  func testSetupReadyRequiresEnabledSelectedReadyModel() {
    let ready = SpeechDictationSetup(
      enabled: true,
      selectedModelId: "m1",
      models: [.init(id: "m1", status: "ready")]
    )
    XCTAssertTrue(ready.isReady)

    let disabled = SpeechDictationSetup(
      enabled: false,
      selectedModelId: "m1",
      models: [.init(id: "m1", status: "ready")]
    )
    XCTAssertFalse(disabled.isReady)
  }
}
