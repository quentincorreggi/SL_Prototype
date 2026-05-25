// ============================================================
// editor.js — Level editor
// ============================================================
// Owns the editor UI:
//   - 7×7 grid painter (default/hidden bucket, tunnel, wall, eraser)
//   - 32×32 sand image painter
//   - Tunnel sub-panel (direction + contents queue)
//   - Test Play handoff to game.js
//   - Export / Import JSON
// ============================================================

var edLevel = {
  name: 'Custom Level',
  desc: 'My custom level',
  grid: new Array(GRID_W * GRID_H),
  sandImage: new Array(SAND_W * SAND_H)
};

var edTool = 'default';     // 'default' | 'hidden' | 'tunnel' | 'wall' | 'erase'
var edColor = 0;            // selected color index
var edSandTool = 0;         // selected color (or -1 for erase)
var edSelectedTunnel = -1;  // grid index of currently-edited tunnel

function edInit() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edBuildToolbar();
  edBuildSandToolbar();
  edBuildGrid();
  edBuildSandGrid();
  edUpdateStats();
  edHideTunnelPanel();
}

// === Toolbars ===========================================================

function edBuildToolbar() {
  var tb = document.getElementById('ed-toolbar');
  if (!tb) return;
  tb.innerHTML = '';

  // Type tabs
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
    btn.onclick = function () { edTool = t.id; edBuildToolbar(); edBuildGrid(); edHideTunnelPanel(); };
    typeRow.appendChild(btn);
  });
  tb.appendChild(typeRow);

  // Color swatches (only when tool needs a color)
  if (edTool === 'default' || edTool === 'hidden') {
    var clrRow = document.createElement('div');
    clrRow.className = 'ed-color-row';
    for (var ci = 0; ci < NUM_COLORS; ci++) {
      var c = COLORS[ci];
      var btn = document.createElement('button');
      btn.className = 'ed-tool' + (edColor === ci ? ' active' : '');
      btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
      btn.textContent = CLR_NAMES[ci][0].toUpperCase();
      (function (idx) { btn.onclick = function () { edColor = idx; edBuildToolbar(); }; })(ci);
      clrRow.appendChild(btn);
    }
    tb.appendChild(clrRow);
  }
}

function edBuildSandToolbar() {
  var tb = document.getElementById('ed-sand-toolbar');
  if (!tb) return;
  tb.innerHTML = '';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var c = COLORS[ci];
    var btn = document.createElement('button');
    btn.className = 'ed-tool' + (edSandTool === ci ? ' active' : '');
    btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
    btn.textContent = CLR_NAMES[ci][0].toUpperCase();
    (function (idx) { btn.onclick = function () { edSandTool = idx; edBuildSandToolbar(); }; })(ci);
    tb.appendChild(btn);
  }
  // Eraser
  var er = document.createElement('button');
  er.className = 'ed-tool' + (edSandTool === -1 ? ' active' : '');
  er.style.background = 'linear-gradient(135deg,#fff,#bbb)';
  er.style.color = '#5A4A38';
  er.textContent = '×';
  er.onclick = function () { edSandTool = -1; edBuildSandToolbar(); };
  tb.appendChild(er);
}

// === Grid painter =======================================================

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
    edLevel.grid[idx] = { kind: 'bucket', type: edTool, ci: edColor };
  } else if (edTool === 'wall') {
    edLevel.grid[idx] = { kind: 'wall' };
  } else if (edTool === 'tunnel') {
    if (!edLevel.grid[idx] || edLevel.grid[idx].kind !== 'tunnel') {
      edLevel.grid[idx] = { kind: 'tunnel', dir: 'top', contents: [] };
    }
    edSelectedTunnel = idx;
    edBuildGrid();
    edUpdateStats();
    edShowTunnelPanel(idx);
    return;
  }
  edSelectedTunnel = -1;
  edHideTunnelPanel();
  edBuildGrid();
  edUpdateStats();
}

// === Sand image painter =================================================

function edBuildSandGrid() {
  var g = document.getElementById('ed-sand-grid');
  if (!g) return;
  g.innerHTML = '';
  g.style.gridTemplateColumns = 'repeat(' + SAND_W + ',1fr)';
  for (var i = 0; i < SAND_W * SAND_H; i++) {
    var px = document.createElement('div');
    px.className = 'ed-sand-px';
    edApplySandCell(px, edLevel.sandImage[i]);
    (function (idx, el) {
      var paint = function (e) {
        if (e && e.buttons === 2) edLevel.sandImage[idx] = -1;
        else if (e && e.button === 2) edLevel.sandImage[idx] = -1;
        else edLevel.sandImage[idx] = edSandTool;
        edApplySandCell(el, edLevel.sandImage[idx]);
        edUpdateStats();
      };
      el.onmousedown = paint;
      el.onmouseenter = function (e) { if (e.buttons === 1 || e.buttons === 2) paint(e); };
      el.oncontextmenu = function (e) { e.preventDefault(); edLevel.sandImage[idx] = -1; edApplySandCell(el, edLevel.sandImage[idx]); edUpdateStats(); };
      el.ontouchstart = function (e) { e.preventDefault(); paint({ buttons: 1 }); };
    })(i, px);
    g.appendChild(px);
  }
}

function edApplySandCell(el, ci) {
  if (ci == null || ci < 0) {
    el.style.background = '#F4ECDB';
  } else {
    el.style.background = COLORS[ci].fill;
  }
}

