// ============================================================
// bucket_gem.js — Gem Bucket (gem-gated lock variant)
// ============================================================
//
// A Gem Bucket starts locked and shows an empty hexagonal gem slot on top.
// It is placed in the grid and tapped onto the belt like any bucket (it
// obeys the normal path/slot rules). While locked it collects no sand — but
// while it rides the belt it watches for its matching-color gemstone. When
// that gem comes within attraction range, the bucket pulls it in, the slot
// fills, and the bucket opens and starts collecting its color normally.
//
// The gemstone lives in the sand image and rides the same falling-sand CA as
// the grain it sits among (encoded as GEM_BASE + ci inside sandGrid). The
// player clears the sand beneath a gem so it drops to where a sweeping gem
// bucket can reach it.
//
// Level data:
//   grid cell:   { kind:'bucket', type:'gembucket', ci }
//   gems:        level.gems = [ { px, py, ci } ]   (image-pixel coords)
//
// On-belt object fields:
//   locked:      true until the gem is collected
//   hasGem:      true once the gem is seated (drives the filled-slot visual)
//   unlockAnimT: -1 idle, else 0..CONVEYOR_UNLOCK_FRAMES (open animation)
// ============================================================

registerBucketType('gembucket', {
  label: 'Gem',
  editorColor: '#7A4FB5',

  // Grid/belt drawing is handled in rendering.js (needs lock/gem state); these
  // are safe fallbacks.
  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    drawGemSocket(ctx, x + w / 2, y + h * 0.14, w * 0.22, ci, false, S);
  },
  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save(); ctx.globalAlpha = 0.55;
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    drawGemSocket(ctx, x + w / 2, y + h * 0.14, w * 0.22, ci, false, S);
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
  editorCellHTML: function (ci) { return '<span class="ed-cell-dot">⬡</span>'; }
});

// ------------------------------------------------------------
// Gem search + collection
// ------------------------------------------------------------

// Nearest gem of color ci within maxR sand-cells of (cx, cy). Returns {x,y} or null.
function findGemInRadius(cx, cy, ci, maxR) {
  var want = GEM_BASE + ci;
  var bestX = -1, bestY = -1, bestD2 = maxR * maxR + 1;
  var minX = Math.max(0, Math.floor(cx - maxR));
  var maxX = Math.min(SAND_W - 1, Math.ceil(cx + maxR));
  var minY = Math.max(0, Math.floor(cy - maxR));
  var maxY = Math.min(SAND_H - 1, Math.ceil(cy + maxR));
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      if (sandGrid[sandIdx(x, y)] !== want) continue;
      var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestX = x; bestY = y; }
    }
  }
  if (bestX < 0) return null;
  return { x: bestX, y: bestY };
}

// Called from bucket_attraction.js for every locked belt bucket. Only gem
// buckets act on it; for the counter-lock variants it is a no-op.
function tryGemUnlock(b, slot) {
  if (!b || b.type !== 'gembucket' || !b.locked || b.gemIncoming) return;
  var sp = getBeltSlotSandPos(slot);
  var radius = ATTRACT_RADIUS_CELLS * SAND_SUBDIV;
  var gem = findGemInRadius(sp.x, sp.y, b.ci, radius);
  if (!gem) return;
  extractGrain(gem.x, gem.y);            // remove the gem from the sand grid
  b.gemIncoming = true;                  // stop searching while the gem flies in
  spawnGemTrail(gem.x, gem.y, slot, b.ci);
}

function spawnGemTrail(sandX, sandY, slot, ci) {
  var ox = L.image.x + (sandX + 0.5) * L.image.cell;
  var oy = L.image.y + (sandY + 0.5) * L.image.cell;
  var bpos = getBeltSlotPos(slot);
  attractionTrails.push({
    fromX: ox, fromY: oy,
    toX: bpos.x, toY: bpos.y,
    slot: slot,
    bucketRef: beltSlots[slot],
    ci: ci,
    gem: true,                           // drawn as a hexagon; unlocks on arrival
    t: 0,
    dur: BUCKET_TRAIL_FRAMES
  });
}

// Called from updateAttractionTrails when a gem trail reaches its bucket.
function onGemTrailArrive(t) {
  for (var s = 0; s < BELT_SLOTS; s++) {
    if (beltSlots[s] === t.bucketRef) { unlockGemBucket(beltSlots[s], s); return; }
  }
}

