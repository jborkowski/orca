// Custom cell-range highlight for wterm. Orca owns selection handles and copy
// semantics, so this visual follows the same absolute-buffer coordinates.
export const TERMINAL_SELECTION_RANGES_JS = `
  function clearSelectionRanges() {
    selectionRanges.innerHTML = '';
  }

  function paintSelectionRanges(selectedRange) {
    clearSelectionRanges();
    var firstVisibleRow = Math.max(selectedRange.start.row, term.buffer.active.viewportY);
    var lastVisibleRow = Math.min(
      selectedRange.end.row,
      term.buffer.active.viewportY + term.rows - 1
    );
    var totalScale = getTotalScale();
    var visibleCellWidth = getCellWidth() * totalScale;
    var visibleCellHeight = getCellHeight() * totalScale;
    for (var row = firstVisibleRow; row <= lastVisibleRow; row++) {
      var fromCol = row === selectedRange.start.row ? selectedRange.start.col : 0;
      var toCol = row === selectedRange.end.row ? selectedRange.end.col + 1 : term.cols;
      var origin = cellToViewportPx(fromCol, row);
      var range = document.createElement('div');
      range.className = 'sel-range';
      range.style.left = origin.x + 'px';
      range.style.top = origin.y + 'px';
      range.style.width = Math.max(
        visibleCellWidth,
        (toCol - fromCol) * visibleCellWidth
      ) + 'px';
      range.style.height = visibleCellHeight + 'px';
      selectionRanges.appendChild(range);
    }
  }

  function repositionOverlay() {
    if (selMode !== 'select' || !sel || !term) return;
    var selectedRange = selRange();
    paintSelectionRanges(selectedRange);
    var startPx = cellToViewportPx(selectedRange.start.col, selectedRange.start.row);
    var endPx = cellToViewportPx(selectedRange.end.col + 1, selectedRange.end.row);
    var cellHeight = getCellHeight() * getTotalScale();
    handleStart.style.left = startPx.x + 'px';
    handleStart.style.top = startPx.y + 'px';
    handleEnd.style.left = endPx.x + 'px';
    handleEnd.style.top = (endPx.y + cellHeight) + 'px';
    var startVisible = startPx.y >= 0 && startPx.y <= window.innerHeight;
    var endVisible = endPx.y >= 0 && endPx.y <= window.innerHeight;
    handleStart.style.visibility = startVisible ? 'visible' : 'hidden';
    handleEnd.style.visibility = endVisible ? 'visible' : 'hidden';
    var menuCenterX, menuY, verticalTransform, marginTop;
    if (startVisible && startPx.y > 56) {
      menuCenterX = startPx.x; menuY = startPx.y;
      verticalTransform = 'translateY(-100%)'; marginTop = '-12px';
    } else if (endVisible && endPx.y + cellHeight + 56 < window.innerHeight) {
      menuCenterX = endPx.x; menuY = endPx.y + cellHeight;
      verticalTransform = 'translateY(0)'; marginTop = '12px';
    } else {
      menuCenterX = window.innerWidth / 2; menuY = window.innerHeight / 2;
      verticalTransform = 'translateY(-50%)'; marginTop = '0';
    }
    selMenu.style.transform = verticalTransform;
    selMenu.style.marginTop = marginTop;
    selMenu.style.top = menuY + 'px';
    selMenu.style.left = '0px';
    var edgeMargin = 8;
    var menuWidth = selMenu.offsetWidth || 0;
    var maxLeft = Math.max(edgeMargin, window.innerWidth - menuWidth - edgeMargin);
    var desiredLeft = menuCenterX - menuWidth / 2;
    selMenu.style.left = Math.max(edgeMargin, Math.min(maxLeft, desiredLeft)) + 'px';
  }
`
