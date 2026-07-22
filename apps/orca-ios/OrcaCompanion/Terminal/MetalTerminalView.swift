import MetalKit
import SwiftUI

/// SwiftUI bridge to an MTKView driven by Ghostty render-state → Metal glyphs.
struct MetalTerminalView: UIViewRepresentable {
  var frame: TerminalFrame?
  /// Called when the drawable size implies a different cols×rows fit.
  var onViewportFit: ((TerminalViewportFit.Grid) -> Void)?

  func makeCoordinator() -> Coordinator {
    Coordinator(onViewportFit: onViewportFit)
  }

  func makeUIView(context: Context) -> MTKView {
    let view = MTKView()
    view.device = MTLCreateSystemDefaultDevice()
    view.isPaused = true
    view.enableSetNeedsDisplay = true
    view.framebufferOnly = true
    view.contentMode = .scaleToFill
    view.autoResizeDrawable = true
    if let renderer = MetalTerminalRenderer(mtkView: view) {
      context.coordinator.renderer = renderer
    }
    return view
  }

  func updateUIView(_ uiView: MTKView, context: Context) {
    context.coordinator.onViewportFit = onViewportFit
    guard let renderer = context.coordinator.renderer else { return }

    let scale = uiView.contentScaleFactor
    let bounds = uiView.bounds.size
    let drawable = CGSize(
      width: max(uiView.drawableSize.width, bounds.width * scale),
      height: max(uiView.drawableSize.height, bounds.height * scale)
    )
    guard drawable.width > 1, drawable.height > 1 else { return }

    let fit = renderer.layoutGrid(for: drawable)
    if context.coordinator.lastFit != fit {
      context.coordinator.lastFit = fit
      onViewportFit?(fit)
    }

    guard let frame else { return }
    renderer.update(frame: frame, drawableSize: drawable)
    uiView.setNeedsDisplay()
  }

  final class Coordinator {
    var renderer: MetalTerminalRenderer?
    var lastFit: TerminalViewportFit.Grid?
    var onViewportFit: ((TerminalViewportFit.Grid) -> Void)?

    init(onViewportFit: ((TerminalViewportFit.Grid) -> Void)?) {
      self.onViewportFit = onViewportFit
    }
  }
}
