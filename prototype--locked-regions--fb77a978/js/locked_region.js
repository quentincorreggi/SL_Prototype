// ============================================================
// locked_region.js — Locked region mechanic
//
// Grid cells can be marked  { kind:'locked', lockGroup: 0..4 }
// A locked cell is drawn as an opaque dark panel (invisible to
// the player). Buckets behind it are completely hidden and cannot
// be tapped.
//
// When a star bucket whose .lockGroup matches is collected (filled
// and popped off the belt), all cells in that group animate open
// (LOCK_REVEAL_FRAMES) and then become null (empty slot), making
// whatever was underneath visible and tappable.
//
// Global state added here:
//   lockedRevealAnims[] — { idx, t, total } reveal animations
//
// API used by game.js:
//   triggerLockGroupReveal(lockGroup)   — call on star bucket pop
//   updateLockedRegions()               — tick reveal anims each frame
//   isLockedCell(idx)                   — returns true while locked/revealing
// ============================================================

var LOCK_REVEAL_FRAMES = 28;
var lockedRevealAnims = [];   // { idx, t, total } — counting up

// Called by game.js when a star bucket with .lockGroup pops.
function triggerLockGroupReveal(lockGroup) {
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell || cell.kind !== 'locked') continue;
    if (cell.lockGroup !== lockGroup) continue;
    // Mark cell as revealing (keep it locked visually during anim)
    cell._revealing = true;
    lockedRevealAnims.push({ idx: i, t: 0, total: LOCK_REVEAL_FRAMES });
  }
  // Sound: bright chime
  if (typeof audioCtx !== 'undefined') {
    var freqs = [880, 1108, 1319, 1760];
    freqs.forEach(function (f, i) {
      setTimeout(function () {
        if (typeof tone === 'function') tone(f, 0.20, 'sine', 0.09);
      }, i * 60);
    });
  }
  // Particle burst on each revealing cell center
  if (typeof spawnParticleBurst === 'function') {
    for (var j = 0; j < stock.length; j++) {
      var c2 = stock[j];
      if (!c2 || !c2._revealing) continue;
      var r2 = (j / GRID_W) | 0;
      var col = j % GRID_W;
      var cs = L.grid ? L.grid.cell : 0;
      var cx = L.grid.x + (col + 0.5) * cs;
      var cy = L.grid.y + (r2 + 0.5) * cs;
      spawnParticleBurst(cx, cy, '#FFE066', 10);
    }
  }
}

// Tick all reveal animations; when finished, remove locked cell.
function updateLockedRegions() {
  for (var i = lockedRevealAnims.length - 1; i >= 0; i--) {
    var a = lockedRevealAnims[i];
    a.t++;
    if (a.t >= a.total) {
      // Remove the locked cell — what was "beneath" (null) is now visible.
      stock[a.idx] = null;
      lockedRevealAnims.splice(i, 1);
    }
  }
}

// Returns true if the cell at idx is locked OR is mid-reveal-animation.
function isLockedCell(idx) {
  var cell = stock[idx];
  if (cell && cell.kind === 'locked') return true;
  return false;
}
