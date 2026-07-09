// ============================================================
// game.js — Boot, game loop, input, activation, win check
// ============================================================

function initGame(levelData) {
  // Resize the sand grid based on the current subdivision setting.
  // Each image-pixel will expand into a SAND_SUBDIV × SAND_SUBDIV block
  // of independent sand cells (each a real particle that falls).
  SAND_W = IMG_W * SAND_SUBDIV;
  SAND_H = IMG_H * SAND_SUBDIV;
  sandGrid = new Int8Array(SAND_W * SAND_H);
  for (var s = 0; s < sandGrid.length; s++) sandGrid[s] = -1;
  sandFrozen = new Uint8Array(SAND_W * SAND_H);

  computeLayout();
  initBelt();
  jumpers = [];
  particles = [];
  attractionTrails = [];
  rejectShake = { idx: -1, t: 0 };
  won = false;
  gameActive = true;
  hideWin();

  // Build stock from level data (or use a demo level).
  stock = new Array(GRID_W * GRID_H);
  for (var i = 0; i < stock.length; i++) stock[i] = null;

  var lvl = levelData || demoLevel();
  currentLevel = lvl;

  if (lvl.grid) {
    for (var i = 0; i < Math.min(stock.length, lvl.grid.length); i++) {
      var src = lvl.grid[i];
      if (!src) continue;
      stock[i] = cloneCell(src);
    }
  }

  // Expand the 32×32 image into the sand grid: each image-pixel of color C
  // fills a SAND_SUBDIV × SAND_SUBDIV block. These behave as real particles
  // under the CA — they can fall, settle, and shift independently.
  if (lvl.sandImage) {
    for (var py = 0; py < IMG_H; py++) {
      for (var px = 0; px < IMG_W; px++) {
        var ci = lvl.sandImage[py * IMG_W + px];
        if (ci == null || ci < 0) continue;
        for (var dy = 0; dy < SAND_SUBDIV; dy++) {
          for (var dx = 0; dx < SAND_SUBDIV; dx++) {
            var sx = px * SAND_SUBDIV + dx;
            var sy = py * SAND_SUBDIV + dy;
            sandGrid[sy * SAND_W + sx] = ci;
          }
        }
      }
    }
  }

  // Brick Walls (painting-layer overlay) — freeze the sand beneath them.
  // Built after the sand grid exists so the frozen mask lines up.
  if (typeof initBrickWalls === 'function') initBrickWalls(lvl.walls);

  // Capacities are derived from sand and buckets together; computed once.
  // Frozen sand still counts, so per-color capacity accounts for walled sand.
  computeLevelCapacities();
  updateTunnels();
  updateBucketActivation();
  showQuitBtn();
}

function computeLevelCapacities() {
  var sandPer = new Array(NUM_COLORS);
  var bktPer  = new Array(NUM_COLORS);
  for (var ci = 0; ci < NUM_COLORS; ci++) { sandPer[ci] = 0; bktPer[ci] = 0; }
  for (var i = 0; i < sandGrid.length; i++) {
    var c = sandGrid[i];
    if (c >= 0 && c < NUM_COLORS) sandPer[c]++;
  }
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell) continue;
    if (cell.kind === 'bucket') bktPer[cell.ci]++;
    else if (cell.kind === 'tunnel' && cell.contents) {
      for (var k = 0; k < cell.contents.length; k++) bktPer[cell.contents[k].ci]++;
    }
  }
  for (var ci = 0; ci < NUM_COLORS; ci++) {
    levelCapacities[ci] = (bktPer[ci] > 0 && sandPer[ci] > 0)
      ? Math.ceil(sandPer[ci] / bktPer[ci])
      : 0;
  }
}

