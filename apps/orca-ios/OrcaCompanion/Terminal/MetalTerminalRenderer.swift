import Metal
import MetalKit
import simd
import UIKit

struct TerminalCellVertex {
  var position: SIMD2<Float>
  var uv: SIMD2<Float>
  var fg: SIMD4<Float>
  var bg: SIMD4<Float>
}

/// Metal glyph drawer with dirty-row patches, atlas-wrap rebuild, cursor-aware updates.
final class MetalTerminalRenderer: NSObject, MTKViewDelegate {
  private let device: MTLDevice
  private let queue: MTLCommandQueue
  private let pipeline: MTLRenderPipelineState
  private let sampler: MTLSamplerState
  private let atlas: GlyphAtlas
  private var vertexBuffer: MTLBuffer?
  private var vertexCapacity = 0
  private var vertexCount = 0
  private var lastLayout: TerminalViewportFit.Grid?
  private var atlasGeneration = 0
  private var lastCursorCol: Int?
  private var lastCursorRow: Int?
  private(set) var frame: TerminalFrame?

  var cellPixelWidth: Int { atlas.cellPixelWidth }
  var cellPixelHeight: Int { atlas.cellPixelHeight }

  init?(mtkView: MTKView) {
    guard let device = mtkView.device ?? MTLCreateSystemDefaultDevice(),
          let queue = device.makeCommandQueue()
    else { return nil }
    // Why: atlas pixels ≈ on-screen cell pixels at Menlo 13 on this screen scale.
    let pointSize = 13 * (UIScreen.main.scale)
    guard let atlas = GlyphAtlas(device: device, pointSize: pointSize) else { return nil }
    self.device = device
    self.queue = queue
    self.atlas = atlas
    atlasGeneration = atlas.generation
    mtkView.device = device
    mtkView.colorPixelFormat = .bgra8Unorm
    // Cleared again by TerminalMetalHostView when traits change (system light/dark).
    mtkView.clearColor = MTLClearColor(red: 1, green: 1, blue: 1, alpha: 1)
    mtkView.isPaused = true
    mtkView.enableSetNeedsDisplay = true

    guard let library = device.makeDefaultLibrary(),
          let vert = library.makeFunction(name: "terminal_cell_vertex"),
          let frag = library.makeFunction(name: "terminal_cell_fragment")
    else { return nil }

    let desc = MTLRenderPipelineDescriptor()
    desc.vertexFunction = vert
    desc.fragmentFunction = frag
    desc.colorAttachments[0].pixelFormat = mtkView.colorPixelFormat
    let layout = MTLVertexDescriptor()
    layout.attributes[0].format = .float2
    layout.attributes[0].offset = 0
    layout.attributes[0].bufferIndex = 0
    layout.attributes[1].format = .float2
    layout.attributes[1].offset = 8
    layout.attributes[1].bufferIndex = 0
    layout.attributes[2].format = .float4
    layout.attributes[2].offset = 16
    layout.attributes[2].bufferIndex = 0
    layout.attributes[3].format = .float4
    layout.attributes[3].offset = 32
    layout.attributes[3].bufferIndex = 0
    layout.layouts[0].stride = MemoryLayout<TerminalCellVertex>.stride
    desc.vertexDescriptor = layout

    guard let pipeline = try? device.makeRenderPipelineState(descriptor: desc) else { return nil }
    self.pipeline = pipeline

    let sampleDesc = MTLSamplerDescriptor()
    sampleDesc.minFilter = .linear
    sampleDesc.magFilter = .linear
    guard let sampler = device.makeSamplerState(descriptor: sampleDesc) else { return nil }
    self.sampler = sampler
    super.init()
    mtkView.delegate = self
  }

  func update(frame: TerminalFrame, layout: TerminalViewportFit.Grid) {
    let layoutChanged = lastLayout != layout
    if atlas.generation != atlasGeneration {
      atlasGeneration = atlas.generation
    }

    var rowsToPatch = IndexSet()
    if case .partial(let rows) = frame.dirty {
      rowsToPatch.formUnion(rows)
    }
    if lastCursorRow != frame.cursorRow || lastCursorCol != frame.cursorCol {
      if let r = lastCursorRow { rowsToPatch.insert(r) }
      if let r = frame.cursorRow { rowsToPatch.insert(r) }
    }

    let forceFull =
      layoutChanged
      || vertexCount == 0
      || frame.dirty == .full
      || atlas.generation != atlasGeneration
      || lastLayout?.cols != frame.cols
      || lastLayout?.rows != frame.rows

    self.frame = frame
    lastLayout = layout
    lastCursorCol = frame.cursorCol
    lastCursorRow = frame.cursorRow

    if forceFull {
      rebuildVertices(layout: layout)
    } else if !rowsToPatch.isEmpty {
      patchRows(rowsToPatch, frame: frame, layout: layout)
    } else if frame.dirty == .none {
      return
    } else {
      rebuildVertices(layout: layout)
    }

    if atlas.generation != atlasGeneration {
      atlasGeneration = atlas.generation
      rebuildVertices(layout: layout)
    }
  }

  private func boostContrastIfNeeded(fg: inout SIMD4<Float>, bg: inout SIMD4<Float>) {
    func lum(_ c: SIMD4<Float>) -> Float {
      0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z
    }
    let fgL = lum(fg)
    let bgL = lum(bg)
    // Why: Cursor Agent paints light chips; if fg lands near bg, glyphs vanish.
    if abs(fgL - bgL) >= 0.28 { return }
    if bgL >= 0.55 {
      fg = SIMD4(0.08, 0.08, 0.09, 1)
    } else {
      fg = SIMD4(0.92, 0.92, 0.94, 1)
    }
  }

