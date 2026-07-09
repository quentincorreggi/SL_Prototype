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
  sandImage: new Array(IMG_W * IMG_H),
  walls: []   // Brick Walls: [{ cells:[imgIdx...], threshold }]
};

// Brick Wall editor state — which wall the Brick Wall tool paints into.
var edSelectedWall = -1;

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

// --- Undo/redo stack (full level snapshots) ---
var edHistory = [];
var edHistoryIdx = -1;
var ED_HISTORY_LIMIT = 80;

function edInit() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edLevel.walls = [];
  edSelectedWall = -1;
  edBuildToolSidebar();
  edBuildSandGrid();
  edBuildToolbar();
  edBuildGrid();
  edBindSandPointer();
  edRefreshLiveSections();
  edHideTunnelPanel();
  edHistory = [];
  edHistoryIdx = -1;
  edPushHistory();
}

// ============================================================
// Undo / Redo — full snapshot per discrete edit (stroke, cell, etc.)
// ============================================================

function edCloneWall(w) {
  return {
    cells: (w.cells || []).slice(),
    threshold: Math.max(1, w.threshold | 0 || 1),
    color: (w.color | 0) || 0
  };
}

// Default trigger color for a new wall: first color present in the sand image.
function edDefaultWallColor() {
  var avail = edAvailableColors();
  return avail.length ? avail[0] : 0;
}

function edSnapshotState() {
  return {
    name: edLevel.name,
    desc: edLevel.desc,
    grid: edLevel.grid.map(cloneCellForLevel),
    sandImage: edLevel.sandImage.slice(),
    walls: (edLevel.walls || []).map(edCloneWall)
  };
}

function edPushHistory() {
  // Truncate any redo branch
  if (edHistoryIdx < edHistory.length - 1) {
    edHistory.length = edHistoryIdx + 1;
  }
  edHistory.push(edSnapshotState());
  if (edHistory.length > ED_HISTORY_LIMIT) {
    edHistory.shift();
  }
  edHistoryIdx = edHistory.length - 1;
}

function edRestoreState(s) {
  edLevel.name = s.name;
  edLevel.desc = s.desc;
  edLevel.grid = s.grid.map(cloneCellForLevel);
  edLevel.sandImage = s.sandImage.slice();
  edLevel.walls = (s.walls || []).map(edCloneWall);
  if (edSelectedWall >= edLevel.walls.length) edSelectedWall = edLevel.walls.length - 1;
  // Cancel any in-progress drag so a subsequent move event won't restore
  // the pre-drag snapshot over the just-restored state.
  edDragging = false;
  edDragMode = null;
  edDragStart = null;
  edDragLast = null;
  edSnapshot = null;
  var nameEl = document.getElementById('ed-name'); if (nameEl) nameEl.value = edLevel.name;
  var descEl = document.getElementById('ed-desc'); if (descEl) descEl.value = edLevel.desc;
  edRefreshSandGrid();
  edBuildToolSidebar();
  edBuildGrid();
  edBuildToolbar();
  edSelectedTunnel = -1;
  edHideTunnelPanel();
  edRefreshLiveSections();
}

function edUndo() {
  if (edHistoryIdx <= 0) return;
  edHistoryIdx--;
  edRestoreState(edHistory[edHistoryIdx]);
  edToast('Undo');
}

function edRedo() {
  if (edHistoryIdx >= edHistory.length - 1) return;
  edHistoryIdx++;
  edRestoreState(edHistory[edHistoryIdx]);
  edToast('Redo');
}

(function bindEditorShortcuts() {
  document.addEventListener('keydown', function (e) {
    var ed = document.getElementById('editor-screen');
    if (!ed || ed.classList.contains('hidden')) return;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    var k = (e.key || '').toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) edRedo(); else edUndo();
    } else if (k === 'y') {
      e.preventDefault();
      edRedo();
    }
  });
})();

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
    var s = stats.sand[ci] * (SAND_SUBDIV * SAND_SUBDIV || 1), b = stats.bkt[ci];
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
  { id: 'line',    icon: '╲', label: 'Line' },
  { id: 'brickwall', icon: '🧱', label: 'Brick Wall' }
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
    btn.onclick = function () { edSandMode = t.id; edBuildToolSidebar(); edRefreshSandGrid(); };
    sb.appendChild(btn);
  });

  // Brick Wall tool → wall management panel instead of size/color.
  if (edSandMode === 'brickwall') { edBuildWallPanel(sb); return; }

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
// Brick Wall tool — sidebar panel + painting
// ============================================================

