// ============================================================
// editor.js — Level editor (full-screen, two panes)
// ============================================================
// LEFT pane  — Sand Image (32×32) with tool sidebar:
//   - Tools: brush, eraser, fill, rect, ellipse, line
//   - Brush size (1–4)
//   - Color palette (2-column grid of 12 swatches)
// RIGHT pane — Bucket Grid (7×7):
//   - Live per-color capacity chips
//   - Type tabs (Bucket/Hidden/Tunnel/Wall/Erase) + color row
//     (color row restricted to colors present in the sand image)
//   - Tunnel sub-panel
//
// Capacity rule (from CLAUDE.md):
//   capacity[ci] = ceil(totalSandOfColor[ci] / totalBucketsOfColor[ci])
// Test Play is blocked if any sand color has no bucket.
// ============================================================

var edLevel = {
  name: 'Custom Level',
  desc: 'My custom level',
  grid: new Array(GRID_W * GRID_H),
  sandImage: new Array(SAND_W * SAND_H)
};

// --- Bucket-grid state ---
var edTool = 'default';     // 'default' | 'hidden' | 'tunnel' | 'wall' | 'erase'
var edColor = 0;            // selected bucket color (constrained to available)
var edSelectedTunnel = -1;

// --- Sand-image state ---
var edSandMode = 'brush';   // 'brush' | 'eraser' | 'fill' | 'rect' | 'ellipse' | 'line'
var edSandTool = 0;         // selected color
var edBrushSize = 1;
var edSandCells = [];       // cached <div> elements per sand cell

// --- Drag state (sand image) ---
var edDragging = false;
var edDragMode = null;
var edDragStart = null;     // {x, y} in sand-cell coords
var edDragLast = null;      // last point for brush stroke interpolation
var edSnapshot = null;      // sandImage array snapshot at drag start (for shape tools)

// --- Initialization state ---
var edInitialized = false;
var edPlayingFromEditor = false;

function edInit() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edBuildToolSidebar();
  edBuildSandGrid();
  edBuildToolbar();
  edBuildGrid();
  edBindSandPointer();
  edRefreshLiveSections();
  edHideTunnelPanel();
}

// ============================================================
// Counts / capacities / validation
// ============================================================

function edComputeCounts() {
  var sand = new Array(NUM_COLORS);
  var bkt  = new Array(NUM_COLORS);
  for (var i = 0; i < NUM_COLORS; i++) { sand[i] = 0; bkt[i] = 0; }
  for (var i = 0; i < edLevel.sandImage.length; i++) {
    var c = edLevel.sandImage[i];
    if (c >= 0 && c < NUM_COLORS) sand[c]++;
  }
  for (var i = 0; i < edLevel.grid.length; i++) {
    var cell = edLevel.grid[i];
    if (!cell) continue;
    if (cell.kind === 'bucket') bkt[cell.ci]++;
    else if (cell.kind === 'tunnel' && cell.contents) {
      for (var k = 0; k < cell.contents.length; k++) bkt[cell.contents[k].ci]++;
    }
  }
  return { sand: sand, bkt: bkt };
}

function edAvailableColors() {
  var stats = edComputeCounts();
  var out = [];
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    if (stats.sand[ci] > 0) out.push(ci);
  }
  return out;
}

function edValidate() {
  var stats = edComputeCounts();
  var errors = [];
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    if (stats.sand[ci] > 0 && stats.bkt[ci] === 0) {
      errors.push({ ci: ci, type: 'no-bucket', sand: stats.sand[ci] });
    }
  }
  return { ok: errors.length === 0, errors: errors, stats: stats };
}

