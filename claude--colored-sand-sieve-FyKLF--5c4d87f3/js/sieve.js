// ============================================================
// sieve.js — Colored sand sieve (U-cup filter in the sand image)
// ============================================================
//
// A sieve is a U-shaped cup painted into the sand image, tinted a single
// colour. While LOCKED it behaves like a colour filter:
//   - grains of its OWN colour are caught and pile up inside the cup
//     (the floor blocks them, the walls hold them in)
//   - grains of ANY OTHER colour fall straight through the mesh floor
//
// The caught sand is real sand sitting in the cup, so it still counts
// toward the level total (you can't win until it's released) and buckets
// on the belt can't reach it — `sieveTrapGrid` marks those cells as
// un-pullable while locked.
//
// A matching-colour Key (see key.js) unlocks the sieve: the walls/floor
// vanish, the trapped sand falls out, and the cup goes inert.
//
// Geometry (sand-cell units), thickness T = SAND_SUBDIV (= 1 image pixel):
//   left wall  : cols [x0, x0+T)          rows [y0, y1)
//   right wall : cols [x1-T, x1)          rows [y0, y1)
//   floor      : cols [x0, x1)            rows [y1-T, y1)
//   interior   : open top, fills with caught sand
// ============================================================

// Build the runtime sieve instances from level data. Each level sieve is
// stored in image-pixel coords { ci, px, py, pw, ph }; we expand to sand
// cells and pre-absorb any matching sand already inside the footprint.
function initSieves(levelSieves) {
  sieves = [];
  keyFlyers = [];
  if (levelSieves) {
    for (var i = 0; i < levelSieves.length; i++) {
      var sv = levelSieves[i];
      if (!sv) continue;
      var t = SAND_SUBDIV;
      var x0 = (sv.px | 0) * SAND_SUBDIV;
      var y0 = (sv.py | 0) * SAND_SUBDIV;
      var x1 = ((sv.px | 0) + (sv.pw | 0)) * SAND_SUBDIV;
      var y1 = ((sv.py | 0) + (sv.ph | 0)) * SAND_SUBDIV;
      // Clamp to the sand grid.
      x0 = Math.max(0, Math.min(SAND_W, x0));
      x1 = Math.max(0, Math.min(SAND_W, x1));
      y0 = Math.max(0, Math.min(SAND_H, y0));
      y1 = Math.max(0, Math.min(SAND_H, y1));
      if (x1 - x0 < t * 2 || y1 - y0 < t + 1) continue; // too small for a cup
      sieves.push({
        ci: sv.ci | 0,
        x0: x0, y0: y0, x1: x1, y1: y1, t: t,
        locked: true,
        unlockT: 0
      });
    }
  }
  buildSieveGrids();
}

// Rebuild the per-cell solidity + trap lookups. Only LOCKED sieves
// contribute; an unlocked sieve leaves no trace (its sand falls freely).
function buildSieveGrids() {
  sieveSolidGrid = new Int16Array(SAND_W * SAND_H);
  sieveTrapGrid = new Uint8Array(SAND_W * SAND_H);
  for (var i = 0; i < sieves.length; i++) {
    var s = sieves[i];
    if (!s.locked) continue;
    var code = (i + 1) << 2;
    for (var y = s.y0; y < s.y1; y++) {
      for (var x = s.x0; x < s.x1; x++) {
        var idx = y * SAND_W + x;
        sieveTrapGrid[idx] = 1;
        // Floor first, then walls take precedence at the corners so the
        // outer shell stays fully solid and the pile can't slip out.
        var kind = 0;
        if (y >= s.y1 - s.t) kind = SIEVE_FLOOR;
        if (x < s.x0 + s.t || x >= s.x1 - s.t) kind = SIEVE_WALL;
        if (kind) sieveSolidGrid[idx] = code | kind;
      }
    }
  }
}

// CA query: is the target cell solid for a grain of colour `ci`?
//   walls  block every colour, floor blocks only the sieve's own colour.
function sieveBlocks(idx, ci) {
  if (!sieveSolidGrid) return false;
  var v = sieveSolidGrid[idx];
  if (v === 0) return false;
  var kind = v & 3;
  if (kind === SIEVE_WALL) return true;
  // floor — blocks only the matching colour
  var s = sieves[(v >> 2) - 1];
  return s && s.ci === ci;
}

// Attraction query: is this sand cell trapped inside a locked sieve?
function sandCellTrapped(x, y) {
  if (!sieveTrapGrid) return false;
  return sieveTrapGrid[y * SAND_W + x] === 1;
}