function unlockGemBucket(b, slot) {
  if (!b || !b.locked) return;
  b.locked = false;
  b.gemIncoming = false;
  b.hasGem = true;
  b.unlockAnimT = 0;
  b.pullCooldown = ATTRACT_PULL_FRAMES;
  if (typeof spawnBurst === 'function' && L.belt) {
    var pos = getBeltSlotPos(slot);
    spawnBurst(pos.x, pos.y, COLORS[b.ci].fill, 16);
    spawnBurst(pos.x, pos.y, '#ffffff', 8);
  }
  if (typeof sfx !== 'undefined' && sfx.unlock) sfx.unlock();
}

// Safety net (called from relieveConveyorSoftlock): a gem bucket can only open
// by collecting its gem, so if the game would otherwise dead-end, pull any
// remaining matching gem out of the grid and open the bucket.
function forceUnlockGemBucket(b, slot) {
  if (!b || !b.locked) return;
  var want = GEM_BASE + b.ci;
  for (var i = 0; i < sandGrid.length; i++) {
    if (sandGrid[i] === want) { sandGrid[i] = -1; break; }
  }
  unlockGemBucket(b, slot);
}

// ------------------------------------------------------------
// Shape helpers
// ------------------------------------------------------------

// Flat-top hexagon path centered at (cx, cy) with circum-radius r.
function hexPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (var i = 0; i < 6; i++) {
    var a = Math.PI / 6 + i * Math.PI / 3; // 30° offset → pointy left/right, flat-ish top
    var px = cx + r * Math.cos(a);
    var py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// A faceted gemstone hexagon (used in the sand image, the trail, and the
// seated slot). cx, cy, r in canvas units.
function drawGem(ctx, cx, cy, r, ci, S) {
  var c = COLORS[ci];
  ctx.save();
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = 6 * S;
  hexPath(ctx, cx, cy, r);
  var g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, c.light);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  // Facets
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.5, r * 0.10);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.3);
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.lineTo(cx, cy + r * 0.85);
  ctx.stroke();
  // Outline
  hexPath(ctx, cx, cy, r);
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = Math.max(0.6, r * 0.14);
  ctx.stroke();
  // Sparkle
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy - r * 0.38, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The slot on top of a gem bucket: a dark recess ringed in the bucket color.
// When `filled`, the matching gem is seated inside it.
function drawGemSocket(ctx, cx, cy, r, ci, filled, S) {
  var c = COLORS[ci];
  ctx.save();
  if (filled) {
    drawGem(ctx, cx, cy, r, ci, S);
  } else {
    // Empty recess
    hexPath(ctx, cx, cy, r);
    ctx.fillStyle = 'rgba(20,16,26,0.55)';
    ctx.fill();
    // Colored rim so the player knows which gem fits
    hexPath(ctx, cx, cy, r);
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.setLineDash([r * 0.5, r * 0.32]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Faint ghost gem hint
    ctx.globalAlpha = 0.22;
    hexPath(ctx, cx, cy, r * 0.66);
    ctx.fillStyle = c.fill;
    ctx.fill();
  }
  ctx.restore();
}

// Draw a gemstone sitting in the sand image at sand-cell (gx, gy).
function drawGemCell(ctx, gx, gy, ci, S) {
  if (!L.image) return;
  var cs = L.image.cell;
  var cx = L.image.x + (gx + 0.5) * cs;
  var cy = L.image.y + (gy + 0.5) * cs;
  drawGem(ctx, cx, cy, cs * 2.4, ci, S);
}

// ------------------------------------------------------------
// Bucket rendering (called from rendering.js)
// ------------------------------------------------------------

function drawGemBucketGrid(ctx, x, y, w, h, cell, S, tick) {
  var dim = !cell.active;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.55;
  drawJar(ctx, x, y, w, h, cell.ci, S, 0, 0);
  ctx.restore();
  drawGemSocket(ctx, x + w / 2, y + h * 0.13, w * 0.22, cell.ci, false, S);
}

function drawGemBucketBelt(ctx, x, y, w, h, b, S, tick) {
  drawJar(ctx, x, y, w, h, b.ci, S, b.fill || 0, b.capacity || 0);
  var anim = b.unlockAnimT;
  var animating = anim != null && anim >= 0 && anim < CONVEYOR_UNLOCK_FRAMES;
  // Socket: empty while locked, seated gem once opened.
  drawGemSocket(ctx, x + w / 2, y + h * 0.13, w * 0.22, b.ci, !b.locked, S);
  if (animating) {
    var p = anim / CONVEYOR_UNLOCK_FRAMES;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.strokeStyle = '#FFF4C2';
    ctx.lineWidth = Math.max(0.5, 3 * S * (1 - p));
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w * 0.4 + p * w * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