function cloneCell(src) {
  if (!src) return null;
  if (src.kind === 'wall') return { kind: 'wall' };
  if (src.kind === 'tunnel') {
    var copy = { kind: 'tunnel', dir: src.dir || 'top', contents: [], spawned: 0 };
    if (src.contents) {
      for (var i = 0; i < src.contents.length; i++) {
        copy.contents.push({ type: src.contents[i].type || 'default', ci: src.contents[i].ci | 0 });
      }
    }
    return copy;
  }
  if (src.kind === 'bucket') {
    return {
      kind: 'bucket',
      type: src.type || 'default',
      ci: src.ci | 0,
      used: false,
      active: false
    };
  }
  return null;
}

// ============================================================
// Activation BFS — a bucket is active iff there is a path of passable
// cells (null / used bucket / tunnel) from its position to row -1
// (the belt edge directly above row 0).
// ============================================================

function isPassable(cell) {
  if (!cell) return true;
  if (cell.kind === 'wall') return false;
  if (cell.kind === 'tunnel') return true;
  if (cell.kind === 'bucket') return cell.used;
  return false;
}

function updateBucketActivation() {
  var visited = new Uint8Array(GRID_W * GRID_H);
  var queue = [];
  // Seed from row 0 passable cells (their "above" is the virtual belt edge).
  for (var c = 0; c < GRID_W; c++) {
    if (isPassable(stock[c])) { visited[c] = 1; queue.push(c); }
  }
  while (queue.length > 0) {
    var idx = queue.shift();
    var r = (idx / GRID_W) | 0;
    var c = idx % GRID_W;
    var nbrs = [];
    if (r > 0)         nbrs.push(idx - GRID_W);
    if (r < GRID_H - 1) nbrs.push(idx + GRID_W);
    if (c > 0)         nbrs.push(idx - 1);
    if (c < GRID_W - 1) nbrs.push(idx + 1);
    for (var i = 0; i < nbrs.length; i++) {
      var ni = nbrs[i];
      if (visited[ni]) continue;
      if (isPassable(stock[ni])) { visited[ni] = 1; queue.push(ni); }
    }
  }
  // Mark bucket cells: active iff (in row 0) or (any neighbor visited).
  for (var r = 0; r < GRID_H; r++) {
    for (var c = 0; c < GRID_W; c++) {
      var idx = r * GRID_W + c;
      var cell = stock[idx];
      if (!cell || cell.kind !== 'bucket' || cell.used) continue;
      var active = false;
      if (r === 0) active = true;
      else if (visited[idx - GRID_W]) active = true;
      else if (r < GRID_H - 1 && visited[idx + GRID_W]) active = true;
      else if (c > 0 && visited[idx - 1]) active = true;
      else if (c < GRID_W - 1 && visited[idx + 1]) active = true;
      cell.active = active;
    }
  }
}

// Spawn the next queued bucket from every tunnel whose target cell is
// currently empty. Runs independently of activation — as soon as the
// exit cell is free, the next item in the queue spawns. Loops because
// chains of tunnels may cascade in one pass. Returns true if anything
// spawned, so callers can re-run activation.
function updateTunnels() {
  var any = false;
  var spawned = true;
  while (spawned) {
    spawned = false;
    for (var idx2 = 0; idx2 < stock.length; idx2++) {
      var cell2 = stock[idx2];
      if (!cell2 || cell2.kind !== 'tunnel') continue;
      if (!cell2.contents || cell2.contents.length === 0) continue;
      var target = tunnelTargetIndex(idx2, cell2.dir);
      if (target < 0) continue;
      if (stock[target] != null) continue;
      var next = cell2.contents.shift();
      cell2.spawned = (cell2.spawned || 0) + 1;
      stock[target] = {
        kind: 'bucket',
        type: next.type || 'default',
        ci: next.ci | 0,
        used: false,
        active: false
      };
      spawned = true;
      any = true;
    }
  }
  return any;
}

function tunnelTargetIndex(idx, dir) {
  var r = (idx / GRID_W) | 0;
  var c = idx % GRID_W;
  if (dir === 'top')    return r > 0          ? idx - GRID_W : -1;
  if (dir === 'bottom') return r < GRID_H - 1 ? idx + GRID_W : -1;
  if (dir === 'left')   return c > 0          ? idx - 1      : -1;
  if (dir === 'right')  return c < GRID_W - 1 ? idx + 1      : -1;
  return -1;
}

