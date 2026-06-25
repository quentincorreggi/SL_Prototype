// ============================================================
// bucket_conveyorblock.js — Conveyor Block mechanic
// ============================================================
//
// A Conveyor Block is a LOCKED bucket that spawns directly on the belt
// at level start — it is never placed in the 7×7 grid. While locked it
// loops on the belt occupying a slot but collects no sand. Each time any
// OTHER bucket is cleared (filled + popped off the belt) every locked
// block's counter drops by 1. When a block's counter hits 0 the lock
// breaks and it becomes a normal collecting bucket: it pulls matching
// sand and pops when full, like any other bucket.
//
// Level data carries belt blocks separately from the grid:
//   level.beltBlocks = [ { ci: <0..N>, unlock: <X≥1> }, ... ]
//
// On-belt object fields added by this mechanic:
//   type: 'conveyorblock'
//   locked:      true while sealed, false once unlocked
//   unlockNeed:  the configured X
//   unlockLeft:  clears remaining before unlock
//   unlockAnimT: -1 idle, else 0..CONVEYOR_UNLOCK_FRAMES (lock-break anim)
//   badgeBumpT:  >0 while the countdown badge is bumping after a tick
//
// Logic helpers here are called from belt.js (updateBelt) and game.js
// (initGame / update) — all globals, resolved at runtime.
// ============================================================

// Registered so getBucketType('conveyorblock') is always safe. The block
// is belt-only, so the grid-draw hooks are just sensible fallbacks; the
// editor toolbar does not list it (belt blocks have their own editor panel).
registerBucketType('conveyorblock', {
  label: 'Conveyor Block',
  editorColor: '#2A2530',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },
  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },
  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
  },
  editorCellStyle: function (ci) {
    return { background: 'linear-gradient(135deg,#5A5460,#2A2530)', borderColor: '#1A171C' };
  },
  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">🔒</span>';
  }
});

// ------------------------------------------------------------
// Construction + placement
// ------------------------------------------------------------

function makeConveyorBlock(ci, x) {
  var need = Math.max(1, x | 0);
  return {
    type: 'conveyorblock',
    ci: ci | 0,
    fill: 0,
    capacity: levelCapacities[ci | 0] || 0,
    pullCooldown: ATTRACT_PULL_FRAMES,
    done: false,
    popT: 0,
    bornAt: tick,
    revealT: null,
    locked: true,
    unlockNeed: need,
    unlockLeft: need,
    unlockAnimT: -1,
    badgeBumpT: 0
  };
}

// Place every block from the level's beltBlocks list onto the belt. Called
// from initGame AFTER capacities are computed (blocks copy their capacity).
function placeConveyorBlocks(lvl) {
  if (!lvl || !lvl.beltBlocks) return;
  for (var i = 0; i < lvl.beltBlocks.length; i++) {
    var spec = lvl.beltBlocks[i];
    if (!spec) continue;
    var slot = firstFreeBeltSlot();
    if (slot < 0) break; // belt full — extra blocks are dropped
    var x = (spec.unlock != null) ? spec.unlock : (spec.x != null ? spec.x : 1);
    beltSlots[slot] = makeConveyorBlock(spec.ci, x);
  }
}

// ------------------------------------------------------------
// Unlock progress
// ------------------------------------------------------------

// Called when ANY bucket finishes and pops off the belt. Every still-locked
// block (other than the one that just popped) ticks down by 1; a block that
// reaches 0 unlocks immediately.
function onBucketCleared(popped) {
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b || b.reserved || b === popped) continue;
    if (b.locked && b.unlockLeft > 0) {
      b.unlockLeft--;
      b.badgeBumpT = 8;
      if (b.unlockLeft <= 0) unlockConveyorBlock(b, s);
    }
  }
  // The grid Locked Bucket variant ticks down on the same clear event.
  if (typeof onBucketClearedGrid === 'function') onBucketClearedGrid(popped);
}

function unlockConveyorBlock(b, slot) {
  if (!b.locked) return;
  b.locked = false;
  b.unlockLeft = 0;
  b.unlockAnimT = 0;
  // Reset the pull cooldown so it starts collecting promptly.
  b.pullCooldown = ATTRACT_PULL_FRAMES;
  if (typeof spawnBurst === 'function' && L.belt) {
    var pos = getBeltSlotPos(slot);
    spawnBurst(pos.x, pos.y, '#FFD56B', 18);
    spawnBurst(pos.x, pos.y, COLORS[b.ci].fill, 10);
  }
  if (typeof sfx !== 'undefined' && sfx.unlock) sfx.unlock();
}