function edRenderCapacities() {
  var el = document.getElementById('ed-capacities');
  if (!el) return;
  var stats = edComputeCounts();
  el.innerHTML = '';
  var anyVisible = false;
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    if (stats.sand[ci] === 0 && stats.bkt[ci] === 0) continue;
    anyVisible = true;
    var c = COLORS[ci];
    var s = stats.sand[ci], b = stats.bkt[ci];
    var cap = (s > 0 && b > 0) ? Math.ceil(s / b) : 0;
    var chip = document.createElement('div');
    chip.className = 'ed-cap-chip';
    var status = '';
    if (s > 0 && b === 0) {
      chip.classList.add('warn');
      status = '⚠ no bucket for ' + s + ' grains';
    } else if (s === 0 && b > 0) {
      chip.classList.add('dim');
      status = b + '× · no sand';
    } else {
      status = b + '× holds ' + cap + ' = ' + (b * cap) + ' (sand: ' + s + ')';
    }
    var dotStyle = 'background:linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
    chip.innerHTML =
      '<span class="ed-cap-dot" style="' + dotStyle + '"></span>' +
      '<span class="ed-cap-info">' + status + '</span>';
    el.appendChild(chip);
  }
  if (!anyVisible) {
    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#9C8A70;text-align:center;padding:6px';
    hint.textContent = 'Paint sand to see bucket capacities.';
    el.appendChild(hint);
  }
}

function edRenderTestPlayState() {
  var btn = document.getElementById('ed-test-play');
  if (!btn) return;
  var v = edValidate();
  if (v.ok) {
    btn.disabled = false;
    btn.classList.remove('disabled');
    btn.title = '';
  } else {
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.title = 'Add at least one bucket for every color in the sand image.';
  }
}

function edRefreshLiveSections() {
  edRenderCapacities();
  edRenderTestPlayState();
}

// ============================================================
// Left pane — Tool sidebar
// ============================================================

var SAND_TOOLS = [
  { id: 'brush',   icon: '✏', label: 'Brush' },
  { id: 'eraser',  icon: '✕', label: 'Erase' },
  { id: 'fill',    icon: '▣', label: 'Fill' },
  { id: 'rect',    icon: '◻', label: 'Rect' },
  { id: 'ellipse', icon: '○', label: 'Oval' },
  { id: 'line',    icon: '╲', label: 'Line' }
];
var BRUSH_SIZES = [1, 2, 3, 4];

function edBuildToolSidebar() {
  var sb = document.getElementById('ed-tool-sidebar');
  if (!sb) return;
  sb.innerHTML = '';

  // Tools
  var toolLabel = document.createElement('div');
  toolLabel.className = 'ed-tool-section-label';
  toolLabel.textContent = 'Tools';
  sb.appendChild(toolLabel);
  SAND_TOOLS.forEach(function (t) {
    var btn = document.createElement('button');
    btn.className = 'ed-tool-btn' + (edSandMode === t.id ? ' active' : '');
    btn.innerHTML = '<span class="ed-tool-icon">' + t.icon + '</span><span>' + t.label + '</span>';
    btn.title = t.label;
    btn.onclick = function () { edSandMode = t.id; edBuildToolSidebar(); };
    sb.appendChild(btn);
  });

  // Brush size
  var sizeLabel = document.createElement('div');
  sizeLabel.className = 'ed-tool-section-label';
  sizeLabel.textContent = 'Size';
  sb.appendChild(sizeLabel);
  var sizeRow = document.createElement('div');
  sizeRow.className = 'ed-size-row';
  BRUSH_SIZES.forEach(function (sz) {
    var btn = document.createElement('button');
    btn.className = 'ed-size-btn' + (edBrushSize === sz ? ' active' : '');
    btn.title = 'Brush size ' + sz;
    // Render a small dot whose size suggests the brush
    var dot = document.createElement('span');
    dot.className = 'ed-size-dot';
    var dpx = 4 + sz * 2;
    dot.style.width = dpx + 'px';
    dot.style.height = dpx + 'px';
    btn.appendChild(dot);
    btn.onclick = function () { edBrushSize = sz; edBuildToolSidebar(); };
    sizeRow.appendChild(btn);
  });
  sb.appendChild(sizeRow);

  // Colors (2-column grid)
  var clrLabel = document.createElement('div');
  clrLabel.className = 'ed-tool-section-label';
  clrLabel.textContent = 'Colors';
  sb.appendChild(clrLabel);
  var clrGrid = document.createElement('div');
  clrGrid.className = 'ed-color-grid';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var c = COLORS[ci];
    var btn = document.createElement('button');
    btn.className = 'ed-tool' + (edSandTool === ci ? ' active' : '');
    btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
    btn.title = CLR_NAMES[ci];
    btn.textContent = '';
    (function (idx) { btn.onclick = function () { edSandTool = idx; edBuildToolSidebar(); }; })(ci);
    clrGrid.appendChild(btn);
  }
  sb.appendChild(clrGrid);
}

