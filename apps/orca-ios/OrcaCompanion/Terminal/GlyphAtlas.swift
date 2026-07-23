import CoreText
import Metal
import UIKit

struct GlyphUV: Equatable {
  var origin: SIMD2<Float>
  var size: SIMD2<Float>
  var cellColumns: Int
}

/// RGBA Metal glyph atlas. Glyphs are rasterized with UIKit (top-left) so CTM/text-matrix
/// fights do not flatten characters into one-pixel-tall smears.
final class GlyphAtlas {
  let texture: MTLTexture
  let cellPixelWidth: Int
  let cellPixelHeight: Int
  private let device: MTLDevice
  private let pointSize: CGFloat
  private var cursorX = 0
  private var cursorY = 0
  private var cache: [String: GlyphUV] = [:]
  private let atlasSize: Int
  private(set) var generation = 0

  /// - Parameter pointSize: size in atlas pixels (pass `13 * screen.scale`).
  init?(device: MTLDevice, pointSize: CGFloat = 13, atlasSize: Int = 2048) {
    self.device = device
    self.pointSize = pointSize
    self.atlasSize = atlasSize
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(
      pixelFormat: .rgba8Unorm,
      width: atlasSize,
      height: atlasSize,
      mipmapped: false
    )
    descriptor.usage = [.shaderRead]
    descriptor.storageMode = .shared
    guard let texture = device.makeTexture(descriptor: descriptor) else { return nil }
    self.texture = texture

    let font = UIFont(name: "Menlo", size: pointSize)
      ?? .monospacedSystemFont(ofSize: pointSize, weight: .regular)
    let advance = ("M" as NSString).size(withAttributes: [.font: font]).width
    cellPixelWidth = max(Int(ceil(advance)) + 2, 7)
    cellPixelHeight = max(Int(ceil(font.lineHeight)) + 4, Int(ceil(pointSize * 1.25)))

    clearAtlasPixels()
    _ = rasterize(" ", cellColumns: 1)
  }

  func uv(for text: String, cellColumns: Int = 1) -> GlyphUV? {
    let key = cacheKey(text, cellColumns: cellColumns)
    if let cached = cache[key] { return cached }
    return rasterize(text.isEmpty ? " " : text, cellColumns: max(1, cellColumns))
  }

  private func cacheKey(_ text: String, cellColumns: Int) -> String {
    "\(cellColumns)|\(text.isEmpty ? " " : text)"
  }

  private func clearAtlasPixels() {
    let zeros = [UInt8](repeating: 0, count: atlasSize * atlasSize * 4)
    zeros.withUnsafeBytes { raw in
      texture.replace(
        region: MTLRegionMake2D(0, 0, atlasSize, atlasSize),
        mipmapLevel: 0,
        withBytes: raw.baseAddress!,
        bytesPerRow: atlasSize * 4
      )
    }
  }

  private func wrapAtlas() {
    generation += 1
    cache.removeAll(keepingCapacity: true)
    cursorX = 0
    cursorY = 0
    clearAtlasPixels()
    seedSpaceGlyph()
  }

  private func seedSpaceGlyph() {
    let w = cellPixelWidth
    let h = cellPixelHeight
    let blank = [UInt8](repeating: 0, count: w * h * 4)
    blank.withUnsafeBytes { raw in
      texture.replace(
        region: MTLRegionMake2D(0, 0, w, h),
        mipmapLevel: 0,
        withBytes: raw.baseAddress!,
        bytesPerRow: w * 4
      )
    }
    cache[cacheKey(" ", cellColumns: 1)] = GlyphUV(
      origin: SIMD2(0, 0),
      size: SIMD2(Float(w) / Float(atlasSize), Float(h) / Float(atlasSize)),
      cellColumns: 1
    )
    cursorX = w
    cursorY = 0
  }

  private func drawingFont() -> UIFont {
    let base = UIFont(name: "Menlo", size: pointSize)
      ?? .monospacedSystemFont(ofSize: pointSize, weight: .regular)
    guard let emoji = UIFont(name: "Apple Color Emoji", size: pointSize) else { return base }
    let cascaded = base.fontDescriptor.addingAttributes([
      .cascadeList: [emoji.fontDescriptor]
    ])
    return UIFont(descriptor: cascaded, size: pointSize)
  }

  private func shapedAttributes() -> [NSAttributedString.Key: Any] {
    [
      .font: drawingFont(),
      .foregroundColor: UIColor.white,
      .ligature: NSNumber(value: 2)
    ]
  }

  @discardableResult
  private func rasterize(_ text: String, cellColumns: Int) -> GlyphUV? {
    let columns = max(1, min(cellColumns, 2))
    let w = cellPixelWidth * columns
    let h = cellPixelHeight
    if cursorX + w > atlasSize {
      cursorX = 0
      cursorY += h
    }
    if cursorY + h > atlasSize {
      wrapAtlas()
      if cursorY + h > atlasSize {
        return cache[cacheKey(" ", cellColumns: 1)]
      }
    }

    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
      data: &pixels,
      width: w,
      height: h,
      bitsPerComponent: 8,
      bytesPerRow: w * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }

    // Why: UIGraphicsPushContext + flip gives UIKit top-left drawing into a
    // bitmap whose row0 is Metal v=0 — no CTLineDraw text-matrix flatten.
    UIGraphicsPushContext(ctx)
    ctx.translateBy(x: 0, y: CGFloat(h))
    ctx.scaleBy(x: 1, y: -1)
    UIColor.clear.setFill()
    UIRectFill(CGRect(x: 0, y: 0, width: w, height: h))
    let attr = NSAttributedString(string: text, attributes: shapedAttributes())
    let textSize = attr.size()
    let y = max(0, (CGFloat(h) - textSize.height) * 0.5)
    attr.draw(at: CGPoint(x: 1, y: y))
    UIGraphicsPopContext()

    for i in stride(from: 0, to: pixels.count, by: 4) {
      let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3]
      if a == 0, r | g | b != 0 {
        pixels[i + 3] = max(r, max(g, b))
      }
    }

    pixels.withUnsafeBytes { raw in
      texture.replace(
        region: MTLRegionMake2D(cursorX, cursorY, w, h),
        mipmapLevel: 0,
        withBytes: raw.baseAddress!,
        bytesPerRow: w * 4
      )
    }

    let uv = GlyphUV(
      origin: SIMD2(Float(cursorX) / Float(atlasSize), Float(cursorY) / Float(atlasSize)),
      size: SIMD2(Float(w) / Float(atlasSize), Float(h) / Float(atlasSize)),
      cellColumns: columns
    )
    cache[cacheKey(text, cellColumns: columns)] = uv
    cursorX += w
    return uv
  }
}