var edWallStroke = 'paint';   // 'paint' | 'erase' during a Brick Wall drag

function edBuildWallPanel(sb) {
  var label = document.createElement('div');
  label.className = 'ed-tool-section-label';
  label.textContent = 'Brick Walls';
  sb.appendChild(label);

  var help = document.createElement('div');
  help.style.cssText = 'font-size:10px;color:#9C8A70;line-height:1.35;margin:0 2px 6px';
  help.textContent = 'Pick a wall, then paint tiles on the image to cover them. Right-click removes tiles. Sand under a wall is frozen until it breaks.';
  sb.appendChild(help);

  var addBtn = document.createElement('button');
  addBtn.className = 'ed-tool-btn';
  addBtn.style.cssText = 'width:100%;justify-content:center;margin-bottom:6px';
  addBtn.innerHTML = '<span class="ed-tool-icon">＋</span><span>New Wall</span>';
  addBtn.onclick = function () { edWallNewWall(); };
  sb.appendChild(addBtn);

  var walls = edLevel.walls || [];
  if (!walls.length) {
    var none = document.createElement('div');
    none.style.cssText = 'font-size:11px;color:#9C8A70;font-style:italic;text-align:center;padding:4px';
    none.textContent = 'No walls yet — click “New Wall”.';
    sb.appendChild(none);
    return;
  }

  for (var w = 0; w < walls.length; w++) {
    (function (wi) {
      var wall = walls[wi];
      var sel = (wi === edSelectedWall);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px;margin-bottom:4px;border-radius:6px;cursor:pointer;' +
        (sel ? 'background:rgba(181,86,58,0.35);outline:2px solid #b5563a;' : 'background:rgba(120,70,40,0.15);');
      row.onclick = function () { edWallSelect(wi); };

      var brick = document.createElement('span');
      brick.textContent = '🧱';
      brick.style.cssText = 'font-size:14px';
      row.appendChild(brick);

      var name = document.createElement('span');
      name.textContent = 'Wall ' + (wi + 1);
      name.style.cssText = 'font-size:11px;font-weight:bold;flex:1;color:#5A4A38';
      row.appendChild(name);

      var count = document.createElement('span');
      count.textContent = wall.cells.length + ' tiles';
      count.style.cssText = 'font-size:9px;color:#9C8A70';
      row.appendChild(count);

      // Trigger-color dot
      var wc = COLORS[wall.color | 0] || COLORS[0];
      var dot = document.createElement('span');
      dot.title = 'Trigger color: ' + CLR_NAMES[wall.color | 0];
      dot.style.cssText = 'width:12px;height:12px;border-radius:50%;flex:none;' +
        'background:' + wc.fill + ';box-shadow:0 0 0 1px rgba(0,0,0,0.35)';
      row.appendChild(dot);

      // Threshold stepper — ± buttons plus a directly-typeable number.
      var stepper = document.createElement('div');
      stepper.style.cssText = 'display:flex;align-items:center;gap:2px';
      var minus = document.createElement('button');
      minus.textContent = '−';
      minus.style.cssText = 'width:18px;height:18px;border:none;border-radius:4px;background:#c9b79a;cursor:pointer;font-weight:bold';
      minus.onclick = function (e) { e.stopPropagation(); edWallSetThreshold(wi, -1); };
      var val = document.createElement('input');
      val.type = 'number';
      val.min = '1';
      val.value = wall.threshold;
      val.title = 'Buckets to clear (type or use ± )';
      val.style.cssText = 'width:34px;height:18px;text-align:center;font-size:11px;font-weight:bold;color:#5A4A38;border:1px solid #c9b79a;border-radius:4px;padding:0';
      val.onclick = function (e) { e.stopPropagation(); };
      val.onchange = function (e) { e.stopPropagation(); edWallSetThresholdAbs(wi, parseInt(val.value, 10)); };
      var plus = document.createElement('button');
      plus.textContent = '+';
      plus.style.cssText = 'width:18px;height:18px;border:none;border-radius:4px;background:#c9b79a;cursor:pointer;font-weight:bold';
      plus.onclick = function (e) { e.stopPropagation(); edWallSetThreshold(wi, 1); };
      stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
      row.appendChild(stepper);

      var del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Delete wall';
      del.style.cssText = 'width:18px;height:18px;border:none;border-radius:4px;background:#d98a7a;color:#fff;cursor:pointer';
      del.onclick = function (e) { e.stopPropagation(); edWallDelete(wi); };
      row.appendChild(del);

      sb.appendChild(row);

      // Color picker for the selected wall — pick which bucket color breaks it.
      if (sel) {
        var pickWrap = document.createElement('div');
        pickWrap.style.cssText = 'padding:2px 4px 6px;margin-bottom:4px;background:rgba(181,86,58,0.12);border-radius:0 0 6px 6px';
        var pickLabel = document.createElement('div');
        pickLabel.textContent = 'Breaks when this color clears:';
        pickLabel.style.cssText = 'font-size:9px;color:#9C8A70;margin-bottom:3px';
        pickWrap.appendChild(pickLabel);
        var swatches = document.createElement('div');
        swatches.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px';
        var avail = edAvailableColors();
        if (!avail.length) for (var ac = 0; ac < NUM_COLORS; ac++) avail.push(ac);
        if (avail.indexOf(wall.color | 0) < 0) avail.push(wall.color | 0);
        avail.forEach(function (ci) {
          var sw = document.createElement('button');
          var cc = COLORS[ci];
          var on = (ci === (wall.color | 0));
          sw.title = CLR_NAMES[ci];
          sw.style.cssText = 'width:18px;height:18px;border-radius:4px;cursor:pointer;' +
            'background:linear-gradient(135deg,' + cc.light + ',' + cc.dark + ');' +
            (on ? 'outline:2px solid #2b2016;outline-offset:1px;border:none' : 'border:1px solid rgba(0,0,0,0.25)');
          sw.onclick = function (e) { e.stopPropagation(); edWallSetColor(wi, ci); };
          swatches.appendChild(sw);
        });
        pickWrap.appendChild(swatches);
        sb.appendChild(pickWrap);
      }
    })(w);
  }
}