// Unlock a sieve: open the cup, spill the sand, play feedback.
function unlockSieve(i) {
  var s = sieves[i];
  if (!s || !s.locked) return;
  s.locked = false;
  s.unlockT = SIEVE_UNLOCK_FRAMES;
  buildSieveGrids();
  if (L.image) {
    var cx = L.image.x + ((s.x0 + s.x1) / 2) * L.image.cell;
    var cy = L.image.y + ((s.y0 + s.y1) / 2) * L.image.cell;
    if (typeof spawnBurst === 'function') spawnBurst(cx, cy, COLORS[s.ci].fill, 22);
  }
  if (typeof sfx !== 'undefined') sfx.unlock();
}

// Nearest still-locked sieve of colour `ci`, by cup-centre distance from a
// canvas point. Returns the sieve index or -1.
function nearestLockedSieve(ci, fromX, fromY) {
  var best = -1, bestD = Infinity;
  for (var i = 0; i < sieves.length; i++) {
    var s = sieves[i];
    if (!s.locked || s.ci !== ci) continue;
    if (!L.image) { return i; }
    var cx = L.image.x + ((s.x0 + s.x1) / 2) * L.image.cell;
    var cy = L.image.y + ((s.y0 + s.y1) / 2) * L.image.cell;
    var dx = cx - fromX, dy = cy - fromY, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Canvas-space centre of a sieve cup (for key targeting / particles).
function sieveCupCenter(i) {
  var s = sieves[i];
  if (!s || !L.image) return { x: W / 2, y: H * 0.2 };
  return {
    x: L.image.x + ((s.x0 + s.x1) / 2) * L.image.cell,
    y: L.image.y + ((s.y0 + s.y1) / 2) * L.image.cell
  };
}

function updateSieves() {
  for (var i = 0; i < sieves.length; i++) {
    if (sieves[i].unlockT > 0) sieves[i].unlockT--;
  }
}

// ============================================================
// Rendering — called from drawFrame() after the sand image.
// ============================================================

// One metallic bar of a sieve frame, tinted by colour `c`.
function drawSieveBar(c, bx, by, bw, bh) {
  var g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  g.addColorStop(0, c.light);
  g.addColorStop(0.5, c.fill);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  rRect(bx, by, bw, bh, 2 * S); ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1 * S;
  rRect(bx, by, bw, bh, 2 * S); ctx.stroke();
}

function drawSieves() {
  if (!L.image || !sieves.length) return;
  var cell = L.image.cell;
  ctx.save();
  // Clip to the image so the cup never bleeds over the wood frame.
  ctx.beginPath();
  rRect(L.image.x, L.image.y, L.image.w, L.image.h, 2 * S);
  ctx.clip();

  for (var i = 0; i < sieves.length; i++) {
    var s = sieves[i];
    var c = COLORS[s.ci];
    var px = L.image.x + s.x0 * cell;
    var py = L.image.y + s.y0 * cell;
    var pw = (s.x1 - s.x0) * cell;
    var ph = (s.y1 - s.y0) * cell;
    var tw = s.t * cell; // wall / floor thickness in canvas px

    // Unlock animation: fade + lift the frame out as it dissolves.
    var open = s.unlockT > 0 ? (1 - s.unlockT / SIEVE_UNLOCK_FRAMES) : (s.locked ? 0 : 1);
    if (!s.locked && s.unlockT <= 0) continue; // fully unlocked → nothing to draw
    var alpha = s.locked ? 1 : Math.max(0, 1 - open);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Soft colour glow behind the cup while it holds sand.
    if (s.locked) {
      var pulse = 0.5 + 0.5 * Math.sin(tick * 0.06);
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = (6 + 6 * pulse) * S;
    }

    // Three metallic bars: left wall, right wall, floor.
    drawSieveBar(c, px, py, tw, ph);                 // left wall
    drawSieveBar(c, px + pw - tw, py, tw, ph);        // right wall
    drawSieveBar(c, px, py + ph - tw, pw, tw);        // floor
    ctx.shadowBlur = 0;

    // Mesh hatching across the floor (the "sieve" texture).
    ctx.save();
    rRect(px, py + ph - tw, pw, tw, 2 * S); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1 * S;
    for (var hx = px - ph; hx < px + pw; hx += 4 * S) {
      ctx.beginPath();
      ctx.moveTo(hx, py + ph - tw);
      ctx.lineTo(hx + tw, py + ph);
      ctx.stroke();
    }
    ctx.restore();

    // Lock glyph hovering over the open top while locked.
    if (s.locked) {
      ctx.globalAlpha = alpha * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(tick * 0.06)));
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold ' + (Math.min(pw, ph) * 0.32) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3 * S;
      ctx.fillText('🔒', px + pw / 2, py + ph * 0.42);
    }
    ctx.restore();
  }
  ctx.restore();
}