// === Tunnel sub-panel ===================================================

function edShowTunnelPanel(idx) {
  var panel = document.getElementById('ed-tunnel-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '';
  var t = edLevel.grid[idx];
  if (!t || t.kind !== 'tunnel') return;

  // Title
  var h = document.createElement('div');
  h.className = 'ed-section-title';
  h.innerHTML = '<span class="icon">⟶</span> Tunnel at row ' +
    ((idx / GRID_W) | 0) + ', col ' + (idx % GRID_W);
  panel.appendChild(h);

  // Direction
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

  // Contents
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
    btn.textContent = item.type === 'hidden' ? '?' : CLR_NAMES[item.ci][0].toUpperCase();
    btn.title = 'Click to remove';
    btn.onclick = function () { t.contents.splice(i, 1); edShowTunnelPanel(idx); edBuildGrid(); };
    contentsList.appendChild(btn);
  });
  panel.appendChild(contentsList);

  // Add row
  ['default', 'hidden'].forEach(function (type) {
    var label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:#5A4A38;margin:6px 0 2px';
    label.textContent = 'Add ' + (type === 'hidden' ? 'hidden' : 'bucket') + ':';
    panel.appendChild(label);
    var row = document.createElement('div');
    row.className = 'ed-tunnel-add-colors';
    for (var ci = 0; ci < NUM_COLORS; ci++) {
      var c = COLORS[ci];
      var btn = document.createElement('button');
      btn.className = 'ed-tunnel-add-clr';
      btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
      btn.textContent = type === 'hidden' ? '?' : CLR_NAMES[ci][0].toUpperCase();
      (function (typ, color) {
        btn.onclick = function () {
          if (!t.contents) t.contents = [];
          t.contents.push({ type: typ, ci: color });
          edShowTunnelPanel(idx); edBuildGrid();
        };
      })(type, ci);
      row.appendChild(btn);
    }
    panel.appendChild(row);
  });
}

function edHideTunnelPanel() {
  var panel = document.getElementById('ed-tunnel-panel');
  if (panel) panel.style.display = 'none';
}

// === Stats / quick actions ==============================================

function edUpdateStats() {
  var el = document.getElementById('ed-stats');
  if (!el) return;
  var bucketCount = 0, sandCount = 0;
  var perColor = new Array(NUM_COLORS); for (var i = 0; i < NUM_COLORS; i++) perColor[i] = 0;
  for (var i = 0; i < edLevel.grid.length; i++) {
    var cell = edLevel.grid[i];
    if (!cell) continue;
    if (cell.kind === 'bucket') { bucketCount++; perColor[cell.ci]++; }
    if (cell.kind === 'tunnel' && cell.contents) {
      cell.contents.forEach(function (c) { bucketCount++; perColor[c.ci]++; });
    }
  }
  for (var i = 0; i < edLevel.sandImage.length; i++) {
    if (edLevel.sandImage[i] >= 0) sandCount++;
  }
  // Validate: per color, sand grains must fit in buckets (bucketCount * cap)
  var totalCapacity = bucketCount * BUCKET_CAPACITY;
  var warn = '';
  if (sandCount > totalCapacity) {
    warn = '<div class="ed-stat-warn">⚠ Sand exceeds bucket capacity (' +
           sandCount + ' grains > ' + totalCapacity + ' total slots)</div>';
  }
  // Check per-color match
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var sandOfColor = 0;
    for (var k = 0; k < edLevel.sandImage.length; k++) if (edLevel.sandImage[k] === ci) sandOfColor++;
    if (sandOfColor > perColor[ci] * BUCKET_CAPACITY) {
      warn += '<div class="ed-stat-warn">⚠ Not enough ' + CLR_NAMES[ci] +
              ' buckets (' + sandOfColor + ' grains vs ' + (perColor[ci] * BUCKET_CAPACITY) + ' capacity)</div>';
    }
  }
  el.innerHTML = '<span class="ed-stat-total">' + bucketCount + ' buckets · ' +
                 sandCount + ' grains</span>' + warn;
}

function edClearAll() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edHideTunnelPanel();
  edBuildGrid();
  edBuildSandGrid();
  edUpdateStats();
}

function edRandomSand() {
  // Fill sand with a horizontal-stripe pattern using whichever colors have buckets.
  var palette = [];
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var n = 0;
    for (var i = 0; i < edLevel.grid.length; i++) {
      var cell = edLevel.grid[i];
      if (cell && cell.kind === 'bucket' && cell.ci === ci) n++;
      if (cell && cell.kind === 'tunnel' && cell.contents) {
        cell.contents.forEach(function (b) { if (b.ci === ci) n++; });
      }
    }
    if (n > 0) palette.push(ci);
  }
  if (palette.length === 0) palette = [0, 1, 2];
  for (var y = 0; y < SAND_H; y++) {
    var ci = palette[(y * palette.length / SAND_H) | 0];
    for (var x = 0; x < SAND_W; x++) {
      edLevel.sandImage[y * SAND_W + x] = ci;
    }
  }
  edBuildSandGrid();
  edUpdateStats();
}

// === Screens ============================================================

function showEditor() {
  edInit();
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
  edToast('Copied to box. Select + copy.');
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
    edBuildGrid();
    edBuildSandGrid();
    edUpdateStats();
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