function edWallNewWall() {
  edLevel.walls.push({ cells: [], threshold: 2, color: edDefaultWallColor() });
  edSelectedWall = edLevel.walls.length - 1;
  edBuildToolSidebar();
  edRefreshSandGrid();
  edPushHistory();
}

function edWallSelect(i) {
  edSelectedWall = i;
  edBuildToolSidebar();
  edRefreshSandGrid();
}

function edWallSetThresholdAbs(i, v) {
  var wall = edLevel.walls[i];
  if (!wall) return;
  if (isNaN(v)) v = wall.threshold;
  wall.threshold = Math.max(1, v | 0);
  edBuildToolSidebar();
  edRefreshSandGrid();
  edPushHistory();
}

function edWallSetThreshold(i, delta) {
  var wall = edLevel.walls[i];
  if (!wall) return;
  wall.threshold = Math.max(1, (wall.threshold | 0) + delta);
  edBuildToolSidebar();
  edRefreshSandGrid();
  edPushHistory();
}

function edWallDelete(i) {
  edLevel.walls.splice(i, 1);
  if (edSelectedWall >= edLevel.walls.length) edSelectedWall = edLevel.walls.length - 1;
  edBuildToolSidebar();
  edRefreshSandGrid();
  edPushHistory();
}

function edEnsureWall() {
  if (edSelectedWall < 0 || edSelectedWall >= edLevel.walls.length) {
    edLevel.walls.push({ cells: [], threshold: 2, color: edDefaultWallColor() });
    edSelectedWall = edLevel.walls.length - 1;
  }
}

function edWallSetColor(i, ci) {
  var wall = edLevel.walls[i];
  if (!wall) return;
  wall.color = ci | 0;
  edBuildToolSidebar();
  edRefreshSandGrid();
  edPushHistory();
}

// Which wall (index) owns this image tile, or -1.
function edWallOwnerOf(idx) {
  var walls = edLevel.walls || [];
  for (var w = 0; w < walls.length; w++) {
    if (walls[w].cells.indexOf(idx) >= 0) return w;
  }
  return -1;
}