// ============================================================
// Input
// ============================================================

function handleTap(sx, sy) {
  if (won || !gameActive) return;
  if (!L.grid) return;
  // Hit-test the grid.
  var cs = L.grid.cell;
  if (sx < L.grid.x || sx > L.grid.x + L.grid.w) return;
  if (sy < L.grid.y || sy > L.grid.y + L.grid.h) return;
  var c = Math.floor((sx - L.grid.x) / cs);
  var r = Math.floor((sy - L.grid.y) / cs);
  if (r < 0 || r >= GRID_H || c < 0 || c >= GRID_W) return;
  var idx = r * GRID_W + c;
  var cell = stock[idx];
  if (!cell || cell.kind !== 'bucket' || cell.used || !cell.active) return;

  var slot = firstFreeBeltSlot();
  if (slot < 0) {
    rejectShake = { idx: idx, t: 14 };
    if (typeof sfx !== 'undefined') sfx.reject();
    return;
  }

  // Reserve the slot so attraction/scroll don't touch it during the jump.
  beltSlots[slot] = { reserved: true };
  cell.used = true;

  var from = gridCellCenter(r, c);
  var to = getBeltSlotPos(slot);
  jumpers.push({
    bucket: makeBeltBucket(cell.type, cell.ci),
    slot: slot,
    from: from,
    to: to,
    t: 0,
    dur: JUMPER_FRAMES
  });

  if (typeof sfx !== 'undefined') sfx.drop();
  updateTunnels();
  updateBucketActivation();
}

function makeBeltBucket(type, ci) {
  return {
    type: type || 'default',
    ci: ci | 0,
    fill: 0,
    capacity: levelCapacities[ci | 0] || 0,
    pullCooldown: ATTRACT_PULL_FRAMES,
    done: false,
    popT: 0,
    bornAt: tick,
    revealT: type === 'hidden' ? 0 : null
  };
}

function gridCellCenter(r, c) {
  var cs = L.grid.cell;
  return { x: L.grid.x + (c + 0.5) * cs, y: L.grid.y + (r + 0.5) * cs };
}

function updateJumpers() {
  for (var i = jumpers.length - 1; i >= 0; i--) {
    var j = jumpers[i];
    j.t++;
    if (j.t >= j.dur) {
      beltSlots[j.slot] = j.bucket; // commit
      jumpers.splice(i, 1);
    }
  }
}

function updateRejectShake() {
  if (rejectShake.t > 0) rejectShake.t--;
}

// ============================================================
// Main loop
// ============================================================

function update() {
  tick++;
  if (!gameActive) return;
  updateBelt();
  updateJumpers();
  updateRejectShake();
  if (typeof updateBrickWalls === 'function') updateBrickWalls();
  // Sand CA runs every SAND_FRAME_INTERVAL frames (debug slider).
  if (SAND_FRAME_INTERVAL <= 1 || tick % SAND_FRAME_INTERVAL === 0) updateSand();
  updateBucketAttraction();
  updateAttractionTrails();
  updateColorDepletion();
  if (typeof tickParticles === 'function') tickParticles();
  // Tunnels poll continuously — a queued bucket spawns the moment its
  // exit cell becomes free (e.g. after a player tap).
  if (updateTunnels()) updateBucketActivation();
  checkWin();
}

// If a color's sand is exhausted (and nothing in flight), any bucket of that
// color sitting on the belt is marked done so it pops — otherwise a partially
// filled "last" bucket would sit forever.
function updateColorDepletion() {
  var hasSand = new Array(NUM_COLORS);
  for (var ci = 0; ci < NUM_COLORS; ci++) hasSand[ci] = false;
  for (var i = 0; i < sandGrid.length; i++) {
    var c = sandGrid[i];
    if (c >= 0) hasSand[c] = true;
  }
  for (var t = 0; t < attractionTrails.length; t++) {
    hasSand[attractionTrails[t].ci] = true;
  }
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b || b.reserved || b.done) continue;
    if (!hasSand[b.ci]) b.done = true;
  }
}

