import CoreText
import Metal
import UIKit

struct GlyphUV: Equatable {
  var origin: SIMD2<Float>
  var size: SIMD2<Float>
  var cellColumns: Int
}

/// RGBA Metal glyph atlas with ligature-aware CoreText shaping + overflow wrap.
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

    let metricsFont = CTFontCreateWithName("Menlo" as CFString, pointSize, nil)
    let ascent = CTFontGetAscent(metricsFont)
    let descent = CTFontGetDescent(metricsFont)
    let leading = CTFontGetLeading(metricsFont)
    cellPixelHeight = Int(ceil(ascent + descent + leading)) + 4
    var m: UniChar = 0x004D
    var glyph: CGGlyph = 0
    CTFontGetGlyphsForCharacters(metricsFont, &m, &glyph, 1)
    var advance = CGSize.zero
    CTFontGetAdvancesForGlyphs(metricsFont, .horizontal, &glyph, &advance, 1)
    cellPixelWidth = max(Int(ceil(advance.width)) + 2, 7)

    clearAtlasPixels()
    _ = rasterize(" ", cellColumns: 1)
  }

  /// Returns UV; if atlas wrapped during this call, `generation` is already bumped.
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
    // Don't recurse into rasterize here — seed space after wrap from caller path.
    seedSpaceGlyph()
  }

  private func seedSpaceGlyph() {
    // Direct pack of a blank cell so overflow fallback always exists.
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

  /// Ligature-friendly attributes: essential ligatures on + emoji cascade font.
  private func shapedAttributes() -> [NSAttributedString.Key: Any] {
    [
      .font: drawingFont(),
      .foregroundColor: UIColor.white,
      // 2 = essential ligatures (fi/fl etc.) via Core Text / AppKit bridge on iOS.
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

    ctx.translateBy(x: 0, y: CGFloat(h))
    ctx.scaleBy(x: 1, y: -1)
    ctx.clear(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.setFillColor(UIColor.clear.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))

    let attr = NSAttributedString(string: text, attributes: shapedAttributes())
    // CTTypesetter → CTLine so ligature substitution runs through the shaper.
    let typesetter = CTTypesetterCreateWithAttributedString(attr)
    let line = CTTypesetterCreateLine(typesetter, CFRange(location: 0, length: attr.length))
    let ascent = drawingFont().ascender
    ctx.textPosition = CGPoint(x: 1, y: CGFloat(h) - ascent - 2)
    CTLineDraw(line, ctx)

    // Mono glyphs often land as white RGB; ensure alpha from coverage if needed.
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