// Returns true if the tile set changed.
function edWallPaintCell(idx, erase) {
  if (erase) {
    var o = edWallOwnerOf(idx);
    if (o < 0) return false;
    var arr = edLevel.walls[o].cells;
    arr.splice(arr.indexOf(idx), 1);
    return true;
  }
  edEnsureWall();
  var owner = edWallOwnerOf(idx);
  if (owner >= 0) return false;   // already covered (this or another wall) — no overlap
  edLevel.walls[edSelectedWall].cells.push(idx);
  return true;
}

function edWallApplyAt(pt) {
  var idx = pt.y * IMG_W + pt.x;
  if (edWallPaintCell(idx, edWallStroke === 'erase')) edRefreshSandGrid();
}

// Overlay wall tint + threshold badge onto the editor sand grid.
function edRenderEditorWalls() {
  if (!edSandCells.length) return;
  var walls = edLevel.walls || [];
  for (var w = 0; w < walls.length; w++) {
    var wall = walls[w];
    var sel = (w === edSelectedWall);
    var tint = sel ? 'rgba(181,86,58,0.72)' : 'rgba(110,70,45,0.5)';
    var edge = (COLORS[wall.color | 0] || COLORS[0]).fill;  // border = trigger color
    var minIdx = Infinity;
    for (var k = 0; k < wall.cells.length; k++) {
      var idx = wall.cells[k];
      var el = edSandCells[idx];
      if (!el) continue;
      el.style.backgroundImage = 'linear-gradient(' + tint + ',' + tint + ')';
      el.style.boxShadow = 'inset 0 0 0 1px ' + edge;
      if (idx < minIdx) minIdx = idx;
    }
    if (minIdx !== Infinity) {
      var bel = edSandCells[minIdx];
      bel.textContent = '' + wall.threshold;
      bel.style.color = '#fff';
      bel.style.fontSize = '7px';
      bel.style.fontWeight = 'bold';
      bel.style.lineHeight = '1';
      bel.style.textShadow = '0 0 2px #000,0 0 2px #000';
      bel.style.display = 'flex';
      bel.style.alignItems = 'center';
      bel.style.justifyContent = 'center';
    }
  }
}

// ============================================================
// Left pane — Sand image grid (built once, updated by style)
// ============================================================

function edBuildSandGrid() {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return;
  g.innerHTML = '';
  edSandCells = [];
  for (var i = 0; i < IMG_W * IMG_H; i++) {
    var px = document.createElement('div');
    px.className = 'ed-sand-px';
    edApplySandCell(px, edLevel.sandImage[i]);
    g.appendChild(px);
    edSandCells.push(px);
  }
  edRenderEditorWalls();
}

function edRefreshSandGrid() {
  if (edSandCells.length !== edLevel.sandImage.length) {
    edBuildSandGrid();
    return;
  }
  for (var i = 0; i < edSandCells.length; i++) {
    edApplySandCell(edSandCells[i], edLevel.sandImage[i]);
  }
  edRenderEditorWalls();
}

function edApplySandCell(el, ci) {
  if (ci == null || ci < 0) {
    el.style.background = '#F4ECDB';
  } else {
    el.style.background = COLORS[ci].fill;
  }
  // Clear any Brick Wall overlay styling (re-applied by edRenderEditorWalls).
  // Setting `background` shorthand above already clears background-image.
  el.style.boxShadow = '';
  if (el.textContent) el.textContent = '';
  el.style.display = '';
}