// ============================================================
// Left pane — Sand image grid (built once, updated by style)
// ============================================================

function edBuildSandGrid() {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return;
  g.innerHTML = '';
  edSandCells = [];
  for (var i = 0; i < SAND_W * SAND_H; i++) {
    var px = document.createElement('div');
    px.className = 'ed-sand-px';
    edApplySandCell(px, edLevel.sandImage[i]);
    g.appendChild(px);
    edSandCells.push(px);
  }
}

function edRefreshSandGrid() {
  if (edSandCells.length !== edLevel.sandImage.length) {
    edBuildSandGrid();
    return;
  }
  for (var i = 0; i < edSandCells.length; i++) {
    edApplySandCell(edSandCells[i], edLevel.sandImage[i]);
  }
}

function edApplySandCell(el, ci) {
  if (ci == null || ci < 0) {
    el.style.background = '#F4ECDB';
  } else {
    el.style.background = COLORS[ci].fill;
  }
}

// Map a pointer event to sand-cell coords (clamped to bounds). Returns null
// if outside the canvas.
function pointerToSandCell(e) {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return null;
  var rect = g.getBoundingClientRect();
  var cellW = rect.width / SAND_W;
  var cellH = rect.height / SAND_H;
  var x = Math.floor((e.clientX - rect.left) / cellW);
  var y = Math.floor((e.clientY - rect.top) / cellH);
  if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) return null;
  return { x: x, y: y };
}

function edBindSandPointer() {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return;
  g.onpointerdown = onSandPointerDown;
  g.onpointermove = onSandPointerMove;
  g.onpointerup = onSandPointerUp;
  g.onpointercancel = onSandPointerUp;
  g.onpointerleave = function (e) { /* keep dragging via capture if set */ };
  g.oncontextmenu = function (e) { e.preventDefault(); };
}

function onSandPointerDown(e) {
  e.preventDefault();
  var pt = pointerToSandCell(e);
  if (!pt) return;
  var g = document.getElementById('ed-sand-grid');
  if (g.setPointerCapture) {
    try { g.setPointerCapture(e.pointerId); } catch (_) { }
  }
  // Right-click forces eraser regardless of current tool
  var rightClick = (e.button === 2 || e.buttons === 2);
  var mode = rightClick ? 'eraser' : edSandMode;
  var color = rightClick ? -1 : edSandTool;

  edDragging = true;
  edDragMode = mode;
  edDragStart = pt;
  edDragLast = pt;

  if (mode === 'fill') {
    floodFill(pt.x, pt.y, color);
    edRefreshSandGrid();
    edDragging = false; // single-shot
    edOnSandChanged();
    return;
  }
  if (mode === 'brush' || mode === 'eraser') {
    paintBrush(pt.x, pt.y, mode === 'eraser' ? -1 : color, edBrushSize);
    edRefreshSandGrid();
    return;
  }
  if (mode === 'rect' || mode === 'ellipse' || mode === 'line') {
    edSnapshot = edLevel.sandImage.slice();
    if (mode === 'line') {
      paintLine(pt.x, pt.y, pt.x, pt.y, color, edBrushSize);
    } else if (mode === 'rect') {
      drawRectShape(pt.x, pt.y, pt.x, pt.y, color);
    } else {
      drawEllipseShape(pt.x, pt.y, pt.x, pt.y, color);
    }
    edRefreshSandGrid();
    return;
  }
}

