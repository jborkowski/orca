import { WTERM_GHOSTTY_WASM_BASE64 } from './terminal-webview-engine.generated'
import { TERMINAL_GHOSTTY_SCROLLBACK_JS } from './terminal-webview-ghostty-scrollback-injected'
import { TERMINAL_WTERM_BUFFER_ADAPTER_JS } from './terminal-webview-wterm-buffer-adapter-injected'

// wterm/Ghostty adapter injected into the terminal WebView document. It keeps
// Orca's native bridge stable while replacing xterm's renderer and VT engine.
export const TERMINAL_WTERM_ADAPTER_JS = `
  var WTERM_GHOSTTY_WASM_URL = 'data:application/wasm;base64,${WTERM_GHOSTTY_WASM_BASE64}';
  ${TERMINAL_GHOSTTY_SCROLLBACK_JS}
  ${TERMINAL_WTERM_BUFFER_ADAPTER_JS}

  function OrcaWtermTerminal(options) {
    var self = this;
    var state = {
      fontSize: options && options.fontSize ? options.fontSize : 13,
      fontFamily: options && options.fontFamily ? options.fontFamily : 'monospace',
      fontWeight: options && options.fontWeight ? options.fontWeight : 'normal',
      theme: options && options.theme ? options.theme : {}
    };
    this.cols = options && options.cols ? options.cols : 80;
    this.rows = options && options.rows ? options.rows : 24;
    this.scrollback = options && options.scrollback ? options.scrollback : 5000;
    this.element = null;
    this.textarea = null;
    this.wterm = null;
    this.disposed = false;
    this.selection = null;
    this.dataListeners = [];
    this.lineFeedListeners = [];
    this.scrollListeners = [];
    this.writeParsedListeners = [];
    this.customKeyEventHandler = null;
    this.buffer = { active: new WtermBuffer(this) };
    this.unicode = { activeVersion: '15.1' };
    this._core = {
      _oscLinkService: null,
      _renderService: { dimensions: { css: { cell: { width: 0, height: 15 } } } }
    };
    this.options = {};
    Object.defineProperties(this.options, {
      fontSize: {
        get: function() { return state.fontSize; },
        set: function(value) { state.fontSize = value; self._applyPresentation(state); }
      },
      fontFamily: {
        get: function() { return state.fontFamily; },
        set: function(value) { state.fontFamily = value; self._applyPresentation(state); }
      },
      theme: {
        get: function() { return state.theme; },
        set: function(value) { state.theme = value || {}; self._applyPresentation(state); }
      }
    });
    Object.defineProperty(this, 'modes', { get: function() {
      var core = self._terminalCore();
      return { bracketedPasteMode: !!(core && core.bracketedPaste()) };
    } });
    this._presentationState = state;
  }

  OrcaWtermTerminal.prototype._terminalCore = function() {
    return this.wterm && this.wterm.bridge ? this.wterm.bridge : null;
  };

  OrcaWtermTerminal.prototype._scrollbackCount = function() {
    var core = this._terminalCore();
    return core ? core.getScrollbackCount() : 0;
  };

  OrcaWtermTerminal.prototype._rowHeight = function() {
    return this._core._renderService.dimensions.css.cell.height || 15;
  };

  OrcaWtermTerminal.prototype._viewportRow = function() {
    if (!this.element) return 0;
    var height = this._rowHeight();
    var row = height > 0 ? Math.round(this.element.scrollTop / height) : 0;
    return Math.max(0, Math.min(this._scrollbackCount(), row));
  };

  OrcaWtermTerminal.prototype._cellAt = function(absRow, col) {
    var core = this._terminalCore();
    if (!core || col < 0 || col >= this.cols) return null;
    var baseY = core.getScrollbackCount();
    if (absRow < baseY) return core.getScrollbackCell(baseY - absRow - 1, col);
    var viewportRow = absRow - baseY;
    if (viewportRow < 0 || viewportRow >= this.rows) return null;
    return core.getCell(viewportRow, col);
  };

  OrcaWtermTerminal.prototype._applyPresentation = function(state) {
    if (!this.element) return;
    var style = this.element.style;
    var theme = state.theme || {};
    style.setProperty('--term-font-family', state.fontFamily);
    style.setProperty('--term-font-size', state.fontSize + 'px');
    style.setProperty('--term-fg', theme.foreground || '#c0caf5');
    style.setProperty('--term-bg', theme.background || '#1a1b26');
    style.setProperty('--term-cursor', theme.cursor || theme.foreground || '#c0caf5');
    style.setProperty('--orca-selection-bg', theme.selectionBackground || '#33467c');
    var names = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
      'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
    ];
    for (var i = 0; i < names.length; i++) {
      if (theme[names[i]]) style.setProperty('--term-color-' + i, theme[names[i]]);
    }
    this._syncMetrics();
  };

  OrcaWtermTerminal.prototype._syncMetrics = function() {
    if (!this.element) return;
    var probe = document.createElement('span');
    probe.textContent = 'W';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.fontFamily = this._presentationState.fontFamily;
    probe.style.fontSize = this._presentationState.fontSize + 'px';
    probe.style.fontWeight = this._presentationState.fontWeight;
    this.element.appendChild(probe);
    var rect = probe.getBoundingClientRect();
    probe.remove();
    var cell = this._core._renderService.dimensions.css.cell;
    if (rect.width > 0) cell.width = rect.width;
    var row = this.element.querySelector('.term-row');
    var rowRect = row ? row.getBoundingClientRect() : null;
    if (rowRect && rowRect.height > 0) cell.height = rowRect.height;
    else if (rect.height > 0) cell.height = Math.ceil(rect.height * 1.2);
    // Why: wterm locks the DOM height only during init; Orca resizes the PTY
    // repeatedly after measuring phone/tablet viewports.
    if (cell.height > 0) this.element.style.height = (this.rows * cell.height) + 'px';
  };

  OrcaWtermTerminal.prototype.open = async function(element) {
    this.element = element;
    this._applyPresentation(this._presentationState);
    var ghosttyCore = await window.GhosttyCore.load({
      wasmPath: WTERM_GHOSTTY_WASM_URL,
      scrollbackLimit: this.scrollback
    });
    var core = new OrcaGhosttyScrollbackCore(ghosttyCore, this.scrollback);
    if (this.disposed) return;
    var self = this;
    this.wterm = new window.WTerm(element, {
      core: core,
      cols: this.cols,
      rows: this.rows,
      autoResize: false,
      cursorBlink: false,
      onData: function(data) { self._fire(self.dataListeners, data); }
    });
    await this.wterm.init();
    if (this.disposed) { this.wterm.destroy(); return; }
    this.textarea = this.wterm.input ? this.wterm.input.textarea : null;
    if (this.textarea && this.customKeyEventHandler) this._attachCustomKeyBlocker();
    this._applyPresentation(this._presentationState);
    this._onScroll = function() { self._fire(self.scrollListeners, self._viewportRow()); };
    this.element.addEventListener('scroll', this._onScroll, { passive: true });
  };

  OrcaWtermTerminal.prototype._fire = function(listeners, value) {
    var copy = listeners.slice();
    for (var i = 0; i < copy.length; i++) {
      try { copy[i](value); } catch (e) {}
    }
  };

  OrcaWtermTerminal.prototype._event = function(list, listener) {
    var self = this;
    list.push(listener);
    return wtermDisposable(function() {
      var index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
    });
  };

  OrcaWtermTerminal.prototype.onData = function(listener) { return this._event(this.dataListeners, listener); };
  OrcaWtermTerminal.prototype.onLineFeed = function(listener) { return this._event(this.lineFeedListeners, listener); };
  OrcaWtermTerminal.prototype.onScroll = function(listener) { return this._event(this.scrollListeners, listener); };
  OrcaWtermTerminal.prototype.onWriteParsed = function(listener) { return this._event(this.writeParsedListeners, listener); };

  OrcaWtermTerminal.prototype._attachCustomKeyBlocker = function() {
    if (!this.textarea || this._customKeyBlocker) return;
    var self = this;
    this._customKeyBlocker = function(event) {
      if (!self.customKeyEventHandler || self.customKeyEventHandler(event) !== false) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.textarea.addEventListener('keydown', this._customKeyBlocker, true);
  };

  OrcaWtermTerminal.prototype.attachCustomKeyEventHandler = function(handler) {
    this.customKeyEventHandler = handler;
    this._attachCustomKeyBlocker();
  };

  OrcaWtermTerminal.prototype.write = function(data, callback) {
    if (!this.wterm) { if (callback) callback(); return; }
    this.wterm.write(data);
    var text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    for (var i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) this._fire(this.lineFeedListeners);
    }
    var self = this;
    setTimeout(function() {
      requestAnimationFrame(function() {
        self._syncMetrics();
        self._fire(self.writeParsedListeners);
        if (callback) callback();
      });
    }, 0);
  };

  OrcaWtermTerminal.prototype.resize = function(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    if (this.wterm) this.wterm.resize(cols, rows);
    var self = this;
    requestAnimationFrame(function() { self._syncMetrics(); });
  };

  OrcaWtermTerminal.prototype.scrollLines = function(lines) {
    if (!this.element) return;
    this.element.scrollTop += lines * this._rowHeight();
  };

  OrcaWtermTerminal.prototype.scrollToLine = function(line) {
    if (this.element) this.element.scrollTop = Math.max(0, line) * this._rowHeight();
  };

  OrcaWtermTerminal.prototype.scrollToBottom = function() {
    if (this.element) this.element.scrollTop = this.element.scrollHeight - this.element.clientHeight;
  };

  OrcaWtermTerminal.prototype._selectionText = function() {
    if (!this.selection) return '';
    var start = this.selection.start;
    var end = this.selection.end;
    var parts = [];
    for (var row = start.row; row <= end.row; row++) {
      var line = new WtermBufferLine(this, row);
      var from = row === start.row ? start.col : 0;
      var to = row === end.row ? end.col + 1 : this.cols;
      parts.push(wtermTrimRight(line.translateToString(false, from, to)));
    }
    return parts.join('\\n');
  };

  OrcaWtermTerminal.prototype.select = function(col, row, length) {
    var last = Math.max(0, row * this.cols + col + Math.max(1, length) - 1);
    this.selection = {
      start: { col: col, row: row },
      end: { col: last % this.cols, row: Math.floor(last / this.cols) }
    };
  };

  OrcaWtermTerminal.prototype.selectAll = function() {
    var length = this.buffer.active.length;
    this.selection = {
      start: { col: 0, row: 0 },
      end: { col: Math.max(0, this.cols - 1), row: Math.max(0, length - 1) }
    };
    var selection = window.getSelection();
    if (selection && this.element) {
      var range = document.createRange();
      range.selectNodeContents(this.element.querySelector('.term-grid') || this.element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  OrcaWtermTerminal.prototype.getSelection = function() { return this._selectionText(); };
  OrcaWtermTerminal.prototype.clearSelection = function() {
    this.selection = null;
    var selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  };
  OrcaWtermTerminal.prototype.refresh = function() {
    if (this.wterm && this.wterm._scheduleRender) this.wterm._scheduleRender();
  };
  OrcaWtermTerminal.prototype.clear = function() { this.write('\\x1b[2J\\x1b[3J\\x1b[H'); };
  OrcaWtermTerminal.prototype.reset = function() { this.write('\\x1bc'); };
  OrcaWtermTerminal.prototype.focus = function() { if (this.wterm) this.wterm.focus(); };
  OrcaWtermTerminal.prototype.loadAddon = function() {};
  OrcaWtermTerminal.prototype.dispose = function() {
    this.disposed = true;
    if (this.element && this._onScroll) this.element.removeEventListener('scroll', this._onScroll);
    if (this.textarea && this._customKeyBlocker) {
      this.textarea.removeEventListener('keydown', this._customKeyBlocker, true);
    }
    if (this.wterm) this.wterm.destroy();
    this.wterm = null;
    this.element = null;
  };

  window.Terminal = OrcaWtermTerminal;
`