// Map a pointer event to sand-cell coords (clamped to bounds). Returns null
// if outside the canvas.
function pointerToSandCell(e) {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return null;
  var rect = g.getBoundingClientRect();
  var cellW = rect.width / IMG_W;
  var cellH = rect.height / IMG_H;
  var x = Math.floor((e.clientX - rect.left) / cellW);
  var y = Math.floor((e.clientY - rect.top) / cellH);
  if (x < 0 || x >= IMG_W || y < 0 || y >= IMG_H) return null;
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

  // Brick Wall tool paints tiles into the selected wall (right-click removes).
  if (edSandMode === 'brickwall') {
    edDragging = true;
    edDragMode = 'brickwall';
    edDragStart = pt;
    edDragLast = pt;
    edWallStroke = rightClick ? 'erase' : 'paint';
    edWallApplyAt(pt);
    return;
  }

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
    edPushHistory();
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

  if (edDragMode === 'brickwall') {
    edWallApplyAt(pt);
    edDragLast = pt;
    return;
  }
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
  var wasBrick = (edDragMode === 'brickwall');
  edDragging = false;
  edDragMode = null;
  edDragStart = null;
  edDragLast = null;
  edSnapshot = null;
  if (wasBrick) edBuildToolSidebar();   // refresh tile counts in the wall list
  edOnSandChanged();
  edPushHistory();
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
      if (x >= 0 && x < IMG_W && y >= 0 && y < IMG_H) {
        edLevel.sandImage[y * IMG_W + x] = ci;
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
  if (sx < 0 || sx >= IMG_W || sy < 0 || sy >= IMG_H) return;
  var target = edLevel.sandImage[sy * IMG_W + sx];
  if (target === ci) return;
  var stack = [[sx, sy]];
  while (stack.length > 0) {
    var p = stack.pop();
    var x = p[0], y = p[1];
    if (x < 0 || x >= IMG_W || y < 0 || y >= IMG_H) continue;
    var i = y * IMG_W + x;
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
      if (x >= 0 && x < IMG_W && y >= 0 && y < IMG_H) {
        edLevel.sandImage[y * IMG_W + x] = ci;
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
        if (x >= 0 && x < IMG_W && y >= 0 && y < IMG_H) {
          edLevel.sandImage[y * IMG_W + x] = ci;
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
    var newTunnel = false;
    if (!edLevel.grid[idx] || edLevel.grid[idx].kind !== 'tunnel') {
      edLevel.grid[idx] = { kind: 'tunnel', dir: 'top', contents: [] };
      newTunnel = true;
    }
    edSelectedTunnel = idx;
    edBuildGrid();
    edRefreshLiveSections();
    edShowTunnelPanel(idx);
    if (newTunnel) edPushHistory();
    return;
  }
  edSelectedTunnel = -1;
  edHideTunnelPanel();
  edBuildGrid();
  edRefreshLiveSections();
  edPushHistory();
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
    btn.onclick = function () { t.dir = d; edShowTunnelPanel(idx); edBuildGrid(); edPushHistory(); };
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
    btn.onclick = function () { t.contents.splice(i, 1); edShowTunnelPanel(idx); edBuildGrid(); edRefreshLiveSections(); edPushHistory(); };
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
        edShowTunnelPanel(idx); edBuildGrid(); edRefreshLiveSections(); edPushHistory();
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
  edLevel.walls = [];
  edSelectedWall = -1;
  edHideTunnelPanel();
  edBuildToolSidebar();
  edBuildGrid();
  edRefreshSandGrid();
  edBuildToolbar();
  edRefreshLiveSections();
  edPushHistory();
}

function edRandomSand() {
  var palette = edAvailableColors();
  if (palette.length === 0) palette = [0, 1, 2];
  for (var y = 0; y < IMG_H; y++) {
    var ci = palette[(y * palette.length / IMG_H) | 0];
    for (var x = 0; x < IMG_W; x++) {
      edLevel.sandImage[y * IMG_W + x] = ci;
    }
  }
  edRefreshSandGrid();
  edOnSandChanged();
  edPushHistory();
}

// ============================================================
// Preset images (4 / 5 / 6 / 7 colors)
// ============================================================

function edMakeStripes(colorIds) {
  var n = colorIds.length;
  var img = new Array(IMG_W * IMG_H);
  for (var y = 0; y < IMG_H; y++) {
    // Distribute bands evenly across IMG_H rows.
    var band = Math.min(n - 1, Math.floor(y * n / IMG_H));
    for (var x = 0; x < IMG_W; x++) {
      img[y * IMG_W + x] = colorIds[band];
    }
  }
  return img;
}

// Palette: 0 cyan, 1 amber, 2 magenta, 3 white, 4 blue, 5 lime,
// 6 forest, 7 pink, 8 red, 9 yellow, 10 violet, 11 crimson.
var ED_PRESETS = [
  { name: '4 colors', img: edMakeStripes([0, 1, 2, 3]) },
  { name: '5 colors', img: edMakeStripes([0, 3, 5, 1, 8]) },
  { name: '6 colors', img: edMakeStripes([4, 0, 5, 9, 1, 8]) },
  { name: '7 colors', img: edMakeStripes([10, 4, 0, 5, 9, 1, 8]) }
];

function edLoadPreset(idx) {
  var p = ED_PRESETS[idx];
  if (!p) return;
  edLevel.sandImage = p.img.slice();
  edLevel.walls = [];            // walls may reference tiles the preset replaced
  edSelectedWall = -1;
  edBuildToolSidebar();
  edRefreshSandGrid();
  edOnSandChanged();
  edPushHistory();
  edToast('Loaded ' + p.name);
}

// ============================================================
// PNG import — maps each pixel to the nearest palette colour
// ============================================================

var _palRGB = null;
function _paletteRGB() {
  if (_palRGB) return _palRGB;
  _palRGB = [];
  for (var i = 0; i < NUM_COLORS; i++) {
    var hex = COLORS[i].fill;
    _palRGB.push([
      parseInt(hex.substr(1, 2), 16),
      parseInt(hex.substr(3, 2), 16),
      parseInt(hex.substr(5, 2), 16)
    ]);
  }
  return _palRGB;
}

function nearestColorIndex(r, g, b) {
  var pal = _paletteRGB();
  var bestI = 0, bestD = Infinity;
  for (var i = 0; i < pal.length; i++) {
    var dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
    var d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

function edImportPNG(e) {
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  var url = URL.createObjectURL(f);
  var img = new Image();
  img.onload = function () {
    URL.revokeObjectURL(url);
    // Down-sample (or up-sample) any size to 32×32, no smoothing so
    // pixel-art colours stay crisp.
    var c = document.createElement('canvas');
    c.width = IMG_W;
    c.height = IMG_H;
    var cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, IMG_W, IMG_H);
    cx.drawImage(img, 0, 0, IMG_W, IMG_H);
    var data = cx.getImageData(0, 0, IMG_W, IMG_H).data;
    var seen = {};
    var seenCount = 0;
    for (var i = 0; i < IMG_W * IMG_H; i++) {
      var r = data[i * 4];
      var g = data[i * 4 + 1];
      var b = data[i * 4 + 2];
      var a = data[i * 4 + 3];
      if (a < 128) {
        edLevel.sandImage[i] = -1;
      } else {
        var key = (r << 16) | (g << 8) | b;
        if (!seen[key]) { seen[key] = 1; seenCount++; }
        edLevel.sandImage[i] = nearestColorIndex(r, g, b);
      }
    }
    edLevel.walls = [];   // fresh image — drop any walls tied to old tiles
    edSelectedWall = -1;
    edBuildToolSidebar();
    edRefreshSandGrid();
    edOnSandChanged();
    edPushHistory();
    if (seenCount > 12) {
      edToast('Imported (' + seenCount + ' colours → mapped to 12-colour palette)');
    } else {
      edToast('Imported PNG (' + seenCount + ' colour' + (seenCount === 1 ? '' : 's') + ')');
    }
    e.target.value = '';
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    edToast('Failed to load PNG');
    e.target.value = '';
  };
  img.src = url;
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
    sandImage: edLevel.sandImage.slice(),
    walls: (edLevel.walls || []).map(edCloneWall)
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
    sandImage: Array.from(edLevel.sandImage || []),
    walls: (edLevel.walls || []).map(edCloneWall)
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
    edLevel.sandImage = (data.sandImage || []).slice(0, IMG_W * IMG_H);
    while (edLevel.sandImage.length < IMG_W * IMG_H) edLevel.sandImage.push(-1);
    edLevel.walls = (data.walls || []).map(edCloneWall);
    edSelectedWall = edLevel.walls.length - 1;
    var nameEl = document.getElementById('ed-name'); if (nameEl) nameEl.value = edLevel.name;
    var descEl = document.getElementById('ed-desc'); if (descEl) descEl.value = edLevel.desc;
    edRefreshSandGrid();
    edBuildToolSidebar();
    edBuildGrid();
    edBuildToolbar();
    edRefreshLiveSections();
    ta.style.display = 'none';
    edToast('Imported.');
    edPushHistory();
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