function onSandPointerMove(e) {
  if (!edDragging) return;
  var pt = pointerToSandCell(e);
  if (!pt) return;

  if (edDragMode === 'brush' || edDragMode === 'eraser') {
    var color = edDragMode === 'eraser' ? -1 : edSandTool;
    paintLine(edDragLast.x, edDragLast.y, pt.x, pt.y, color, edBrushSize);
    edDragLast = pt;
    edRefreshSandGrid();
    return;
  }
  if (edDragMode === 'rect' || edDragMode === 'ellipse' || edDragMode === 'line') {
    // Restore snapshot, then apply the shape from start to current pt
    edLevel.sandImage = edSnapshot.slice();
    var color = edSandTool;
    if (edDragMode === 'rect') {
      drawRectShape(edDragStart.x, edDragStart.y, pt.x, pt.y, color);
    } else if (edDragMode === 'ellipse') {
      drawEllipseShape(edDragStart.x, edDragStart.y, pt.x, pt.y, color);
    } else {
      paintLine(edDragStart.x, edDragStart.y, pt.x, pt.y, color, edBrushSize);
    }
    edRefreshSandGrid();
    return;
  }
}

function onSandPointerUp(e) {
  if (!edDragging) return;
  edDragging = false;
  edDragMode = null;
  edDragStart = null;
  edDragLast = null;
  edSnapshot = null;
  edOnSandChanged();
}

// ============================================================
// Painting tools (write to edLevel.sandImage)
// ============================================================

function paintBrush(cx, cy, ci, size) {
  var halfL = Math.floor((size - 1) / 2);
  var halfR = size - 1 - halfL;
  for (var dy = -halfL; dy <= halfR; dy++) {
    for (var dx = -halfL; dx <= halfR; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x >= 0 && x < SAND_W && y >= 0 && y < SAND_H) {
        edLevel.sandImage[y * SAND_W + x] = ci;
      }
    }
  }
}

// Bresenham line with brush at each step
function paintLine(x0, y0, x1, y1, ci, size) {
  var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1;
  var sy = y0 < y1 ? 1 : -1;
  var err = dx - dy;
  while (true) {
    paintBrush(x0, y0, ci, size);
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

// 4-connected flood fill
function floodFill(sx, sy, ci) {
  if (sx < 0 || sx >= SAND_W || sy < 0 || sy >= SAND_H) return;
  var target = edLevel.sandImage[sy * SAND_W + sx];
  if (target === ci) return;
  var stack = [[sx, sy]];
  while (stack.length > 0) {
    var p = stack.pop();
    var x = p[0], y = p[1];
    if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) continue;
    var i = y * SAND_W + x;
    if (edLevel.sandImage[i] !== target) continue;
    edLevel.sandImage[i] = ci;
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
}

function drawRectShape(x0, y0, x1, y1, ci) {
  var minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  var minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      if (x >= 0 && x < SAND_W && y >= 0 && y < SAND_H) {
        edLevel.sandImage[y * SAND_W + x] = ci;
      }
    }
  }
}

function drawEllipseShape(x0, y0, x1, y1, ci) {
  var minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  var minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;
  var rx = Math.max(0.5, (maxX - minX) / 2);
  var ry = Math.max(0.5, (maxY - minY) / 2);
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      var dx = (x - cx) / rx;
      var dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        if (x >= 0 && x < SAND_W && y >= 0 && y < SAND_H) {
          edLevel.sandImage[y * SAND_W + x] = ci;
        }
      }
    }
  }
}

function edOnSandChanged() {
  edBuildToolbar();      // available bucket colors may have changed
  edRefreshLiveSections();
}

// ============================================================
// Right pane — Bucket grid toolbar
// ============================================================

