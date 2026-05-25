// ============================================================
// editor.js — Level editor
// ============================================================
// Owns the editor UI:
//   - 32×32 sand image painter   (top — paint first)
//   - Per-color capacity panel   (live readout: buckets × capacity = total)
//   - 7×7 grid painter           (bucket colors restricted to sand colors)
//   - Tunnel sub-panel
//   - Test Play handoff to game.js
//   - Export / Import JSON
//
// Rule (per spec): bucket capacity is derived, not fixed —
//   capacity[ci] = ceil(totalSandOfColor[ci] / totalBucketsOfColor[ci])
// Every color present in the sand image must have at least one bucket.
// ============================================================

var edLevel = {
  name: 'Custom Level',
  desc: 'My custom level',
  grid: new Array(GRID_W * GRID_H),
  sandImage: new Array(SAND_W * SAND_H)
};

var edTool = 'default';     // 'default' | 'hidden' | 'tunnel' | 'wall' | 'erase'
var edColor = 0;            // selected color index (constrained to available)
var edSandTool = 0;         // selected sand color (or -1 for erase)
var edSelectedTunnel = -1;  // grid index of currently-edited tunnel

function edInit() {
  for (var i = 0; i < edLevel.grid.length; i++) edLevel.grid[i] = null;
  for (var i = 0; i < edLevel.sandImage.length; i++) edLevel.sandImage[i] = -1;
  edBuildSandToolbar();
  edBuildSandGrid();
  edBuildToolbar();
  edBuildGrid();
  edRefreshLiveSections();
  edHideTunnelPanel();
}

// ============================================================
// Live recompute — capacities, validation, displays
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
  // Colors that have at least one sand grain in the image.
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
    hint.textContent = 'Paint sand above to see bucket capacities.';
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
// Toolbars
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

  // Color swatches — restricted to colors present in sand.
  if (edTool === 'default' || edTool === 'hidden') {
    var avail = edAvailableColors();
    if (avail.length === 0) {
      var msg = document.createElement('div');
      msg.style.cssText = 'font-size:11px;color:#9C8A70;font-style:italic;text-align:center;padding:4px';
      msg.textContent = 'Paint sand above to unlock bucket colors';
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

function edBuildSandToolbar() {
  var tb = document.getElementById('ed-sand-toolbar');
  if (!tb) return;
  tb.innerHTML = '';
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    var c = COLORS[ci];
    var btn = document.createElement('button');
    btn.className = 'ed-tool' + (edSandTool === ci ? ' active' : '');
    btn.style.background = 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')';
    btn.title = CLR_NAMES[ci];
    btn.textContent = '';
    (function (idx) { btn.onclick = function () { edSandTool = idx; edBuildSandToolbar(); }; })(ci);
    tb.appendChild(btn);
  }
  var er = document.createElement('button');
  er.className = 'ed-tool' + (edSandTool === -1 ? ' active' : '');
  er.style.background = 'linear-gradient(135deg,#fff,#bbb)';
  er.style.color = '#5A4A38';
  er.textContent = '×';
  er.onclick = function () { edSandTool = -1; edBuildSandToolbar(); };
  tb.appendChild(er);
}

// ============================================================
// Grid painter
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
// Sand image painter
// ============================================================

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
        if (e && (e.buttons === 2 || e.button === 2)) edLevel.sandImage[idx] = -1;
        else edLevel.sandImage[idx] = edSandTool;
        edApplySandCell(el, edLevel.sandImage[idx]);
        edOnSandChanged();
      };
      el.onmousedown = paint;
      el.onmouseenter = function (e) { if (e.buttons === 1 || e.buttons === 2) paint(e); };
      el.oncontextmenu = function (e) {
        e.preventDefault();
        edLevel.sandImage[idx] = -1;
        edApplySandCell(el, edLevel.sandImage[idx]);
        edOnSandChanged();
      };
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

// Any change to sand may add/remove available colors and shift capacities.
function edOnSandChanged() {
  edBuildToolbar();    // available bucket colors may have changed
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
  edBuildSandGrid();
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
  edBuildSandGrid();
  edOnSandChanged();
}

// ============================================================
// Screens / Test Play / Export / Import
// ============================================================

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
  var v = edValidate();
  if (!v.ok) {
    var first = v.errors[0];
    edToast('Add a ' + CLR_NAMES[first.ci] + ' bucket — ' + first.sand + ' grains have nowhere to go.');
    return;
  }
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
    edBuildSandGrid();
    edBuildGrid();
    edBuildToolbar();
    edRefreshLiveSections();
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
