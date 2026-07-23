import Foundation
import GhosttyVt

extension GhosttyVtEngine {
  /// Persistent Ghostty render-state + iterators (allocated once, updated per frame).
  final class RenderCaptureState {
    var renderState: GhosttyRenderState?
    var rowIter: GhosttyRenderStateRowIterator?
    var cellsHandle: GhosttyRenderStateRowCells?
    var cachedCells: [TerminalCell] = []
    var cachedCols = 0
    var cachedRows = 0
    var defaultFg = TerminalRGB.white
    var defaultBg = TerminalRGB.black

    deinit {
      if let cellsHandle { ghostty_render_state_row_cells_free(cellsHandle) }
      if let rowIter { ghostty_render_state_row_iterator_free(rowIter) }
      if let renderState { ghostty_render_state_free(renderState) }
    }

    func ensureHandles() throws {
      if renderState == nil {
        var state: GhosttyRenderState?
        let created = ghostty_render_state_new(nil, &state)
        guard created == GHOSTTY_SUCCESS, let state else {
          throw TerminalEngineError.nativeFailure(code: Int(created.rawValue))
        }
        renderState = state
      }
      if rowIter == nil {
        var iter: GhosttyRenderStateRowIterator?
        guard ghostty_render_state_row_iterator_new(nil, &iter) == GHOSTTY_SUCCESS, let iter else {
          throw TerminalEngineError.nativeFailure(code: -1)
        }
        rowIter = iter
      }
      if cellsHandle == nil {
        var cells: GhosttyRenderStateRowCells?
        guard ghostty_render_state_row_cells_new(nil, &cells) == GHOSTTY_SUCCESS, let cells else {
          throw TerminalEngineError.nativeFailure(code: -2)
        }
        cellsHandle = cells
      }
    }
  }

  /// Snapshot / incremental update via Ghostty render-state for Metal glyph drawing.
  func captureFrame() throws -> TerminalFrame {
    guard let terminal else { throw TerminalEngineError.unavailable("no terminal") }
    let capture = renderCapture
    try capture.ensureHandles()
    guard let state = capture.renderState,
          let rowIter = capture.rowIter,
          let cellsHandle = capture.cellsHandle
    else {
      throw TerminalEngineError.unavailable("render capture")
    }

    let updated = ghostty_render_state_update(state, terminal)
    guard updated == GHOSTTY_SUCCESS else {
      throw TerminalEngineError.nativeFailure(code: Int(updated.rawValue))
    }

    var dirtyRaw = GHOSTTY_RENDER_STATE_DIRTY_FULL
    _ = withUnsafeMutablePointer(to: &dirtyRaw) {
      ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_DIRTY, $0)
    }