function checkWin() {
  if (won) return;
  // Win when no sand left AND nothing in flight AND belt empty.
  if (countSandRemaining() !== 0) return;
  if (jumpers.length !== 0) return;
  if (attractionTrails.length !== 0) return;
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i] != null) return;
  }
  won = true;
  if (typeof sfx !== 'undefined') sfx.win();
  showWin();
}

function frame() {
  update();
  drawFrame();
  requestAnimationFrame(frame);
}

function showWin() {
  var el = document.getElementById('win-screen');
  if (el) el.classList.add('show');
}
function hideWin() {
  var el = document.getElementById('win-screen');
  if (el) el.classList.remove('show');
}

function showLevelSelect() {
  hideWin();
  gameActive = false;
  hideQuitBtn();
  // If we got here from Test Play, return to the editor with state intact.
  if (typeof edPlayingFromEditor !== 'undefined' && edPlayingFromEditor) {
    edPlayingFromEditor = false;
    var ed = document.getElementById('editor-screen');
    if (ed) ed.classList.remove('hidden');
    return;
  }
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.remove('hidden');
  if (ed) ed.classList.add('hidden');
}

function showQuitBtn() {
  var b = document.getElementById('quit-btn');
  if (b) b.style.display = 'flex';
}
function hideQuitBtn() {
  var b = document.getElementById('quit-btn');
  if (b) b.style.display = 'none';
}
function quitGame() {
  showLevelSelect();
}

// ============================================================
// Demo level (loaded on first boot so canvas isn't blank)
// ============================================================

function demoLevel() {
  var grid = new Array(GRID_W * GRID_H);
  for (var i = 0; i < grid.length; i++) grid[i] = null;
  // A small set of buckets on rows 4-6, colors 0..2.
  function placeB(r, c, ci, type) {
    grid[r * GRID_W + c] = { kind: 'bucket', type: type || 'default', ci: ci };
  }
  placeB(4, 1, 0); placeB(4, 3, 1); placeB(4, 5, 2);
  placeB(5, 0, 1); placeB(5, 2, 0); placeB(5, 4, 2, 'hidden'); placeB(5, 6, 0);
  placeB(6, 1, 2); placeB(6, 3, 0); placeB(6, 5, 1);

  // Sand image (32×32): simple horizontal stripes of colors 0..2
  var sand = new Array(IMG_W * IMG_H);
  for (var y = 0; y < IMG_H; y++) {
    var ci = (y < 11) ? 0 : (y < 22) ? 1 : 2;
    for (var x = 0; x < IMG_W; x++) {
      sand[y * IMG_W + x] = ci;
    }
  }
  return { name: 'Demo', desc: '3 colors, 10 buckets', grid: grid, sandImage: sand };
}

// ============================================================
// Brick Wall showcase levels (loaded from the start screen)
// ============================================================

function _bwBlankSand() {
  var s = new Array(IMG_W * IMG_H);
  for (var i = 0; i < s.length; i++) s[i] = -1;
  return s;
}
function _bwFillRect(sand, x0, y0, x1, y1, ci) {
  for (var y = y0; y <= y1; y++)
    for (var x = x0; x <= x1; x++)
      if (x >= 0 && x < IMG_W && y >= 0 && y < IMG_H) sand[y * IMG_W + x] = ci;
}
function _bwRectCells(x0, y0, x1, y1) {
  var a = [];
  for (var y = y0; y <= y1; y++)
    for (var x = x0; x <= x1; x++) a.push(y * IMG_W + x);
  return a;
}
function _bwBlankGrid() {
  var g = new Array(GRID_W * GRID_H);
  for (var i = 0; i < g.length; i++) g[i] = null;
  return g;
}
function _bwBkt(g, r, c, ci, type) {
  g[r * GRID_W + c] = { kind: 'bucket', type: type || 'default', ci: ci };
}

