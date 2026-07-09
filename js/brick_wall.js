// ============================================================
// brick_wall.js — Brick Wall painting-layer obstacle
// ============================================================
//
// A Brick Wall is a freeform patch painted over the 32×32 sand image.
// The sand beneath it is FROZEN (won't fall, can't be pulled, acts as a
// solid block) until the wall breaks.
//
// Each wall carries a countdown ("clear threshold"). Every time ANY bucket
// clears (fills 100% and pops off the belt), a white light flies from the
// popped bucket to every active wall's number badge; on impact the counter
// decrements by 1. When a wall's counter reaches 0 it lights a fuse, blinks
// for ~1.5s, then blasts apart — the freed sand unfreezes and falls under
// normal gravity, becoming collectable once it settles.
//
// Runtime wall object:
//   { id, cells:[imgIdx...], cellSet:{idx:1}, threshold, remaining,
//     state:'idle'|'fuse'|'broken', fuseT, fuseDur, flashT, damage,
//     cracks:[[{col,row}...]], bounds, badgeCol, badgeRow }
//
// Data (level) format — a top-level `walls` array on the level:
//   [ { cells:[imgIdx...], threshold: X } , ... ]
//
// Loaded AFTER belt.js and BEFORE rendering.js (mechanic-file rule).
// ============================================================

// Image-pixel size in canvas units (L.image.cell is a *sand*-cell, which is
// SAND_SUBDIV per image pixel).
function _brickImgPx() { return L.image.cell * SAND_SUBDIV; }

function _brickCanvasAt(col, row) {
  var px = _brickImgPx();
  return { x: L.image.x + col * px, y: L.image.y + row * px };
}

// ------------------------------------------------------------
// Build / freeze
// ------------------------------------------------------------

function initBrickWalls(defs) {
  brickWalls = [];
  brickLights = [];
  brickDebris = [];
  brickShake = 0;
  if (defs && defs.length) {
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var cells = (d && d.cells) ? d.cells.slice() : [];
      if (!cells.length) continue;
      var th = Math.max(1, (d.threshold | 0) || 1);
      var wall = {
        id: i,
        cells: cells,
        cellSet: {},
        color: (d.color | 0) || 0,   // only buckets of THIS color decrement the wall
        threshold: th,
        remaining: th,
        state: 'idle',
        fuseT: 0,
        fuseDur: 90,
        flashT: 0,
        damage: 0,
        cracks: []
      };
      for (var k = 0; k < cells.length; k++) wall.cellSet[cells[k]] = 1;
      computeWallBounds(wall);
      brickWalls.push(wall);
    }
  }
  buildBrickFrozenMask();
}

function computeWallBounds(wall) {
  var minc = IMG_W, maxc = -1, minr = IMG_H, maxr = -1;
  for (var k = 0; k < wall.cells.length; k++) {
    var idx = wall.cells[k];
    var col = idx % IMG_W, row = (idx / IMG_W) | 0;
    if (col < minc) minc = col;
    if (col > maxc) maxc = col;
    if (row < minr) minr = row;
    if (row > maxr) maxr = row;
  }
  wall.bounds = { minc: minc, maxc: maxc, minr: minr, maxr: maxr };
  wall.badgeCol = (minc + maxc + 1) / 2;
  wall.badgeRow = minr + 0.9;   // sit the band near the top of the patch
}

// Rebuild the frozen-cell mask from all walls that haven't broken yet.
function buildBrickFrozenMask() {
  sandFrozen = new Uint8Array(sandGrid.length);
  for (var w = 0; w < brickWalls.length; w++) {
    var wall = brickWalls[w];
    if (wall.state === 'broken') continue;
    for (var k = 0; k < wall.cells.length; k++) {
      var idx = wall.cells[k];
      var px = idx % IMG_W, py = (idx / IMG_W) | 0;
      for (var dy = 0; dy < SAND_SUBDIV; dy++) {
        for (var dx = 0; dx < SAND_SUBDIV; dx++) {
          var sx = px * SAND_SUBDIV + dx;
          var sy = py * SAND_SUBDIV + dy;
          sandFrozen[sy * SAND_W + sx] = 1;
        }
      }
    }
  }
}

// ------------------------------------------------------------
// Bucket-clear hook → spawn a light per active wall
// ------------------------------------------------------------

// A bucket of color `ci` just cleared. Only walls of the SAME color react.
function onBucketCleared(bx, by, ci) {
  for (var w = 0; w < brickWalls.length; w++) {
    var wall = brickWalls[w];
    if (wall.state !== 'idle' || wall.remaining <= 0) continue;
    if (wall.color !== ci) continue;   // color-gated: other colors don't touch it
    var bp = wallBadgeCanvas(wall);
    brickLights.push({
      x: bx, y: by,
      fromX: bx, fromY: by,
      tx: bp.x, ty: bp.y,
      t: 0, dur: 16,
      wall: wall
    });
  }
}

