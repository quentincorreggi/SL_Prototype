// ============================================================
// locked_region.js — Locked region mechanic
//
// Grid cells marked { kind:'locked', lockGroup: 0..4 } form a hidden panel.
// Each lock group has a star counter: the number of star buckets (of that
// group) placed in the level. Collecting a star decrements the counter,
// shown live on every cell of that group. When the counter hits 0 the
// region animates open.
//
// Global state:
//   lockGroupRequired[g]   — total stars needed (computed at initGame)
//   lockGroupCollected[g]  — stars popped so far (runtime)
//   lockedRevealAnims[]    — { idx, t, total } per-cell reveal animations
//
// API used by game.js:
//   initLockGroups()               — call from initGame after stock is built
//   onStarBucketPopped(lockGroup)  — call when a star bucket pops
//   updateLockedRegions()          — tick reveal anims each frame
// ============================================================

var LOCK_REVEAL_FRAMES = 28;
var lockedRevealAnims = [];
var lockGroupRequired  = [0, 0, 0, 0, 0];
var lockGroupCollected = [0, 0, 0, 0, 0];

// Called once at initGame — count star buckets per group across the whole
// level (grid + tunnel contents).
function initLockGroups() {
  lockGroupRequired  = [0, 0, 0, 0, 0];
  lockGroupCollected = [0, 0, 0, 0, 0];
  lockedRevealAnims  = [];
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell) continue;
    if (cell.kind === 'bucket' && cell.type === 'star' && cell.lockGroup != null) {
      lockGroupRequired[cell.lockGroup]++;
    }
    if (cell.kind === 'tunnel' && cell.contents) {
      for (var k = 0; k < cell.contents.length; k++) {
        var b = cell.contents[k];
        if (b.type === 'star' && b.lockGroup != null) {
          lockGroupRequired[b.lockGroup]++;
        }
      }
    }
  }
}

// Called by game.js when a star bucket is done (popT === 1).
function onStarBucketPopped(lockGroup) {
  if (lockGroup < 0 || lockGroup > 4) return;
  lockGroupCollected[lockGroup]++;
  var required = lockGroupRequired[lockGroup] || 1;
  if (lockGroupCollected[lockGroup] >= required) {
    _revealLockGroup(lockGroup);
  } else {
    // Pulse sound — partial progress
    if (typeof tone === 'function') tone(660, 0.10, 'sine', 0.07);
  }
}

function _revealLockGroup(lockGroup) {
  var any = false;
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell || cell.kind !== 'locked') continue;
    if (cell.lockGroup !== lockGroup) continue;
    cell._revealing = true;
    lockedRevealAnims.push({ idx: i, t: 0, total: LOCK_REVEAL_FRAMES });
    any = true;
  }
  if (!any) return;

  // Full unlock chime
  var freqs = [880, 1108, 1319, 1760];
  freqs.forEach(function (f, i) {
    setTimeout(function () {
      if (typeof tone === 'function') tone(f, 0.22, 'sine', 0.10);
    }, i * 65);
  });

  // Particle burst on each revealing cell
  if (typeof spawnBurst === 'function' && L.grid) {
    for (var j = 0; j < stock.length; j++) {
      var c2 = stock[j];
      if (!c2 || !c2._revealing) continue;
      var row = (j / GRID_W) | 0;
      var col = j % GRID_W;
      var cs  = L.grid.cell;
      var cx  = L.grid.x + (col + 0.5) * cs;
      var cy  = L.grid.y + (row + 0.5) * cs;
      spawnBurst(cx, cy, '#FFE066', 14);
    }
  }
}

// Tick reveal animations; remove locked cell when animation completes.
function updateLockedRegions() {
  for (var i = lockedRevealAnims.length - 1; i >= 0; i--) {
    var a = lockedRevealAnims[i];
    a.t++;
    if (a.t >= a.total) {
      stock[a.idx] = null;
      lockedRevealAnims.splice(i, 1);
      // Re-run activation so revealed buckets become tappable immediately.
      if (typeof updateBucketActivation === 'function') updateBucketActivation();
      if (typeof updateTunnels === 'function') updateTunnels();
    }
  }
}
