// ============================================================
// bucket_locked.js — Locked Bucket (grid variant of the Conveyor Block)
// ============================================================
//
// A Locked Bucket sits in the 7×7 grid like a normal bucket and shows its
// color from the start, but it carries a lock counter X. While locked it
// cannot be tapped onto the belt. Each time any OTHER bucket is cleared
// (filled + popped off the belt) every locked bucket's counter drops by 1.
// When a counter reaches 0 the lock breaks and the bucket becomes a normal
// grid bucket — tappable, rides the belt, and collects its color.
//
// Grid cell shape (in level data):
//   { kind: 'bucket', type: 'locked', ci: <0..N>, lock: <X≥1> }
//
// Runtime cell fields added by this mechanic:
//   lock:       clears remaining before it unlocks (0 = open)
//   lockNeed:   the configured X (for reference)
//   lockAnimT:  -1 idle, else 0..CONVEYOR_UNLOCK_FRAMES (lock-break anim)
//   badgeBumpT: >0 while the counter badge is bumping after a tick
//
// A locked bucket is impassable (blocks the activation path) just like any
// other un-used bucket, and it is forced inactive while lock > 0 so taps are
// rejected. Once unlocked, normal activation rules apply.
// ============================================================

registerBucketType('locked', {
  label: 'Locked',
  editorColor: '#39323F',

  // Grid drawing is handled directly in rendering.js#drawLockedBucket (it
  // needs the cell to read the counter), so these are simple fallbacks. The
  // on-belt look is a plain jar — once tapped it is just a normal bucket.
  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },
  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save(); ctx.globalAlpha = 0.55;
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    ctx.restore();
  },
  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#1A171C'
    };
  },
  editorCellHTML: function (ci) {
    return ''; // colored background is the identifier; the count badge is added separately
  }
});

// ------------------------------------------------------------
// Unlock progress
// ------------------------------------------------------------

// Called (via onBucketCleared) whenever any bucket pops off the belt. Every
// still-locked grid bucket ticks down by 1; one that reaches 0 unlocks.
function onBucketClearedGrid(popped) {
  var changed = false;
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell || cell.kind !== 'bucket' || cell.type !== 'locked') continue;
    if (cell.lock > 0) {
      cell.lock--;
      cell.badgeBumpT = 8;
      if (cell.lock <= 0) { unlockLockedBucket(cell, i); changed = true; }
    }
  }
  // A freshly-opened bucket may now have a clear path to the belt.
  if (changed && typeof updateBucketActivation === 'function') updateBucketActivation();
}

function unlockLockedBucket(cell, idx) {
  if (!cell || cell.type !== 'locked') return;
  if (cell.lock <= 0 && cell.lockAnimT != null && cell.lockAnimT >= 0) return; // already unlocked
  cell.lock = 0;
  cell.lockAnimT = 0;
  if (typeof spawnBurst === 'function' && L.grid) {
    var r = (idx / GRID_W) | 0, c = idx % GRID_W;
    var ctr = gridCellCenter(r, c);
    spawnBurst(ctr.x, ctr.y, '#FFD56B', 16);
    spawnBurst(ctr.x, ctr.y, COLORS[cell.ci].fill, 8);
  }
  if (typeof sfx !== 'undefined' && sfx.unlock) sfx.unlock();
}

// Tick the per-cell animation timers each frame (called from game.js#update).
function updateLockedBuckets() {
  for (var i = 0; i < stock.length; i++) {
    var c = stock[i];
    if (!c || c.kind !== 'bucket' || c.type !== 'locked') continue;
    if (c.badgeBumpT > 0) c.badgeBumpT--;
    if (c.lockAnimT != null && c.lockAnimT >= 0 && c.lockAnimT < CONVEYOR_UNLOCK_FRAMES) c.lockAnimT++;
  }
}

// ------------------------------------------------------------
// Rendering — called from rendering.js#drawGrid (has the cell in scope)
// ------------------------------------------------------------

function drawLockedBucket(ctx, x, y, w, h, cell, S, tick) {
  var locked = cell.lock > 0;
  var anim = cell.lockAnimT;
  var animating = anim != null && anim >= 0 && anim < CONVEYOR_UNLOCK_FRAMES;

  if (locked || animating) {
    // Color stays clearly visible while locked.
    drawJar(ctx, x, y, w, h, cell.ci, S, 0, 0);
  } else if (cell.active) {
    drawJar(ctx, x, y, w, h, cell.ci, S, 0, 0);
  } else {
    // Unlocked but path to the belt is blocked — dim like a normal bucket.
    ctx.save(); ctx.globalAlpha = 0.55;
    drawJar(ctx, x, y, w, h, cell.ci, S, 0, 0);
    ctx.restore();
    return;
  }

  if (locked) {
    // Light chain accents (kept thin so the color reads through) + padlock.
    ctx.save();
    rRect(x, y, w, h, 5 * S); ctx.clip();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40,34,46,0.78)';
    ctx.lineWidth = 3.5 * S;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.1, y + h * 0.34); ctx.lineTo(x + w * 1.1, y + h * 0.62);
    ctx.moveTo(x - w * 0.1, y + h * 0.62); ctx.lineTo(x + w * 1.1, y + h * 0.34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,169,60,0.85)';
    ctx.lineWidth = 1.4 * S;
    ctx.setLineDash([3 * S, 3 * S]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Countdown badge (top-right).
    var bump = (cell.badgeBumpT > 0) ? (1 + (cell.badgeBumpT / 8) * 0.45) : 1;
    var br = 10 * S * bump;
    var bx = x + w - 4 * S, by = y + 4 * S;
    ctx.save();
    ctx.fillStyle = '#FF5B3B';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 3 * S;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (13 * S * bump) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.lock + '', bx, by + 0.5 * S);
    ctx.restore();
  }

  if (animating) {
    var p = anim / CONVEYOR_UNLOCK_FRAMES;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.strokeStyle = '#FFE6A0';
    ctx.lineWidth = Math.max(0.5, 3 * S * (1 - p));
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w * 0.4 + p * w * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