// Per-frame anti-soft-lock: a locked block can only unlock when some OTHER
// bucket clears. If nothing else is left to clear (grid empty, no tunnel
// contents, no jumpers, no other collecting belt buckets) a locked block
// could never unlock — force it open so the level stays winnable.
function relieveConveyorSoftlock() {
  var clearable = jumpers.length;
  var lockedGrid = [];
  for (var i = 0; i < stock.length; i++) {
    var c = stock[i];
    if (!c) continue;
    if (c.kind === 'bucket' && !c.used) {
      // A locked grid bucket can't be cleared until it opens.
      if (c.type === 'locked' && c.lock > 0) lockedGrid.push(i);
      else clearable++;
    } else if (c.kind === 'tunnel' && c.contents) {
      clearable += c.contents.length;
    }
  }
  var lockedBelt = [];
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b || b.reserved) continue;
    if (b.locked) lockedBelt.push(s);
    else if (!b.done) clearable++;
  }
  if (clearable > 0) return;
  if (lockedBelt.length === 0 && lockedGrid.length === 0) return;
  // Nothing else can ever be cleared, so locked items would never tick down —
  // force them open to keep the level winnable.
  for (var k = 0; k < lockedBelt.length; k++) {
    unlockConveyorBlock(beltSlots[lockedBelt[k]], lockedBelt[k]);
  }
  var anyGrid = false;
  for (var g = 0; g < lockedGrid.length; g++) {
    unlockLockedBucket(stock[lockedGrid[g]], lockedGrid[g]);
    anyGrid = true;
  }
  if (anyGrid && typeof updateBucketActivation === 'function') updateBucketActivation();
}

// ------------------------------------------------------------
// Rendering — called from rendering.js#drawBeltBucket
// ------------------------------------------------------------

function drawConveyorBlock(ctx, x, y, w, h, b, S, tick) {
  var locked = b.locked;
  var anim = b.unlockAnimT;
  var animating = anim != null && anim >= 0 && anim < CONVEYOR_UNLOCK_FRAMES;

  // Base jar (so the eventual collection color is always visible).
  drawJar(ctx, x, y, w, h, b.ci, S, b.fill || 0, b.capacity || 0);

  // Once fully unlocked (and the lock-break anim has finished) it is just a
  // normal bucket — nothing more to draw.
  if (!locked && !animating) return;

  var caseAlpha = 1;
  if (animating) caseAlpha = Math.max(0, 1 - anim / CONVEYOR_UNLOCK_FRAMES);

  if (caseAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = caseAlpha;

    // Dark sealed casing (semi-transparent so the color shows through).
    ctx.fillStyle = 'rgba(26,22,30,0.60)';
    rRect(x - 1 * S, y - 1 * S, w + 2 * S, h + 2 * S, 6 * S); ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,16,0.92)';
    ctx.lineWidth = 2 * S;
    rRect(x - 1 * S, y - 1 * S, w + 2 * S, h + 2 * S, 6 * S); ctx.stroke();

    // Crossed amber chains.
    ctx.save();
    rRect(x, y, w, h, 5 * S); ctx.clip();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#E8A93C';
    ctx.lineWidth = 4.5 * S;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.12, y + h * 0.30); ctx.lineTo(x + w * 1.12, y + h * 0.64);
    ctx.moveTo(x - w * 0.12, y + h * 0.64); ctx.lineTo(x + w * 1.12, y + h * 0.30);
    ctx.stroke();
    // dark link seams over the chains
    ctx.strokeStyle = 'rgba(90,58,8,0.55)';
    ctx.lineWidth = 1.4 * S;
    ctx.setLineDash([3 * S, 3 * S]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Padlock body + shackle in the center.
    var lw = w * 0.30, lh = h * 0.24;
    var lx = x + w / 2 - lw / 2, ly = y + h * 0.52;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#D7B25A';
    ctx.lineWidth = 2.6 * S;
    ctx.beginPath();
    ctx.arc(x + w / 2, ly, lw * 0.34, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#FFD56B';
    rRect(lx, ly, lw, lh, 3 * S); ctx.fill();
    ctx.strokeStyle = '#9A6A10';
    ctx.lineWidth = 1.4 * S;
    rRect(lx, ly, lw, lh, 3 * S); ctx.stroke();

    ctx.restore();
  }

  // Lock-break burst ring.
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

  // Countdown badge (top-right), only while locked.
  if (locked) {
    var bump = (b.badgeBumpT > 0) ? (1 + (b.badgeBumpT / 8) * 0.45) : 1;
    var br = 9 * S * bump;
    var bx = x + w - 2 * S, by = y + 3 * S;
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
    ctx.font = 'bold ' + (12 * S * bump) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.unlockLeft + '', bx, by + 0.5 * S);
    ctx.restore();
  }
}
