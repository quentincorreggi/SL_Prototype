// ============================================================
// bomb.js — Colored Sand Bomb mechanic
// ============================================================
//
// A bomb is a grid ingredient (kind: 'bomb') with a single color.
// Activation rule: same as a bucket — there must be an open path of
// passable cells (empty / used-bucket / used-bomb / tunnel) from the
// bomb's cell to the belt edge (above row 0).
//
// When tapped, the bomb:
//   1. Is marked used (becomes passable, like a used bucket)
//   2. Arcs from its grid cell up to a random landing point in the
//      sand image
//   3. Detonates on arrival — fills a filled disc of sand with the
//      bomb's color, pushing any existing sand radially outward
//   4. Spawns particles + audio
//
// The bomb's payload (BOMB_PAYLOAD_GRAINS) is added to the level's
// total sand-of-color count at level init, so bucket capacities are
// pre-sized to absorb the bomb's contribution. Until the bomb fires,
// those grains are "phantom" — buckets ride the belt waiting for
// them to appear.
// ============================================================

// Disc radius in sand-cell units (subdivision-independent).
var BOMB_RADIUS_SAND_CELLS = 5;

// Cached payload count (cells inside the disc). Computed lazily.
var _bombPayloadCache = -1;

function bombPayloadGrains() {
  if (_bombPayloadCache >= 0) return _bombPayloadCache;
  var r = BOMB_RADIUS_SAND_CELLS;
  var n = 0;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) n++;
    }
  }
  _bombPayloadCache = n;
  return n;
}

function invalidateBombPayloadCache() { _bombPayloadCache = -1; }

// In-flight bomb animations (grid → image arc).
// Each entry: { ci, fromX, fromY, toX, toY, centerX, centerY, t, dur }
var bombFlights = [];

// ============================================================
// Firing
// ============================================================

function fireBomb(cell, idx) {
  // Pick a random landing center such that the full disc fits in
  // the image. Coords are in sand-cell units.
  var r = BOMB_RADIUS_SAND_CELLS;
  var minC = r;
  var maxCX = SAND_W - r - 1;
  var maxCY = SAND_H - r - 1;
  if (maxCX < minC || maxCY < minC) {
    // Image too small for the disc — clamp center to mid-image.
    var fallbackX = Math.floor(SAND_W / 2);
    var fallbackY = Math.floor(SAND_H / 2);
    queueBombFlight(cell.ci, idx, fallbackX, fallbackY);
    return;
  }
  var cx = minC + Math.floor(Math.random() * (maxCX - minC + 1));
  var cy = minC + Math.floor(Math.random() * (maxCY - minC + 1));
  queueBombFlight(cell.ci, idx, cx, cy);
}

function queueBombFlight(ci, gridIdxFrom, sandCX, sandCY) {
  var r = (gridIdxFrom / GRID_W) | 0;
  var c = gridIdxFrom % GRID_W;
  var from = gridCellCenter(r, c);
  var to = sandCellToCanvas(sandCX, sandCY);
  bombFlights.push({
    ci: ci,
    fromX: from.x, fromY: from.y,
    toX: to.x, toY: to.y,
    centerX: sandCX, centerY: sandCY,
    t: 0,
    dur: BOMB_FLIGHT_FRAMES
  });
  if (typeof sfx !== 'undefined' && sfx.bombLaunch) sfx.bombLaunch();
}

function sandCellToCanvas(sx, sy) {
  return {
    x: L.image.x + (sx + 0.5) * L.image.cell,
    y: L.image.y + (sy + 0.5) * L.image.cell
  };
}

// ============================================================
// Update — advance flights, detonate on arrival
// ============================================================

function updateBombFlights() {
  for (var i = bombFlights.length - 1; i >= 0; i--) {
    var f = bombFlights[i];
    f.t++;
    // Trail sparks while in flight
    if (typeof spawnBurst === 'function' && (f.t % 3) === 0) {
      var p = f.t / f.dur;
      var x = f.fromX + (f.toX - f.fromX) * p;
      var y = f.fromY + (f.toY - f.fromY) * p;
      var arc = -180 * S * Math.sin(p * Math.PI);
      particles.push({
        x: x, y: y + arc,
        vx: (Math.random() - 0.5) * 1.5 * S,
        vy: (Math.random() - 0.5) * 1.5 * S,
        r: (1.5 + Math.random() * 1.5) * S,
        color: COLORS[f.ci].fill,
        life: 1, decay: 0.05, grav: false
      });
    }
    if (f.t >= f.dur) {
      detonateBomb(f.centerX, f.centerY, f.ci, f.toX, f.toY);
      bombFlights.splice(i, 1);
    }
  }
}

