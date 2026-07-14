// Ghostty 0.3 reports scrollback counts but its WASM line accessor returns
// empty rows. Preserve rows as they leave the real Ghostty viewport.
export const TERMINAL_GHOSTTY_SCROLLBACK_JS = `
  var GHOSTTY_DEFAULT_COLOR = 256;
  var GHOSTTY_BLANK_CELL = { char: 32, fg: 256, bg: 256, flags: 0 };

  function cloneGhosttyCell(cell) {
    var clone = {
      char: cell && typeof cell.char === 'number' ? cell.char : 32,
      fg: cell && typeof cell.fg === 'number' ? cell.fg : GHOSTTY_DEFAULT_COLOR,
      bg: cell && typeof cell.bg === 'number' ? cell.bg : GHOSTTY_DEFAULT_COLOR,
      flags: cell && typeof cell.flags === 'number' ? cell.flags : 0
    };
    if (cell && typeof cell.fgRgb === 'number') clone.fgRgb = cell.fgRgb;
    if (cell && typeof cell.bgRgb === 'number') clone.bgRgb = cell.bgRgb;
    return clone;
  }

  function normalizeGhosttyCellForEink(cell, enabled) {
    if (!enabled) return cell;
    var hasExplicitColor = cell && (
      cell.fg !== GHOSTTY_DEFAULT_COLOR || cell.bg !== GHOSTTY_DEFAULT_COLOR ||
      typeof cell.fgRgb === 'number' || typeof cell.bgRgb === 'number'
    );
    if (!hasExplicitColor && !(cell && (cell.flags & 32))) return cell;
    var normalized = cloneGhosttyCell(cell);
    // Why: one ANSI palette drives both foreground and background in wterm.
    // Flatten cell colors so e-ink prompts cannot become black-on-black blocks.
    normalized.fg = GHOSTTY_DEFAULT_COLOR;
    normalized.bg = GHOSTTY_DEFAULT_COLOR;
    normalized.flags = normalized.flags & ~32;
    delete normalized.fgRgb;
    delete normalized.bgRgb;
    return normalized;
  }

  function ghosttyCellHasContent(cell) {
    return cell.char !== 32 || cell.flags !== 0 || cell.fg !== GHOSTTY_DEFAULT_COLOR ||
      cell.bg !== GHOSTTY_DEFAULT_COLOR || typeof cell.fgRgb === 'number' ||
      typeof cell.bgRgb === 'number';
  }

  function OrcaGhosttyScrollbackCore(core, limit) {
    this.core = core;
    this.limit = limit;
    this.lines = [];
    this.cols = 0;
    this.rows = 0;
    this.einkMode = false;
  }

  OrcaGhosttyScrollbackCore.prototype.init = function(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.lines = [];
    this.core.init(cols, rows);
  };

  OrcaGhosttyScrollbackCore.prototype.resize = function(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.core.resize(cols, rows);
  };

  OrcaGhosttyScrollbackCore.prototype._snapshotTopRows = function(count) {
    var rows = [];
    var rowCount = Math.min(this.rows, Math.max(0, count));
    for (var row = 0; row < rowCount; row++) {
      var cells = [];
      var length = 0;
      for (var col = 0; col < this.cols; col++) {
        var cell = cloneGhosttyCell(this.core.getCell(row, col));
        cells.push(cell);
        if (ghosttyCellHasContent(cell)) length = col + 1;
      }
      rows.push({ cells: cells, length: length });
    }
    return rows;
  };

  OrcaGhosttyScrollbackCore.prototype._captureWrite = function(write, estimate) {
    var before = this.core.getScrollbackCount();
    var snapshot = this.core.usingAltScreen()
      ? []
      : this._snapshotTopRows(Math.min(this.rows, Math.max(2, estimate)));
    write();
    var after = this.core.getScrollbackCount();
    if (after < before) {
      this.lines = [];
      return;
    }
    var added = Math.min(after - before, snapshot.length);
    for (var row = 0; row < added; row++) this.lines.push(snapshot[row]);
    if (this.lines.length > this.limit) this.lines.splice(0, this.lines.length - this.limit);
  };

  OrcaGhosttyScrollbackCore.prototype.writeString = function(value) {
    var maxChunk = Math.max(32, this.cols * 2);
    var start = 0;
    while (start < value.length) {
      var newline = value.indexOf('\\n', start);
      var end = Math.min(value.length, start + maxChunk);
      if (newline >= start && newline < end) end = newline + 1;
      if (end < value.length && /[\\uD800-\\uDBFF]/.test(value.charAt(end - 1))) end++;
      var chunk = value.slice(start, end);
      var estimatedRows = Math.ceil(chunk.length / Math.max(1, this.cols)) + 2;
      var self = this;
      this._captureWrite(function() { self.core.writeString(chunk); }, estimatedRows);
      start = end;
    }
  };

  OrcaGhosttyScrollbackCore.prototype.writeRaw = function(value) {
    var self = this;
    this._captureWrite(function() { self.core.writeRaw(value); }, this.rows);
  };

  OrcaGhosttyScrollbackCore.prototype.getScrollbackCount = function() {
    return this.lines.length;
  };

  OrcaGhosttyScrollbackCore.prototype.getScrollbackCell = function(offset, col) {
    var line = this.lines[this.lines.length - 1 - offset];
    var cell = line && line.cells[col] ? line.cells[col] : GHOSTTY_BLANK_CELL;
    return normalizeGhosttyCellForEink(cell, this.einkMode);
  };

  OrcaGhosttyScrollbackCore.prototype.getScrollbackLineLen = function(offset) {
    var line = this.lines[this.lines.length - 1 - offset];
    return line ? line.length : 0;
  };

  OrcaGhosttyScrollbackCore.prototype.getCell = function(row, col) {
    return normalizeGhosttyCellForEink(this.core.getCell(row, col), this.einkMode);
  };

  var ghosttyDelegates = [
    'isDirtyRow', 'clearDirty', 'getCols', 'getRows', 'getCursor',
    'cursorKeysApp', 'bracketedPaste', 'usingAltScreen', 'getTitle', 'getResponse',
    'getUnhandledSequences'
  ];
  for (var ghosttyDelegateIndex = 0; ghosttyDelegateIndex < ghosttyDelegates.length; ghosttyDelegateIndex++) {
    (function(name) {
      OrcaGhosttyScrollbackCore.prototype[name] = function() {
        return this.core[name].apply(this.core, arguments);
      };
    })(ghosttyDelegates[ghosttyDelegateIndex]);
  }
`