function edBuildToolbar() {
  var tb = document.getElementById('ed-toolbar');
  if (!tb) return;
  tb.innerHTML = '';

  var typeRow = document.createElement('div');
  typeRow.className = 'ed-type-row';
  var types = [
    { id: 'default', label: 'Bucket' },
    { id: 'hidden',  label: 'Hidden' },
    { id: 'tunnel',  label: 'Tunnel' },
    { id: 'wall',    label: 'Wall' },
    { id: 'erase',   label: 'Erase' }
  ];
  types.forEach(function (t) {
    var btn = document.createElement('button');
    btn.className = 'ed-type-btn' + (edTool === t.id ? ' active' : '');
    btn.textContent = t.label;
    btn.onclick = function () {
      edTool = t.id;
      edBuildToolbar();
      edBuildGrid();
      edHideTunnelPanel();
    };
    typeRow.appendChild(btn);
  });
  tb.appendChild(typeRow);

  if (edTool === 'default' || edTool === 'hidden') {
    var avail = edAvailableColors();
    if (avail.length === 0) {
      var msg = document.createElement('div');
      msg.style.cssText = 'font-size:11px;color:#9C8A70;font-style:italic;text-align:center;padding:4px';
      msg.textContent = 'Paint sand first to unlock bucket colors';
      tb.appendChild(msg);
    } else {
      if (avail.indexOf(edColor) < 0) edColor = avail[0];
      var clrRow = document.createElement('div');
      clrRow.className = 'ed-color-row';
      avail.forEach(function (ci) {
        var c = COLORS[ci];
        var btn = document.createElement('button');
        btn.className = 'ed-tool' + (edColor === ci ? ' active' : '');
        btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
        btn.title = CLR_NAMES[ci];
        btn.textContent = '';
        btn.onclick = function () { edColor = ci; edBuildToolbar(); };
        clrRow.appendChild(btn);
      });
      tb.appendChild(clrRow);
    }
  }
}

// ============================================================
// Right pane — Bucket grid
// ============================================================

function edBuildGrid() {
  var g = document.getElementById('ed-grid');
  if (!g) return;
  g.innerHTML = '';
  for (var i = 0; i < GRID_W * GRID_H; i++) {
    var cellDiv = document.createElement('div');
    cellDiv.className = 'ed-cell';
    edApplyCellStyle(cellDiv, edLevel.grid[i]);
    (function (idx, el) {
      el.onclick = function () { edPaintCell(idx, false); };
      el.oncontextmenu = function (e) { e.preventDefault(); edPaintCell(idx, true); };
    })(i, cellDiv);
    g.appendChild(cellDiv);
  }
}

function edApplyCellStyle(el, cell) {
  el.innerHTML = '';
  el.style.background = 'rgba(180,165,145,0.25)';
  el.style.borderColor = 'rgba(160,140,120,0.3)';
  if (!cell) return;
  if (cell.kind === 'wall') {
    el.style.background = 'linear-gradient(135deg,#A89B88,#7C705F)';
    el.style.borderColor = '#5A4A38';
    el.innerHTML = '<span class="ed-cell-dot">▦</span>';
    return;
  }
  if (cell.kind === 'tunnel') {
    el.style.background = 'linear-gradient(135deg,#5A5460,#28232A)';
    el.style.borderColor = '#1A171C';
    var arrow = { top: '↑', bottom: '↓', left: '←', right: '→' }[cell.dir || 'top'];
    el.innerHTML = '<span class="ed-cell-dot">' + arrow + '</span>';
    var n = (cell.contents || []).length;
    if (n > 0) {
      var b = document.createElement('span');
      b.className = 'ed-tunnel-badge';
      b.textContent = n;
      el.appendChild(b);
    }
    return;
  }
  if (cell.kind === 'bucket') {
    var type = getBucketType(cell.type);
    var st = type.editorCellStyle(cell.ci);
    el.style.background = st.background;
    el.style.borderColor = st.borderColor;
    el.innerHTML = type.editorCellHTML(cell.ci);
  }
}

function edPaintCell(idx, eraseOverride) {
  if (eraseOverride || edTool === 'erase') {
    edLevel.grid[idx] = null;
  } else if (edTool === 'default' || edTool === 'hidden') {
    if (edAvailableColors().length === 0) {
      edToast('Paint sand first.');
      return;
    }
    edLevel.grid[idx] = { kind: 'bucket', type: edTool, ci: edColor };
  } else if (edTool === 'wall') {
    edLevel.grid[idx] = { kind: 'wall' };
  } else if (edTool === 'tunnel') {
    if (!edLevel.grid[idx] || edLevel.grid[idx].kind !== 'tunnel') {
      edLevel.grid[idx] = { kind: 'tunnel', dir: 'top', contents: [] };
    }
    edSelectedTunnel = idx;
    edBuildGrid();
    edRefreshLiveSections();
    edShowTunnelPanel(idx);
    return;
  }
  edSelectedTunnel = -1;
  edHideTunnelPanel();
  edBuildGrid();
  edRefreshLiveSections();
}