    var cols: UInt16 = 0
    var rows: UInt16 = 0
    _ = withUnsafeMutablePointer(to: &cols) {
      ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_COLS, $0)
    }
    _ = withUnsafeMutablePointer(to: &rows) {
      ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_ROWS, $0)
    }
    let colCount = Int(cols)
    let rowCount = Int(rows)

    var colors = GhosttyRenderStateColors()
    colors.size = MemoryLayout<GhosttyRenderStateColors>.size
    _ = ghostty_render_state_colors_get(state, &colors)
    let defaultFg = TerminalRGB(r: colors.foreground.r, g: colors.foreground.g, b: colors.foreground.b)
    let defaultBg = TerminalRGB(r: colors.background.r, g: colors.background.g, b: colors.background.b)
    capture.defaultFg = defaultFg
    capture.defaultBg = defaultBg

    var cursorVisible = false
    var cursorHasValue = false
    var cursorX: UInt16 = 0
    var cursorY: UInt16 = 0
    _ = withUnsafeMutablePointer(to: &cursorVisible) {
      ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_CURSOR_VISIBLE, $0)
    }
    _ = withUnsafeMutablePointer(to: &cursorHasValue) {
      ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_HAS_VALUE, $0)
    }
    if cursorHasValue {
      _ = withUnsafeMutablePointer(to: &cursorX) {
        ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_X, $0)
      }
      _ = withUnsafeMutablePointer(to: &cursorY) {
        ghostty_render_state_get(state, GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_Y, $0)
      }
    }

    let sizeChanged = capture.cachedCols != colCount || capture.cachedRows != rowCount
    let forceFull = sizeChanged || dirtyRaw == GHOSTTY_RENDER_STATE_DIRTY_FULL || capture.cachedCells.isEmpty
    if sizeChanged {
      capture.cachedCells = Array(
        repeating: .empty(fg: defaultFg, bg: defaultBg),
        count: colCount * rowCount
      )
      capture.cachedCols = colCount
      capture.cachedRows = rowCount
    } else if capture.cachedCells.count != colCount * rowCount {
      capture.cachedCells = Array(
        repeating: .empty(fg: defaultFg, bg: defaultBg),
        count: colCount * rowCount
      )
    }

    if dirtyRaw == GHOSTTY_RENDER_STATE_DIRTY_FALSE, !forceFull {
      return TerminalFrame(
        cols: colCount,
        rows: rowCount,
        cells: capture.cachedCells,
        defaultForeground: defaultFg,
        defaultBackground: defaultBg,
        cursorCol: cursorHasValue ? Int(cursorX) : nil,
        cursorRow: cursorHasValue ? Int(cursorY) : nil,
        cursorVisible: cursorVisible && cursorHasValue,
        dirty: .none
      ).remapped(for: chromeAppearance)
    }

    var rowIterRef = rowIter
    guard ghostty_render_state_get(
      state,
      GHOSTTY_RENDER_STATE_DATA_ROW_ITERATOR,
      &rowIterRef
    ) == GHOSTTY_SUCCESS else {
      throw TerminalEngineError.unavailable("row iterator")
    }

    var dirtyRows = IndexSet()
    var rowIndex = 0
    while ghostty_render_state_row_iterator_next(rowIter) {
      defer { rowIndex += 1 }
      guard rowIndex < rowCount else { break }

      var rowDirty = forceFull
      if !forceFull {
        _ = withUnsafeMutablePointer(to: &rowDirty) {
          ghostty_render_state_row_get(rowIter, GHOSTTY_RENDER_STATE_ROW_DATA_DIRTY, $0)
        }
      }
      guard rowDirty || forceFull else {
        var clean = false
        _ = ghostty_render_state_row_set(rowIter, GHOSTTY_RENDER_STATE_ROW_OPTION_DIRTY, &clean)
        continue
      }

      var cellsRef = cellsHandle
      guard ghostty_render_state_row_get(
        rowIter,
        GHOSTTY_RENDER_STATE_ROW_DATA_CELLS,
        &cellsRef
      ) == GHOSTTY_SUCCESS else { continue }

      var col = 0
      while ghostty_render_state_row_cells_next(cellsHandle), col < colCount {
        let text = Self.readCellUTF8(cellsHandle)
        var fg = GhosttyColorRgb(r: defaultFg.r, g: defaultFg.g, b: defaultFg.b)
        var bg = GhosttyColorRgb(r: defaultBg.r, g: defaultBg.g, b: defaultBg.b)
        if ghostty_render_state_row_cells_get(
          cellsHandle,
          GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_FG_COLOR,
          &fg
        ) != GHOSTTY_SUCCESS {
          fg = GhosttyColorRgb(r: defaultFg.r, g: defaultFg.g, b: defaultFg.b)
        }
        if ghostty_render_state_row_cells_get(
          cellsHandle,
          GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_BG_COLOR,
          &bg
        ) != GHOSTTY_SUCCESS {
          bg = GhosttyColorRgb(r: defaultBg.r, g: defaultBg.g, b: defaultBg.b)
        }

        let width = Self.displayWidth(for: text)
        capture.cachedCells[rowIndex * colCount + col] = TerminalCell(
          text: text,
          foreground: TerminalRGB(r: fg.r, g: fg.g, b: fg.b),
          background: TerminalRGB(r: bg.r, g: bg.g, b: bg.b),
          width: width
        )
        col += 1
      }
      while col < colCount {
        capture.cachedCells[rowIndex * colCount + col] = .empty(fg: defaultFg, bg: defaultBg)
        col += 1
      }

      dirtyRows.insert(rowIndex)
      var clean = false
      _ = ghostty_render_state_row_set(rowIter, GHOSTTY_RENDER_STATE_ROW_OPTION_DIRTY, &clean)
    }

    var cleanState = GHOSTTY_RENDER_STATE_DIRTY_FALSE
    _ = ghostty_render_state_set(state, GHOSTTY_RENDER_STATE_OPTION_DIRTY, &cleanState)

    let dirtyKind: TerminalDirtyKind
    if forceFull || dirtyRaw == GHOSTTY_RENDER_STATE_DIRTY_FULL {
      dirtyKind = .full
    } else if dirtyRows.isEmpty {
      dirtyKind = .none
    } else {
      dirtyKind = .partial(rows: dirtyRows)
    }

    let frame = TerminalFrame(
      cols: colCount,
      rows: rowCount,
      cells: capture.cachedCells,
      defaultForeground: defaultFg,
      defaultBackground: defaultBg,
      cursorCol: cursorHasValue ? Int(cursorX) : nil,
      cursorRow: cursorHasValue ? Int(cursorY) : nil,
      cursorVisible: cursorVisible && cursorHasValue,
      dirty: dirtyKind
    )
    // Why: rematerialize dark host TUIs (Cursor Agent) onto companion paper/ink.
    return frame.remapped(for: chromeAppearance)
  }

  /// Rough East Asian Width: emoji / many CJK occupy two cells in the atlas UV.
  static func displayWidth(for text: String) -> Int {
    guard !text.isEmpty else { return 1 }
    for scalar in text.unicodeScalars {
      let v = scalar.value
      if v >= 0x1F300 && v <= 0x1FAFF { return 2 } // emoji blocks
      if v >= 0x1100 && v <= 0x115F { return 2 }
      if v >= 0x2E80 && v <= 0xA4CF { return 2 }
      if v >= 0xAC00 && v <= 0xD7A3 { return 2 }
      if v >= 0xF900 && v <= 0xFAFF { return 2 }
      if v >= 0xFE10 && v <= 0xFE6F { return 2 }
      if v >= 0xFF00 && v <= 0xFF60 { return 2 }
      if v >= 0xFFE0 && v <= 0xFFE6 { return 2 }
      if v >= 0x20000 && v <= 0x3FFFD { return 2 }
    }
    return 1
  }

  static func readCellUTF8(_ cellsHandle: GhosttyRenderStateRowCells) -> String {
    var scratch = [UInt8](repeating: 0, count: 64)
    return scratch.withUnsafeMutableBufferPointer { ptr in
      var buf = GhosttyBuffer(ptr: ptr.baseAddress, cap: ptr.count, len: 0)
      let result = ghostty_render_state_row_cells_get(
        cellsHandle,
        GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_UTF8,
        &buf
      )
      if result == GHOSTTY_SUCCESS, buf.len > 0 {
        return String(bytes: ptr.prefix(Int(buf.len)), encoding: .utf8) ?? ""
      }
      if result == GHOSTTY_OUT_OF_SPACE, buf.len > 0 {
        var big = [UInt8](repeating: 0, count: Int(buf.len))
        return big.withUnsafeMutableBufferPointer { bigPtr in
          var bigBuf = GhosttyBuffer(ptr: bigPtr.baseAddress, cap: bigPtr.count, len: 0)
          guard ghostty_render_state_row_cells_get(
            cellsHandle,
            GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_UTF8,
            &bigBuf
          ) == GHOSTTY_SUCCESS, bigBuf.len > 0 else { return "" }
          return String(bytes: bigPtr.prefix(Int(bigBuf.len)), encoding: .utf8) ?? ""
        }
      }
      return ""
    }
  }
}