// ============================================================
// Detonation — fill the disc, push existing sand outward
// ============================================================

function detonateBomb(centerX, centerY, ci, canvasX, canvasY) {
  var r = BOMB_RADIUS_SAND_CELLS;
  var displaced = [];

  // Step 1: collect existing sand inside the disc and clear it.
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      var x = centerX + dx, y = centerY + dy;
      if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) continue;
      var sIdx = sandIdx(x, y);
      var existing = sandGrid[sIdx];
      if (existing >= 0) {
        displaced.push({ x: x, y: y, ci: existing });
        sandGrid[sIdx] = -1;
      }
    }
  }

  // Step 2: relocate displaced grains outward (radial first, then
  // spiral fallback to guarantee placement when possible).
  for (var i = 0; i < displaced.length; i++) {
    var g = displaced[i];
    var dst = relocateGrainOutward(g.x, g.y, centerX, centerY);
    if (dst) sandGrid[sandIdx(dst.x, dst.y)] = g.ci;
    // If no empty cell anywhere, grain is lost — updateColorDepletion
    // will eventually auto-pop any bucket left waiting for it.
  }

  // Step 3: fill the disc with bomb-color grains.
  for (var dy2 = -r; dy2 <= r; dy2++) {
    for (var dx2 = -r; dx2 <= r; dx2++) {
      if (dx2 * dx2 + dy2 * dy2 > r * r) continue;
      var x2 = centerX + dx2, y2 = centerY + dy2;
      if (x2 < 0 || x2 >= SAND_W || y2 < 0 || y2 >= SAND_H) continue;
      sandGrid[sandIdx(x2, y2)] = ci;
    }
  }

  // Step 4: visual + audio feedback
  if (typeof spawnBurst === 'function') {
    spawnBurst(canvasX, canvasY, COLORS[ci].fill, 26);
  }
  if (typeof sfx !== 'undefined' && sfx.bombDetonate) sfx.bombDetonate();
}

// Walk radially outward from (gx,gy) away from (cx,cy) to find the
// first empty cell. If the radial walk leaves the image, fall back
// to a spiral search around (gx,gy) for any empty cell anywhere.
function relocateGrainOutward(gx, gy, cx, cy) {
  var dx = gx - cx, dy = gy - cy;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5) {
    // Grain sits exactly at disc center — push straight up.
    dx = 0; dy = -1;
  } else {
    dx /= len; dy /= len;
  }
  // Radial walk
  var maxStep = SAND_W + SAND_H;
  for (var step = 1; step <= maxStep; step++) {
    var nx = Math.round(gx + dx * step);
    var ny = Math.round(gy + dy * step);
    if (nx < 0 || nx >= SAND_W || ny < 0 || ny >= SAND_H) break;
    if (sandGrid[sandIdx(nx, ny)] < 0) return { x: nx, y: ny };
  }
  // Spiral fallback — expanding rings around original position.
  for (var ring = 1; ring < Math.max(SAND_W, SAND_H); ring++) {
    for (var oy = -ring; oy <= ring; oy++) {
      for (var ox = -ring; ox <= ring; ox++) {
        if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) continue;
        var sx = gx + ox, sy = gy + oy;
        if (sx < 0 || sx >= SAND_W || sy < 0 || sy >= SAND_H) continue;
        if (sandGrid[sandIdx(sx, sy)] < 0) return { x: sx, y: sy };
      }
    }
  }
  return null;
}

// ============================================================
// Rendering — bomb on the grid
// ============================================================

