// ============================================================
// key.js — Key piece (unlocks a matching-colour sieve)
// ============================================================
//
// A key sits in the 7×7 grid like a bucket and obeys the same activation
// rule: it's "active" once there's an open path from its cell up to the
// belt edge. Unlike a bucket it never rides the belt — the instant it
// becomes active it AUTO-LAUNCHES, arcing up into the sand image and
// slamming into the nearest still-locked sieve of its own colour, which
// unlocks and spills its trapped sand.
//
// Stock cell shape: { kind:'key', ci, used, active, fired }
//   used  — true once it has launched (becomes passable for the BFS)
//   fired — guards against launching twice
//
// A key with no matching locked sieve simply fizzles in place (harmless).
// ============================================================

function isKey(cell) { return cell && cell.kind === 'key'; }

// Launch every active, not-yet-fired key. Called each frame from update()
// after activation has been recomputed.
function updateKeys() {
  var firedAny = false;
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell || cell.kind !== 'key') continue;
    if (cell.used || cell.fired || !cell.active) continue;
    fireKey(i);
    firedAny = true;
  }
  if (firedAny) {
    updateTunnels();
    updateBucketActivation();
  }
}

function fireKey(idx) {
  var cell = stock[idx];
  cell.fired = true;
  cell.used = true; // path now passes through this cell

  var r = (idx / GRID_W) | 0, c = idx % GRID_W;
  var from = gridCellCenter(r, c);
  var target = nearestLockedSieve(cell.ci, from.x, from.y);

  if (target < 0) {
    // No sieve to open — fizzle politely.
    if (typeof spawnBurst === 'function') spawnBurst(from.x, from.y, COLORS[cell.ci].fill, 8);
    if (typeof sfx !== 'undefined') sfx.drop();
    return;
  }

  var to = sieveCupCenter(target);
  keyFlyers.push({
    ci: cell.ci,
    fromX: from.x, fromY: from.y,
    toX: to.x, toY: to.y,
    sieveIdx: target,
    t: 0, dur: KEY_FLY_FRAMES
  });
  if (typeof sfx !== 'undefined') sfx.keyfly();
}

function updateKeyFlyers() {
  for (var i = keyFlyers.length - 1; i >= 0; i--) {
    var f = keyFlyers[i];
    f.t++;
    if (f.t >= f.dur) {
      unlockSieve(f.sieveIdx);
      keyFlyers.splice(i, 1);
    }
  }
}

// ============================================================
// Drawing
// ============================================================

// Grid cell — active keys glow, inactive ones dim with a small lock.
function drawKey(ctx, x, y, w, h, ci, S, tick, active, used) {
  if (used) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = COLORS[ci].dark;
    rRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 5 * S); ctx.fill();
    ctx.restore();
    return;
  }
  var c = COLORS[ci];
  ctx.save();
  if (!active) ctx.globalAlpha = 0.55;

  // Rounded colored tile backing
  var g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c.light);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  rRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84, 7 * S); ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.5 * S;
  rRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84, 7 * S); ctx.stroke();

  if (active) {
    var pulse = 0.5 + 0.5 * Math.sin(tick * 0.12);
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = (5 + 7 * pulse) * S;
  }
  drawKeyGlyph(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.34, S, '#fff');
  ctx.restore();

  if (!active) {
    // Tiny lock to read as "blocked" like inactive buckets.
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.26) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x + w * 0.72, y + h * 0.74);
    ctx.restore();
  }
}

// A simple key silhouette (round bow + shaft + two teeth).
function drawKeyGlyph(ctx, cx, cy, r, S, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4); // diagonal, jaunty
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1 * S;
  // Bow (ring)
  ctx.beginPath();
  ctx.arc(-r * 0.7, 0, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.arc(-r * 0.7, 0, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  // Shaft
  ctx.fillStyle = color;
  ctx.fillRect(-r * 0.2, -r * 0.16, r * 1.25, r * 0.32);
  // Teeth
  ctx.fillRect(r * 0.75, r * 0.16, r * 0.16, r * 0.4);
  ctx.fillRect(r * 0.98, r * 0.16, r * 0.16, r * 0.55);
  ctx.restore();
}

function drawKeyFlyers() {
  for (var i = 0; i < keyFlyers.length; i++) {
    var f = keyFlyers[i];
    var p = f.t / f.dur;
    var x = f.fromX + (f.toX - f.fromX) * p;
    var y = f.fromY + (f.toY - f.fromY) * p;
    // Tall arc up toward the image.
    y += -160 * S * Math.sin(p * Math.PI);
    var c = COLORS[f.ci];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p * Math.PI * 4); // spin
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 10 * S;
    // little colored disc behind the key
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * S, 0, Math.PI * 2);
    ctx.fill();
    drawKeyGlyph(ctx, 0, 0, 9 * S, S, '#fff');
    ctx.restore();
  }
}