function wallBadgeCanvas(wall) {
  return _brickCanvasAt(wall.badgeCol, wall.badgeRow);
}

// ------------------------------------------------------------
// Per-frame update
// ------------------------------------------------------------

function updateBrickWalls() {
  // Light projectiles
  for (var i = brickLights.length - 1; i >= 0; i--) {
    var l = brickLights[i];
    l.t++;
    if (l.t >= l.dur) {
      applyWallHit(l.wall);
      brickLights.splice(i, 1);
    }
  }

  // Wall timers (flash + fuse)
  for (var w = 0; w < brickWalls.length; w++) {
    var wall = brickWalls[w];
    if (wall.flashT > 0) wall.flashT--;
    if (wall.state === 'fuse') {
      wall.fuseT++;
      if (wall.fuseT >= wall.fuseDur) blastWall(wall);
    }
  }

  // Debris physics
  for (var d = brickDebris.length - 1; d >= 0; d--) {
    var p = brickDebris[d];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.45 * S;
    p.rot += p.vr;
    p.life -= p.decay;
    if (p.life <= 0 || p.y > H + 40 * S) brickDebris.splice(d, 1);
  }

  // Screen-shake decay
  if (brickShake > 0) {
    brickShake *= 0.85;
    if (brickShake < 0.25) brickShake = 0;
  }
}

function applyWallHit(wall) {
  if (wall.state !== 'idle' || wall.remaining <= 0) return;
  wall.remaining--;
  wall.damage++;
  wall.flashT = 10;
  addWallCrack(wall);
  var bp = wallBadgeCanvas(wall);
  if (typeof spawnBurst === 'function') spawnBurst(bp.x, bp.y, '#ffffff', 5);
  if (typeof sfx !== 'undefined' && sfx.brickHit) sfx.brickHit();
  if (typeof console !== 'undefined') {
    console.log('brick_wall_progress', { wall_id: wall.id, remaining_count: wall.remaining });
  }
  if (wall.remaining <= 0) {
    wall.state = 'fuse';
    wall.fuseT = 0;
    if (typeof sfx !== 'undefined' && sfx.fuse) sfx.fuse();
  }
}

// A cumulative crack: a short kinked polyline within the wall's bounds.
function addWallCrack(wall) {
  var b = wall.bounds;
  var startCol = b.minc + Math.random() * (b.maxc - b.minc + 1);
  var startRow = b.minr + Math.random() * (b.maxr - b.minr + 1);
  var pts = [{ col: startCol, row: startRow }];
  var col = startCol, row = startRow;
  var ang = Math.random() * Math.PI * 2;
  var segs = 2 + ((Math.random() * 2) | 0);
  for (var s = 0; s < segs; s++) {
    ang += (Math.random() - 0.5) * 1.4;
    var len = 0.8 + Math.random() * 1.6;
    col += Math.cos(ang) * len;
    row += Math.sin(ang) * len;
    col = Math.max(b.minc, Math.min(b.maxc + 1, col));
    row = Math.max(b.minr, Math.min(b.maxr + 1, row));
    pts.push({ col: col, row: row });
  }
  wall.cracks.push(pts);
}

function blastWall(wall) {
  wall.state = 'broken';
  if (typeof sfx !== 'undefined' && sfx.blast) sfx.blast();
  if (typeof console !== 'undefined') console.log('brick_wall_broken', { wall_id: wall.id });

  var px = _brickImgPx();
  // Brick debris from each covered cell (capped so big walls don't storm).
  var perCell = wall.cells.length > 24 ? 2 : 4;
  for (var k = 0; k < wall.cells.length; k++) {
    var idx = wall.cells[k];
    var col = idx % IMG_W, r = (idx / IMG_W) | 0;
    var cx = L.image.x + (col + 0.5) * px;
    var cy = L.image.y + (r + 0.5) * px;
    for (var n = 0; n < perCell; n++) {
      spawnDebris(cx, cy, px, ['#b5563a', '#8e3f2c', '#c96b4a'][n % 3], 'brick');
    }
    if (brickDebris.length > 160) break;
  }
  // Metal band + dynamite debris near the badge.
  var bp = wallBadgeCanvas(wall);
  for (var m = 0; m < 7; m++) spawnDebris(bp.x, bp.y, px, ['#5b6cc9', '#8a5bd0'][m % 2], 'metal');
  for (var y = 0; y < 5; y++) spawnDebris(bp.x, bp.y, px, '#d23b2f', 'dyn');

  brickShake = Math.min(10, 6 + wall.cells.length * 0.15);
  buildBrickFrozenMask();  // unfreeze this wall — its sand now falls
}