function _bwLevelFirstTouch() {
  var s = _bwBlankSand();
  _bwFillRect(s, 4, 6, 11, 13, 1);    // amber block — collectable at start
  _bwFillRect(s, 14, 6, 21, 13, 2);   // magenta block — frozen under the wall
  var g = _bwBlankGrid();
  _bwBkt(g, 0, 0, 1); _bwBkt(g, 0, 2, 1); _bwBkt(g, 1, 1, 1);   // amber buckets
  _bwBkt(g, 0, 4, 2); _bwBkt(g, 0, 6, 2); _bwBkt(g, 1, 5, 2);   // magenta buckets
  return {
    name: 'Brick Wall — First Touch',
    desc: 'Amber wall (×2). Only amber clears break it — then collect the magenta.',
    grid: g,
    sandImage: s,
    // Wall's trigger color is amber (1): clearing amber buckets breaks it.
    walls: [{ cells: _bwRectCells(14, 6, 21, 13), threshold: 2, color: 1 }]
  };
}

function _bwLevelMulti() {
  // Each color lives in its own vertical column band with a clear path down
  // to the bottom (the belt only reaches sand that settles at the image
  // floor). Walls sit in the upper rows with empty space beneath, so freed
  // sand falls cleanly to its own band. Cyan is collectable from the start;
  // clearing it chips every wall down, and each break frees the next color.
  var s = _bwBlankSand();
  _bwFillRect(s, 1, 16, 6, 31, 0);    // cyan — collectable at start (reaches floor)
  _bwFillRect(s, 9, 4, 14, 11, 2);    // magenta — under wall A (×2)
  _bwFillRect(s, 17, 4, 20, 13, 5);   // lime — under wall B (L-shape, ×4)
  _bwFillRect(s, 21, 10, 24, 13, 5);
  _bwFillRect(s, 26, 4, 31, 11, 8);   // red — under wall C (×6)
  var g = _bwBlankGrid();
  _bwBkt(g, 0, 0, 0); _bwBkt(g, 0, 2, 0); _bwBkt(g, 0, 4, 0);   // cyan ×3
  _bwBkt(g, 1, 1, 2); _bwBkt(g, 1, 3, 2);                        // magenta ×2
  _bwBkt(g, 2, 0, 5); _bwBkt(g, 2, 2, 5);                        // lime ×2
  _bwBkt(g, 3, 1, 8); _bwBkt(g, 3, 3, 8);                        // red ×2
  var wallB = _bwRectCells(17, 4, 20, 13).concat(_bwRectCells(21, 10, 24, 13));
  return {
    name: 'Brick Wall — Multi',
    desc: 'Each wall is a different color — only that color breaks it. Cyan → magenta → lime reveals red.',
    grid: g,
    sandImage: s,
    // Color-chain: clearing cyan breaks wall A (frees magenta), magenta breaks
    // wall B (frees lime), lime breaks wall C (frees red). Colors are gated —
    // clearing cyan never touches the magenta or lime walls.
    walls: [
      { cells: _bwRectCells(9, 4, 14, 11), threshold: 3, color: 0 },  // A: cyan
      { cells: wallB, threshold: 2, color: 2 },                       // B: magenta
      { cells: _bwRectCells(26, 4, 31, 11), threshold: 2, color: 5 }  // C: lime
    ]
  };
}

var BRICK_LEVELS = [_bwLevelFirstTouch(), _bwLevelMulti()];
// Surface them in the LEVELS array too (data completeness).
LEVELS = BRICK_LEVELS.slice();

// ============================================================
// Boot
// ============================================================

window.addEventListener('resize', function () { computeLayout(); });

canvas.addEventListener('pointerdown', function (e) {
  if (typeof ensureAudio === 'function') ensureAudio();
  var rect = canvas.getBoundingClientRect();
  handleTap(e.clientX - rect.left, e.clientY - rect.top);
});

initGame();
requestAnimationFrame(frame);