// ============================================================
// Tunnel sub-panel
// ============================================================

function edShowTunnelPanel(idx) {
  var panel = document.getElementById('ed-tunnel-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '';
  var t = edLevel.grid[idx];
  if (!t || t.kind !== 'tunnel') return;

  var h = document.createElement('div');
  h.className = 'ed-section-title';
  h.innerHTML = '<span class="icon">⟶</span> Tunnel at row ' +
    ((idx / GRID_W) | 0) + ', col ' + (idx % GRID_W);
  panel.appendChild(h);

  var dirRow = document.createElement('div');
  dirRow.className = 'ed-tunnel-dir-row';
  ['top', 'bottom', 'left', 'right'].forEach(function (d) {
    var btn = document.createElement('button');
    btn.className = 'ed-tunnel-dir-btn' + (t.dir === d ? ' active' : '');
    btn.textContent = d[0].toUpperCase() + d.slice(1);
    btn.onclick = function () { t.dir = d; edShowTunnelPanel(idx); edBuildGrid(); };
    dirRow.appendChild(btn);
  });
  panel.appendChild(dirRow);

  var contentsLabel = document.createElement('div');
  contentsLabel.style.cssText = 'font-size:11px;color:#5A4A38;margin:6px 0 2px';
  contentsLabel.textContent = 'Contents (spawn order, top → bottom):';
  panel.appendChild(contentsLabel);

  var contentsList = document.createElement('div');
  contentsList.className = 'ed-tunnel-contents';
  (t.contents || []).forEach(function (item, i) {
    var c = COLORS[item.ci];
    var btn = document.createElement('div');
    btn.className = 'ed-tunnel-item';
    btn.style.background = item.type === 'hidden'
      ? 'linear-gradient(135deg,#5A5460,#2A2530)'
      : 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
    btn.textContent = item.type === 'hidden' ? '?' : '';
    btn.title = CLR_NAMES[item.ci] + ' — click to remove';
    btn.onclick = function () { t.contents.splice(i, 1); edShowTunnelPanel(idx); edBuildGrid(); edRefreshLiveSections(); };
    contentsList.appendChild(btn);
  });
  panel.appendChild(contentsList);

  var avail = edAvailableColors();
  if (avail.length === 0) {
    var msg = document.createElement('div');
    msg.style.cssText = 'font-size:11px;color:#9C8A70;font-style:italic';
    msg.textContent = 'Paint sand first to unlock tunnel contents.';
    panel.appendChild(msg);
    return;
  }
  ['default', 'hidden'].forEach(function (type) {
    var label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:#5A4A38;margin:6px 0 2px';
    label.textContent = 'Add ' + (type === 'hidden' ? 'hidden' : 'bucket') + ':';
    panel.appendChild(label);
    var row = document.createElement('div');
    row.className = 'ed-tunnel-add-colors';
    avail.forEach(function (ci) {
      var c = COLORS[ci];
      var btn = document.createElement('button');
      btn.className = 'ed-tunnel-add-clr';
      btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
      btn.textContent = type === 'hidden' ? '?' : '';
      btn.title = CLR_NAMES[ci];
      btn.onclick = function () {
        if (!t.contents) t.contents = [];
        t.contents.push({ type: type, ci: ci });
        edShowTunnelPanel(idx); edBuildGrid(); edRefreshLiveSections();
      };
      row.appendChild(btn);
    });
    panel.appendChild(row);
  });
}

function edHideTunnelPanel() {
  var panel = document.getElementById('ed-tunnel-panel');
  if (panel) panel.style.display = 'none';
}

// ============================================================
// Quick actions
// ============================================================

function edClearAll() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edHideTunnelPanel();
  edBuildGrid();
  edRefreshSandGrid();
  edBuildToolbar();
  edRefreshLiveSections();
}

