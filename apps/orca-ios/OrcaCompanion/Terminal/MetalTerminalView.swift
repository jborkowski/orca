import MetalKit
import SwiftUI
import UIKit

/// SwiftUI bridge. Sizing is owned by `TerminalMetalHostView.layoutSubviews` so the
/// drawable always matches the real view bounds (GeometryReader alone was racy).
struct MetalTerminalView: UIViewRepresentable {
  var frame: TerminalFrame?
  var onViewportFit: ((TerminalViewportFit.Grid) -> Void)?
  /// Rows to scroll through local VT scrollback. Negative = older history.
  var onScrollRows: ((Int) -> Void)?

  func makeCoordinator() -> Coordinator {
    Coordinator(onViewportFit: onViewportFit, onScrollRows: onScrollRows)
  }

  func makeUIView(context: Context) -> TerminalMetalHostView {
    let host = TerminalMetalHostView()
    let coordinator = context.coordinator
    host.onViewportFit = { fit in
      coordinator.onViewportFit?(fit)
    }
    host.onScrollRows = { delta in
      coordinator.onScrollRows?(delta)
    }
    context.coordinator.host = host
    return host
  }

  func updateUIView(_ uiView: TerminalMetalHostView, context: Context) {
    context.coordinator.onViewportFit = onViewportFit
    context.coordinator.onScrollRows = onScrollRows
    let coordinator = context.coordinator
    uiView.onViewportFit = { fit in
      coordinator.onViewportFit?(fit)
    }
    uiView.onScrollRows = { delta in
      coordinator.onScrollRows?(delta)
    }
    uiView.update(frame: frame)
  }

  final class Coordinator {
    var host: TerminalMetalHostView?
    var onViewportFit: ((TerminalViewportFit.Grid) -> Void)?
    var onScrollRows: ((Int) -> Void)?

    init(
      onViewportFit: ((TerminalViewportFit.Grid) -> Void)?,
      onScrollRows: ((Int) -> Void)?
    ) {
      self.onViewportFit = onViewportFit
      self.onScrollRows = onScrollRows
    }
  }
}

/// UIKit host that forces `drawableSize == bounds × scale` before every fit/draw.
final class TerminalMetalHostView: UIView {
  var onViewportFit: ((TerminalViewportFit.Grid) -> Void)?
  var onScrollRows: ((Int) -> Void)?

  private let mtkView = MTKView()
  private var renderer: MetalTerminalRenderer?
  private var lastFit: TerminalViewportFit.Grid?
  private var pendingFrame: TerminalFrame?
  private var panRemainder: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = true
    isMultipleTouchEnabled = false
    applyChromeColors()

    mtkView.translatesAutoresizingMaskIntoConstraints = false
    mtkView.isPaused = true
    mtkView.enableSetNeedsDisplay = true
    mtkView.framebufferOnly = true
    mtkView.autoResizeDrawable = false
    mtkView.isOpaque = true
    // Why: host owns the pan gesture; MTKView would otherwise eat touches.
    mtkView.isUserInteractionEnabled = false
    addSubview(mtkView)
    NSLayoutConstraint.activate([
      mtkView.topAnchor.constraint(equalTo: topAnchor),
      mtkView.bottomAnchor.constraint(equalTo: bottomAnchor),
      mtkView.leadingAnchor.constraint(equalTo: leadingAnchor),
      mtkView.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])

    let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pan.maximumNumberOfTouches = 1
    addGestureRecognizer(pan)

    if let renderer = MetalTerminalRenderer(mtkView: mtkView) {
      self.renderer = renderer
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { nil }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
      applyChromeColors()
      mtkView.setNeedsDisplay()
    }
  }

  private func applyChromeColors() {
    let style = traitCollection.userInterfaceStyle
    let surface = CompanionTheme.terminalSurfaceUIColor(style: style)
    backgroundColor = surface
    mtkView.backgroundColor = surface
    var r: CGFloat = 1, g: CGFloat = 1, b: CGFloat = 1, a: CGFloat = 1
    surface.getRed(&r, green: &g, blue: &b, alpha: &a)
    mtkView.clearColor = MTLClearColor(red: Double(r), green: Double(g), blue: Double(b), alpha: Double(a))
  }

  func update(frame: TerminalFrame?) {
    pendingFrame = frame
    syncDrawableAndDraw()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    syncDrawableAndDraw()
  }

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began:
      panRemainder = 0
    case .changed:
      let translation = gesture.translation(in: self)
      gesture.setTranslation(.zero, in: self)
      let cellPoints: CGFloat
      if let fit = lastFit, contentScaleFactor > 0 {
        cellPoints = CGFloat(fit.cellHeight) / contentScaleFactor
      } else {
        cellPoints = 17
      }
      guard cellPoints > 1 else { return }
      // Finger down (+) reveals older history → Ghostty delta up (negative).
      panRemainder += translation.y
      let rows = Int(panRemainder / cellPoints)
      guard rows != 0 else { return }
      panRemainder -= CGFloat(rows) * cellPoints
      onScrollRows?(-rows)
    case .ended, .cancelled, .failed:
      panRemainder = 0
    default:
      break
    }
  }

  private func syncDrawableAndDraw() {
    guard bounds.width >= 40, bounds.height >= 40, let renderer else { return }

    let scale = window?.screen.scale ?? UIScreen.main.scale
    contentScaleFactor = scale
    mtkView.contentScaleFactor = scale

    let pixels = CGSize(
      width: (bounds.width * scale).rounded(.down),
      height: (bounds.height * scale).rounded(.down)
    )
    guard pixels.width > 1, pixels.height > 1 else { return }

    if mtkView.drawableSize != pixels {
      mtkView.drawableSize = pixels
    }

    guard let fit = TerminalViewportFit.fit(
      drawablePixels: pixels,
      cellPixelWidth: renderer.cellPixelWidth,
      cellPixelHeight: renderer.cellPixelHeight
    ) else { return }

    if lastFit != fit {
      lastFit = fit
      onViewportFit?(fit)
    }

    // Why: while local VT is catching up to a new fit, still paint what we have
    // so the surface doesn't flash empty during grow/refit.
    guard let frame = pendingFrame else {
      mtkView.setNeedsDisplay()
      return
    }
    if frame.cols != fit.cols || frame.rows != fit.rows {
      renderer.update(frame: frame, layout: fit)
      mtkView.setNeedsDisplay()
      return
    }

    renderer.update(frame: frame, layout: fit)
    mtkView.setNeedsDisplay()
  }
}