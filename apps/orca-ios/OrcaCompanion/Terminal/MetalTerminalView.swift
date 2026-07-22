import MetalKit
import SwiftUI

/// SwiftUI bridge to an MTKView driven by Ghostty render-state → Metal glyphs.
struct MetalTerminalView: UIViewRepresentable {
  var frame: TerminalFrame?

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> MTKView {
    let view = MTKView()
    view.device = MTLCreateSystemDefaultDevice()
    view.isPaused = true
    view.enableSetNeedsDisplay = true
    view.framebufferOnly = true
    if let renderer = MetalTerminalRenderer(mtkView: view) {
      context.coordinator.renderer = renderer
    }
    return view
  }

  func updateUIView(_ uiView: MTKView, context: Context) {
    guard let renderer = context.coordinator.renderer, let frame else { return }
    let size = uiView.drawableSize.width > 1 ? uiView.drawableSize : uiView.bounds.size
    let scale = uiView.contentScaleFactor
    let drawable = CGSize(
      width: max(size.width, uiView.bounds.width * scale),
      height: max(size.height, uiView.bounds.height * scale)
    )
    renderer.update(frame: frame, drawableSize: drawable)
    uiView.setNeedsDisplay()
  }

  final class Coordinator {
    var renderer: MetalTerminalRenderer?
  }
}