function edRandomSand() {
  var palette = edAvailableColors();
  if (palette.length === 0) palette = [0, 1, 2];
  for (var y = 0; y < SAND_H; y++) {
    var ci = palette[(y * palette.length / SAND_H) | 0];
    for (var x = 0; x < SAND_W; x++) {
      edLevel.sandImage[y * SAND_W + x] = ci;
    }
  }
  edRefreshSandGrid();
  edOnSandChanged();
}

// ============================================================
// Screens / Test Play / Export / Import
// ============================================================

function showEditor() {
  if (!edInitialized) {
    edInit();
    edInitialized = true;
  }
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.add('hidden');
  if (ed) ed.classList.remove('hidden');
}

function editorBack() {
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.remove('hidden');
  if (ed) ed.classList.add('hidden');
}

function editorSetName(v) { edLevel.name = v; }
function editorSetDesc(v) { edLevel.desc = v; }

function editorTestPlay() {
  var v = edValidate();
  if (!v.ok) {
    var first = v.errors[0];
    edToast('Add a ' + CLR_NAMES[first.ci] + ' bucket — ' + first.sand + ' grains have nowhere to go.');
    return;
  }
  edPlayingFromEditor = true;
  var ed = document.getElementById('editor-screen');
  var ls = document.getElementById('level-screen');
  if (ed) ed.classList.add('hidden');
  if (ls) ls.classList.add('hidden');
  initGame({
    name: edLevel.name,
    desc: edLevel.desc,
    grid: edLevel.grid.map(cloneCellForLevel),
    sandImage: edLevel.sandImage.slice()
  });
}

function cloneCellForLevel(c) {
  if (!c) return null;
  if (c.kind === 'wall') return { kind: 'wall' };
  if (c.kind === 'tunnel') {
    return {
      kind: 'tunnel',
      dir: c.dir,
      contents: (c.contents || []).map(function (b) { return { type: b.type, ci: b.ci }; })
    };
  }
  return { kind: 'bucket', type: c.type, ci: c.ci };
}

function editorExportJSON() {
  var ta = document.getElementById('ed-export-area');
  if (!ta) return;
  ta.style.display = 'block';
  ta.value = JSON.stringify({
    name: edLevel.name,
    desc: edLevel.desc,
    grid: edLevel.grid,
    sandImage: Array.from(edLevel.sandImage || [])
  });
  ta.select();
  edToast('Exported — select + copy.');
}

function editorImportJSON() {
  var ta = document.getElementById('ed-export-area');
  if (!ta) return;
  if (ta.style.display !== 'block') {
    ta.style.display = 'block';
    ta.value = '';
    ta.placeholder = 'Paste exported level JSON here, then click Import again.';
    ta.focus();
    return;
  }
  try {
    var data = JSON.parse(ta.value);
    edLevel.name = data.name || 'Imported';
    edLevel.desc = data.desc || '';
    edLevel.grid = (data.grid || []).slice(0, GRID_W * GRID_H);
    while (edLevel.grid.length < GRID_W * GRID_H) edLevel.grid.push(null);
    edLevel.sandImage = (data.sandImage || []).slice(0, SAND_W * SAND_H);
    while (edLevel.sandImage.length < SAND_W * SAND_H) edLevel.sandImage.push(-1);
    var nameEl = document.getElementById('ed-name'); if (nameEl) nameEl.value = edLevel.name;
    var descEl = document.getElementById('ed-desc'); if (descEl) descEl.value = edLevel.desc;
    edRefreshSandGrid();
    edBuildGrid();
    edBuildToolbar();
    edRefreshLiveSections();
    ta.style.display = 'none';
    edToast('Imported.');
  } catch (e) {
    edToast('Invalid JSON.');
  }
}

function edToast(msg) {
  var t = document.getElementById('ed-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 1600);
}