function drawBombActive(ctx, x, y, w, h, ci, S, tick) {
  var c = COLORS[ci];
  var cx = x + w / 2;
  var bodyR = Math.min(w, h) * 0.32;
  var bodyCY = y + h * 0.62;
  var fuseTop = y + h * 0.16;

  ctx.save();

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.92, bodyR * 0.9, bodyR * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fuse line
  ctx.strokeStyle = '#3A2A18';
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, bodyCY - bodyR * 0.9);
  ctx.quadraticCurveTo(cx + bodyR * 0.4, fuseTop + h * 0.05, cx + bodyR * 0.15, fuseTop);
  ctx.stroke();

  // Fuse spark (pulsing)
  var sparkPulse = 0.55 + 0.45 * Math.sin(tick * 0.35);
  var sparkR = (2.2 + sparkPulse * 1.6) * S;
  var sparkX = cx + bodyR * 0.15;
  var sparkY = fuseTop;
  // Spark glow
  var sparkGrad = ctx.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, sparkR * 3);
  sparkGrad.addColorStop(0, 'rgba(255,240,140,' + (0.55 + sparkPulse * 0.4) + ')');
  sparkGrad.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = sparkGrad;
  ctx.beginPath();
  ctx.arc(sparkX, sparkY, sparkR * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff7c0';
  ctx.beginPath();
  ctx.arc(sparkX, sparkY, sparkR, 0, Math.PI * 2);
  ctx.fill();

  // Bomb body — dark metallic sphere tinted with color
  var bodyGrad = ctx.createRadialGradient(
    cx - bodyR * 0.35, bodyCY - bodyR * 0.35, bodyR * 0.1,
    cx, bodyCY, bodyR
  );
  bodyGrad.addColorStop(0, c.light);
  bodyGrad.addColorStop(0.45, c.fill);
  bodyGrad.addColorStop(1, '#1A1410');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, bodyCY, bodyR, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.strokeStyle = '#1A1410';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.arc(cx, bodyCY, bodyR, 0, Math.PI * 2);
  ctx.stroke();

  // Color band
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, bodyCY, bodyR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = c.fill;
  ctx.fillRect(cx - bodyR, bodyCY - bodyR * 0.18, bodyR * 2, bodyR * 0.36);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(cx - bodyR, bodyCY + bodyR * 0.18, bodyR * 2, 1.5 * S);
  ctx.fillRect(cx - bodyR, bodyCY - bodyR * 0.18 - 1.5 * S, bodyR * 2, 1.5 * S);
  ctx.restore();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - bodyR * 0.4, bodyCY - bodyR * 0.45, bodyR * 0.25, bodyR * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Tiny 💣 hint badge isn't drawn here — the body shape itself is the icon.
  ctx.restore();
}

function drawBombInactive(ctx, x, y, w, h, ci, S, tick) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawBombActive(ctx, x, y, w, h, ci, S, 0);
  ctx.restore();
  // Lock overlay
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold ' + (h * 0.32) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2 * S;
  ctx.fillText('🔒', x + w / 2, y + h * 0.6);
  ctx.restore();
}

function drawUsedBomb(ctx, x, y, w, h, ci, S) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  var cx = x + w / 2;
  var cy = y + h * 0.62;
  var bodyR = Math.min(w, h) * 0.30;
  ctx.fillStyle = COLORS[ci].dark;
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS[ci].dark;
  ctx.lineWidth = 1.5 * S;
  ctx.setLineDash([3 * S, 3 * S]);
  ctx.beginPath();
  ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ============================================================
// Rendering — in-flight bombs (arcing toward the image)
// ============================================================

function drawBombFlights() {
  for (var i = 0; i < bombFlights.length; i++) {
    var f = bombFlights[i];
    var p = f.t / f.dur;
    var x = f.fromX + (f.toX - f.fromX) * p;
    var y = f.fromY + (f.toY - f.fromY) * p;
    var arc = -180 * S * Math.sin(p * Math.PI);
    y += arc;
    var rot = (p - 0.5) * 1.6;
    var size = (L.belt ? L.belt.cell : 60 * S) * 0.85;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // drawBombActive places the body at y + h*0.62; shift so the body
    // center sits on the trajectory point during flight.
    drawBombActive(ctx, -size / 2, -size / 2 - size * 0.12, size, size, f.ci, S, tick);
    ctx.restore();
  }
}
