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

  // Build sieves (U-cups in the sand image) from level data.
  initSieves(lvl.sieves);

  // Capacities are derived from sand and buckets together; computed once.
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
  if (src.kind === 'key') {
    return {
      kind: 'key',
      ci: src.ci | 0,
      used: false,
      active: false,
      fired: false
    };
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
  if (cell.kind === 'key') return cell.used;
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
  // Mark bucket/key cells: active iff (in row 0) or (any neighbor visited).
  for (var r = 0; r < GRID_H; r++) {
    for (var c = 0; c < GRID_W; c++) {
      var idx = r * GRID_W + c;
      var cell = stock[idx];
      if (!cell || (cell.kind !== 'bucket' && cell.kind !== 'key') || cell.used) continue;
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
  // Sand CA runs every SAND_FRAME_INTERVAL frames (debug slider).
  if (SAND_FRAME_INTERVAL <= 1 || tick % SAND_FRAME_INTERVAL === 0) updateSand();
  updateBucketAttraction();
  updateAttractionTrails();
  updateColorDepletion();
  updateSieves();
  updateKeyFlyers();
  if (typeof tickParticles === 'function') tickParticles();
  // Tunnels poll continuously — a queued bucket spawns the moment its
  // exit cell becomes free (e.g. after a player tap).
  if (updateTunnels()) updateBucketActivation();
  // Keys auto-launch the instant their path to the belt opens.
  updateKeys();
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
  // Showcase level (built in the editor): seven colour bands rain down; the
  // yellow band feeds a yellow U-cup sieve. A wall maze gates the yellow key
  // — clear the path and it auto-fires to crack the sieve open.
  function B(ci) { return { kind: 'bucket', type: 'default', ci: ci }; }
  var WALL = { kind: 'wall' };
  var grid = [
    B(0), B(0), B(0), B(0), B(9), B(9), B(9), B(1), B(1), B(1),
    B(4), B(4), B(4), B(4), B(5), B(5), B(5), B(5), B(8), B(8),
    B(8), WALL, WALL, { kind: 'key', ci: 9 }, B(10), B(10), WALL, WALL, null, WALL,
    WALL, WALL, WALL, WALL, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null
  ];

  // Horizontal colour bands (top → bottom), each a run of full rows.
  var bands = [[10, 5], [4, 5], [0, 4], [5, 4], [9, 4], [1, 5], [8, 4]];
  var sand = [];
  for (var b = 0; b < bands.length; b++) {
    var n = bands[b][1] * IMG_W;
    for (var k = 0; k < n; k++) sand.push(bands[b][0]);
  }
  while (sand.length < IMG_W * IMG_H) sand.push(-1); // empty bottom row

  return {
    name: 'Sieve Showcase',
    desc: 'Free the yellow key to crack the sieve open',
    grid: grid,
    sandImage: sand,
    sieves: [{ ci: 9, px: 15, py: 19, pw: 13, ph: 5 }]
  };
}

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