function spawnDebris(x, y, px, color, shape) {
  var a = Math.random() * Math.PI * 2;
  var sp = (1.5 + Math.random() * 4.5);
  brickDebris.push({
    x: x, y: y,
    vx: Math.cos(a) * sp * S,
    vy: (-3 - Math.random() * 4) * S,   // erupt upward first
    r: (px * (0.22 + Math.random() * 0.3)),
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: color,
    shape: shape,
    life: 1,
    decay: 0.012 + Math.random() * 0.01
  });
}

// ------------------------------------------------------------
// Drawing — walls (on the image), then FX (on top)
// ------------------------------------------------------------

function drawBrickWalls(ctx) {
  if (!L.image || !brickWalls.length) return;
  var px = _brickImgPx();
  ctx.save();
  // Clip to the image so wall art never spills over the wooden frame.
  ctx.beginPath();
  ctx.rect(L.image.x, L.image.y, L.image.w, L.image.h);
  ctx.clip();
  for (var w = 0; w < brickWalls.length; w++) {
    var wall = brickWalls[w];
    if (wall.state === 'broken') continue;
    drawOneWall(ctx, wall, px);
  }
  ctx.restore();
}

function drawOneWall(ctx, wall, px) {
  // 1. Brick body — per covered tile, running-bond bricks over concrete.
  for (var k = 0; k < wall.cells.length; k++) {
    var idx = wall.cells[k];
    var col = idx % IMG_W, row = (idx / IMG_W) | 0;
    var x = L.image.x + col * px, y = L.image.y + row * px;
    // concrete base
    ctx.fillStyle = '#6d6660';
    ctx.fillRect(x, y, px + 0.5, px + 0.5);
    // brick face (offset by row parity → running bond)
    var off = (row & 1) ? px * 0.28 : 0;
    ctx.fillStyle = (row & 1) ? '#a24d34' : '#b5563a';
    ctx.fillRect(x + px * 0.10 + off * 0.0, y + px * 0.14, px * 0.78, px * 0.34);
    ctx.fillStyle = (row & 1) ? '#8e3f2c' : '#9c4630';
    ctx.fillRect(x + px * 0.10, y + px * 0.56, px * 0.78, px * 0.34);
    // subtle top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + px * 0.10, y + px * 0.14, px * 0.78, px * 0.06);
  }

  // 2. Freeform frame — thick concrete edge on any border with a non-member tile.
  ctx.strokeStyle = '#4c4640';
  ctx.lineWidth = Math.max(1.5, px * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (var k2 = 0; k2 < wall.cells.length; k2++) {
    var idx2 = wall.cells[k2];
    var c2 = idx2 % IMG_W, r2 = (idx2 / IMG_W) | 0;
    var bx = L.image.x + c2 * px, by = L.image.y + r2 * px;
    if (!wall.cellSet[idx2 - 1] || c2 === 0)        { ctx.moveTo(bx, by); ctx.lineTo(bx, by + px); }
    if (!wall.cellSet[idx2 + 1] || c2 === IMG_W - 1) { ctx.moveTo(bx + px, by); ctx.lineTo(bx + px, by + px); }
    if (!wall.cellSet[idx2 - IMG_W] || r2 === 0)     { ctx.moveTo(bx, by); ctx.lineTo(bx + px, by); }
    if (!wall.cellSet[idx2 + IMG_W] || r2 === IMG_H - 1) { ctx.moveTo(bx, by + px); ctx.lineTo(bx + px, by + px); }
  }
  ctx.stroke();

  // 3. Cracks — cumulative, drawn on top of the bricks.
  if (wall.cracks.length) {
    ctx.strokeStyle = 'rgba(25,18,14,0.85)';
    ctx.lineWidth = Math.max(1, px * 0.12);
    ctx.lineCap = 'round';
    for (var ci = 0; ci < wall.cracks.length; ci++) {
      var pts = wall.cracks[ci];
      ctx.beginPath();
      for (var pi = 0; pi < pts.length; pi++) {
        var cx = L.image.x + pts[pi].col * px;
        var cy = L.image.y + pts[pi].row * px;
        if (pi === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  // 4. Dynamite + metal band + number badge.
  drawWallBadge(ctx, wall, px);
}

function drawWallBadge(ctx, wall, px) {
  var bp = wallBadgeCanvas(wall);
  var bandW = Math.min(3.4, (wall.bounds.maxc - wall.bounds.minc + 1) * 0.95) * px;
  bandW = Math.max(bandW, 2.6 * px);
  var bandH = 1.25 * px;
  var bx = bp.x - bandW / 2, by = bp.y - bandH / 2;
  var fuse = wall.state === 'fuse';
  var blink = fuse ? (((tick / 8) | 0) % 2 === 0) : false;

  ctx.save();

  // Dynamite sticks behind the band (2 behind, 1 in front centered).
  drawDynStick(ctx, bp.x - bandW * 0.22, by - px * 0.55, px * 0.42, px * 1.0, fuse);
  drawDynStick(ctx, bp.x + bandW * 0.22, by - px * 0.55, px * 0.42, px * 1.0, fuse);

  // Metal band — tinted to the wall's color so its trigger color is readable
  // at a glance (only buckets of this color decrement the wall).
  var wc = COLORS[wall.color] || COLORS[0];
  var g = ctx.createLinearGradient(bx, by, bx, by + bandH);
  g.addColorStop(0, wc.light);
  g.addColorStop(0.5, wc.fill);
  g.addColorStop(1, wc.dark);
  ctx.fillStyle = g;
  rRect(bx, by, bandW, bandH, bandH * 0.28); ctx.fill();
  ctx.strokeStyle = wc.dark;
  ctx.lineWidth = Math.max(1, px * 0.10);
  rRect(bx, by, bandW, bandH, bandH * 0.28); ctx.stroke();
  // rivets
  ctx.fillStyle = '#d8ddff';
  var rv = Math.max(1.2, px * 0.14);
  ctx.beginPath(); ctx.arc(bx + bandH * 0.35, by + bandH / 2, rv, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + bandW - bandH * 0.35, by + bandH / 2, rv, 0, Math.PI * 2); ctx.fill();

  // Center dynamite stick in front.
  drawDynStick(ctx, bp.x, by - px * 0.7, px * 0.5, px * 1.15, fuse);

  // Number badge.
  var numTxt = '' + Math.max(0, wall.remaining);
  var fs = bandH * 0.92;
  ctx.font = 'bold ' + fs + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var flash = wall.flashT > 0 ? (wall.flashT / 10) : 0;
  if (!(fuse && !blink)) {
    // dark outline for legibility over bricks
    ctx.lineWidth = Math.max(2, px * 0.22);
    ctx.strokeStyle = 'rgba(20,14,10,0.9)';
    ctx.strokeText(numTxt, bp.x, by + bandH / 2);
    ctx.fillStyle = flash > 0 ? 'rgba(255,255,220,1)' : '#fff';
    if (flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12 * S * flash; }
    ctx.fillText(numTxt, bp.x, by + bandH / 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawDynStick(ctx, cx, topY, w, h, lit) {
  ctx.save();
  // stick body
  var g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, '#e0503f');
  g.addColorStop(0.5, '#d23b2f');
  g.addColorStop(1, '#a52a20');
  ctx.fillStyle = g;
  rRect(cx - w / 2, topY, w, h, w * 0.3); ctx.fill();
  // band label
  ctx.fillStyle = '#f2d38a';
  ctx.fillRect(cx - w / 2, topY + h * 0.42, w, h * 0.16);
  // fuse/candle wick on top
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = Math.max(1, w * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx, topY - h * 0.28);
  ctx.stroke();
  if (lit) {
    // flickering flame
    var fr = w * (0.42 + 0.18 * Math.sin(tick * 0.6 + cx));
    var fy = topY - h * 0.28;
    ctx.fillStyle = 'rgba(255,180,40,0.95)';
    ctx.beginPath(); ctx.arc(cx, fy, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,150,0.95)';
    ctx.beginPath(); ctx.arc(cx, fy, fr * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Lights + debris on the very top of the frame.
function drawBrickWallFX(ctx) {
  // Light projectiles (cleared bucket → wall badge).
  for (var i = 0; i < brickLights.length; i++) {
    var l = brickLights[i];
    var p = l.t / l.dur;
    var x = l.fromX + (l.tx - l.fromX) * p;
    var y = l.fromY + (l.ty - l.fromY) * p;
    // short trailing tail
    ctx.save();
    var tail = 6;
    for (var s = 0; s < tail; s++) {
      var pp = Math.max(0, p - s * 0.03);
      var tx = l.fromX + (l.tx - l.fromX) * pp;
      var ty = l.fromY + (l.ty - l.fromY) * pp;
      ctx.globalAlpha = (1 - s / tail) * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(tx, ty, (4 - s * 0.4) * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10 * S;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 4.5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Blast debris.
  for (var d = 0; d < brickDebris.length; d++) {
    var q = brickDebris[d];
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life));
    ctx.translate(q.x, q.y);
    ctx.rotate(q.rot);
    ctx.fillStyle = q.color;
    if (q.shape === 'dyn') {
      ctx.beginPath(); ctx.arc(0, 0, q.r * 0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      var ww = q.r * (q.shape === 'metal' ? 1.6 : 1.2);
      var hh = q.r * 0.9;
      ctx.fillRect(-ww / 2, -hh / 2, ww, hh);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