  private func ensureVertexBuffer(cellCount: Int) {
    let needed = cellCount * 6
    vertexCount = needed
    if needed <= vertexCapacity, vertexBuffer != nil { return }
    vertexCapacity = max(needed, 256)
    vertexBuffer = device.makeBuffer(
      length: MemoryLayout<TerminalCellVertex>.stride * vertexCapacity,
      options: .storageModeShared
    )
  }

  private func writeCell(
    into ptr: UnsafeMutablePointer<TerminalCellVertex>,
    at cellIndex: Int,
    col: Int,
    row: Int,
    cell: TerminalCell,
    frame: TerminalFrame,
    layout: TerminalViewportFit.Grid
  ) {
    func ndc(_ px: Float, _ py: Float) -> SIMD2<Float> {
      let x = (px / layout.drawableWidth) * 2 - 1
      let y = 1 - (py / layout.drawableHeight) * 2
      return SIMD2(x, y)
    }

    let span = max(cell.width, 1)
    let x0 = layout.originX + Float(col) * layout.cellWidth
    let y0 = layout.originY + Float(row) * layout.cellHeight
    let x1 = x0 + layout.cellWidth * Float(span)
    let y1 = y0 + layout.cellHeight
    let p0 = ndc(x0, y0)
    let p1 = ndc(x1, y0)
    let p2 = ndc(x0, y1)
    let p3 = ndc(x1, y1)

    var uvOrigin = SIMD2<Float>(-1, -1)
    var uvSize = SIMD2<Float>(0, 0)
    if !cell.text.isEmpty, let uv = atlas.uv(for: cell.text, cellColumns: span) {
      uvOrigin = uv.origin
      uvSize = uv.size
    }

    var fg = cell.foreground.float4
    var bg = cell.background.float4
    if frame.cursorVisible, frame.cursorCol == col, frame.cursorRow == row {
      swap(&fg, &bg)
    }
    boostContrastIfNeeded(fg: &fg, bg: &bg)

    let u0: Float
    let v0: Float
    let u1: Float
    let v1: Float
    if uvOrigin.x < 0 {
      u0 = -1; v0 = -1; u1 = -1; v1 = -1
    } else {
      u0 = uvOrigin.x
      v0 = uvOrigin.y
      u1 = uvOrigin.x + uvSize.x
      v1 = uvOrigin.y + uvSize.y
    }

    let base = cellIndex * 6
    ptr[base + 0] = TerminalCellVertex(position: p0, uv: SIMD2(u0, v0), fg: fg, bg: bg)
    ptr[base + 1] = TerminalCellVertex(position: p1, uv: SIMD2(u1, v0), fg: fg, bg: bg)
    ptr[base + 2] = TerminalCellVertex(position: p2, uv: SIMD2(u0, v1), fg: fg, bg: bg)
    ptr[base + 3] = TerminalCellVertex(position: p1, uv: SIMD2(u1, v0), fg: fg, bg: bg)
    ptr[base + 4] = TerminalCellVertex(position: p3, uv: SIMD2(u1, v1), fg: fg, bg: bg)
    ptr[base + 5] = TerminalCellVertex(position: p2, uv: SIMD2(u0, v1), fg: fg, bg: bg)
  }

  private func rebuildVertices(layout: TerminalViewportFit.Grid) {
    guard let frame,
          layout.drawableWidth > 1,
          layout.drawableHeight > 1,
          frame.cols == layout.cols,
          frame.rows == layout.rows
    else {
      vertexCount = 0
      return
    }
    ensureVertexBuffer(cellCount: frame.cols * frame.rows)
    guard let buffer = vertexBuffer else { return }
    let ptr = buffer.contents().bindMemory(to: TerminalCellVertex.self, capacity: vertexCapacity)

    for row in 0 ..< frame.rows {
      for col in 0 ..< frame.cols {
        guard let cell = frame.cell(col: col, row: row) else { continue }
        writeCell(
          into: ptr,
          at: row * frame.cols + col,
          col: col,
          row: row,
          cell: cell,
          frame: frame,
          layout: layout
        )
      }
    }
  }

  private func patchRows(_ rows: IndexSet, frame: TerminalFrame, layout: TerminalViewportFit.Grid) {
    guard frame.cols == layout.cols, frame.rows == layout.rows else {
      rebuildVertices(layout: layout)
      return
    }
    ensureVertexBuffer(cellCount: frame.cols * frame.rows)
    guard let buffer = vertexBuffer else { return }
    let ptr = buffer.contents().bindMemory(to: TerminalCellVertex.self, capacity: vertexCapacity)

    for row in rows {
      guard row >= 0, row < frame.rows else { continue }
      for col in 0 ..< frame.cols {
        guard let cell = frame.cell(col: col, row: row) else { continue }
        writeCell(
          into: ptr,
          at: row * frame.cols + col,
          col: col,
          row: row,
          cell: cell,
          frame: frame,
          layout: layout
        )
      }
    }
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
    // Size is owned by MetalTerminalView (forced to GeometryReader × scale).
  }

  func draw(in view: MTKView) {
    guard vertexCount > 0,
          let buffer = vertexBuffer,
          let drawable = view.currentDrawable,
          let rpd = view.currentRenderPassDescriptor,
          let cmd = queue.makeCommandBuffer(),
          let enc = cmd.makeRenderCommandEncoder(descriptor: rpd)
    else { return }

    enc.setRenderPipelineState(pipeline)
    enc.setVertexBuffer(buffer, offset: 0, index: 0)
    enc.setFragmentTexture(atlas.texture, index: 0)
    enc.setFragmentSamplerState(sampler, index: 0)
    enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: vertexCount)
    enc.endEncoding()
    cmd.present(drawable)
    cmd.commit()
  }
}
