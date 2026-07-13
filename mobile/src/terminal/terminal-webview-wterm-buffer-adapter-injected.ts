// Buffer facade injected before OrcaWtermTerminal. It maps Ghostty's core
// cells and scrollback onto the buffer contract used by Orca's touch bridge.
export const TERMINAL_WTERM_BUFFER_ADAPTER_JS = `
  function wtermDisposable(remove) {
    return { dispose: function() { try { remove(); } catch (e) {} } };
  }

  function wtermTrimRight(value) {
    return value.replace(/\\s+$/, '');
  }

  function WtermBufferLine(terminal, row) {
    this.terminal = terminal;
    this.row = row;
  }

  WtermBufferLine.prototype.getCell = function(col) {
    var cell = this.terminal._cellAt(this.row, col);
    var codepoint = cell && typeof cell.char === 'number' ? cell.char : 32;
    return {
      extended: { urlId: 0 },
      getChars: function() { return codepoint >= 32 ? String.fromCodePoint(codepoint) : ''; },
      getWidth: function() { return 1; }
    };
  };

  WtermBufferLine.prototype.translateToString = function(trimRight, start, end) {
    var from = typeof start === 'number' ? Math.max(0, start) : 0;
    var to = typeof end === 'number' ? Math.min(this.terminal.cols, end) : this.terminal.cols;
    var value = '';
    for (var col = from; col < to; col++) {
      var cell = this.terminal._cellAt(this.row, col);
      var codepoint = cell && typeof cell.char === 'number' ? cell.char : 32;
      value += codepoint >= 32 ? String.fromCodePoint(codepoint) : ' ';
    }
    return trimRight ? wtermTrimRight(value) : value;
  };

  function WtermBuffer(terminal) {
    this.terminal = terminal;
  }

  Object.defineProperties(WtermBuffer.prototype, {
    baseY: { get: function() { return this.terminal._scrollbackCount(); } },
    viewportY: { get: function() { return this.terminal._viewportRow(); } },
    cursorY: { get: function() {
      var core = this.terminal._terminalCore();
      return core ? core.getCursor().row : 0;
    } },
    length: { get: function() { return this.baseY + this.terminal.rows; } },
    type: { get: function() {
      var core = this.terminal._terminalCore();
      return core && core.usingAltScreen() ? 'alternate' : 'normal';
    } }
  });

  WtermBuffer.prototype.getLine = function(row) {
    if (row < 0 || row >= this.length) return undefined;
    return new WtermBufferLine(this.terminal, row);
  };
`
