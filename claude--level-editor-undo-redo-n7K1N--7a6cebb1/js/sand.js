// ============================================================
// sand.js — sand image + horizontally-blended gravity CA
// ============================================================
//
// Stored in `sandGrid` (Int8Array). Each cell holds a color index
// (0..NUM_COLORS-1) or -1 for empty.
//
// Gravity always has a +1 vertical component, but the horizontal
// component varies along the x axis:
//   - At the far left and far right of the image: no horizontal pull
//     (gravity is purely vertical → no sand "flying" along the floor).
//   - Towards the centre column: gravity bends progressively toward
//     the bottom-centre point.
//
// Implementation: a per-column blend factor t (0 at the edges, 1 at
// the centre column) sets how often a cell takes a sideways step.
//   period = round(1 / t)        // cells near centre: 1 tick
//                                // halfway out:        ~2 ticks
//                                // edge cells:         never
// A per-cell offset desynchronises neighbours so they don't all drift
// on the same frame.
//
// Iteration order: bottom-up, with a tick-parity-driven L/R sweep so
// horizontal slips don't build a one-sided bias.
// ============================================================

function updateSand() {
  var cx = SAND_W / 2 - 0.5;
  var cy = SAND_H - 1;
  for (var y = SAND_H - 1; y >= 0; y--) {
    var leftFirst = ((tick + y) & 1) === 0;
    if (leftFirst) {
      for (var x = 0; x < SAND_W; x++) processSandCell(x, y, cx, cy);
    } else {
      for (var x = SAND_W - 1; x >= 0; x--) processSandCell(x, y, cx, cy);
    }
  }
}

function processSandCell(x, y, cx, cy) {
  var idx = sandIdx(x, y);
  if (sandGrid[idx] < 0) return;
  var ci = sandGrid[idx];

  // Vertical pull is always +1 (cy is the bottom row).
  var sy = y < cy ? 1 : 0;

  // Horizontal pull: only fires periodically. The closer x is to the
  // centre column, the more often it fires. Edges never fire.
  var sx = 0;
  var ddx = cx - x;
  if (ddx > 0.5 || ddx < -0.5) {
    var halfW = (SAND_W - 1) / 2;
    var t = 1 - Math.abs(x - cx) / halfW;   // 0 at edges, ~1 at centre
    if (t > 0.05) {
      var period = Math.max(1, Math.round(1 / t));
      // Per-cell offset so neighbours stagger their drift frames.
      var offset = ((x * 7) ^ (y * 13)) & 0xff;
      if (((tick + offset) % period) === 0) {
        sx = ddx > 0 ? 1 : -1;
      }
    }
  }

  if (sx === 0 && sy === 0) return;

  // Up to 3 candidate (dx, dy) pairs, primary first.
  var dx0, dy0, dx1, dy1, dx2, dy2, nCands;
  if (sx !== 0 && sy !== 0) {
    // Diagonal step this tick
    dx0 = sx; dy0 = sy;
    dx1 = sx; dy1 = 0;
    dx2 = 0;  dy2 = sy;
    nCands = 3;
  } else if (sy !== 0) {
    // Pure vertical — try down, then symmetric down-slip
    dx0 = 0; dy0 = sy;
    if ((tick + y) & 1) { dx1 =  1; dy1 = sy; dx2 = -1; dy2 = sy; }
    else                { dx1 = -1; dy1 = sy; dx2 =  1; dy2 = sy; }
    nCands = 3;
  } else {
    // Pure horizontal — bottom row only, no up-climb
    dx0 = sx; dy0 = 0;
    nCands = 1;
  }

  for (var i = 0; i < nCands; i++) {
    var dx_ = i === 0 ? dx0 : (i === 1 ? dx1 : dx2);
    var dy_ = i === 0 ? dy0 : (i === 1 ? dy1 : dy2);
    var nx = x + dx_;
    var ny = y + dy_;
    if (nx < 0 || nx >= SAND_W || ny < 0 || ny >= SAND_H) continue;
    var nidx = sandIdx(nx, ny);
    if (sandGrid[nidx] >= 0) continue;
    sandGrid[nidx] = ci;
    sandGrid[idx] = -1;
    return;
  }
}

function extractGrain(x, y) {
  if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) return -1;
  var i = sandIdx(x, y);
  var ci = sandGrid[i];
  if (ci < 0) return -1;
  sandGrid[i] = -1;
  return ci;
}

// Find the nearest grain of color ci within `maxR` sand-cells of (cx, cy).
// (cx, cy) and maxR are in sand-cell units. Returns {x, y, dist} or null.
function findNearestGrain(cx, cy, ci, maxR) {
  var bestX = -1, bestY = -1, bestD2 = maxR * maxR + 1;
  var minX = Math.max(0, Math.floor(cx - maxR));
  var maxX = Math.min(SAND_W - 1, Math.ceil(cx + maxR));
  var minY = Math.max(0, Math.floor(cy - maxR));
  var maxY = Math.min(SAND_H - 1, Math.ceil(cy + maxR));
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      if (sandGrid[sandIdx(x, y)] !== ci) continue;
      var dx = x - cx, dy = y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = x; bestY = y;
      }
    }
  }
  if (bestX < 0) return null;
  return { x: bestX, y: bestY, dist: Math.sqrt(bestD2) };
}

// Find up to `maxN` grains of color ci within `maxR` sand-cells of (cx, cy),
// nearest first. Used to pull every grain currently in range as a batch.
function findGrainsInRadius(cx, cy, ci, maxR, maxN) {
  var out = [];
  var minX = Math.max(0, Math.floor(cx - maxR));
  var maxX = Math.min(SAND_W - 1, Math.ceil(cx + maxR));
  var minY = Math.max(0, Math.floor(cy - maxR));
  var maxY = Math.min(SAND_H - 1, Math.ceil(cy + maxR));
  var r2 = maxR * maxR;
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      if (sandGrid[sandIdx(x, y)] !== ci) continue;
      var dx = x - cx, dy = y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 <= r2) out.push({ x: x, y: y, d2: d2 });
    }
  }
  out.sort(function (a, b) { return a.d2 - b.d2; });
  if (maxN != null && out.length > maxN) out.length = maxN;
  return out;
}

function paintGrain(x, y, ci) {
  if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) return;
  sandGrid[sandIdx(x, y)] = ci;
}

function countSandRemaining() {
  var n = 0;
  for (var i = 0; i < sandGrid.length; i++) if (sandGrid[i] >= 0) n++;
  return n;
}

function countSandOfColor(ci) {
  var n = 0;
  for (var i = 0; i < sandGrid.length; i++) if (sandGrid[i] === ci) n++;
  return n;
}

function clearSandGrid() {
  for (var i = 0; i < sandGrid.length; i++) sandGrid[i] = -1;
}

// Convert canvas-space (cx, cy) → sand-cell coords. Returns null if outside.
function sandCellAt(cx, cy) {
  if (!L.image) return null;
  var sx = (cx - L.image.x) / L.image.cell;
  var sy = (cy - L.image.y) / L.image.cell;
  if (sx < 0 || sx >= SAND_W || sy < 0 || sy >= SAND_H) return null;
  return { x: Math.floor(sx), y: Math.floor(sy) };
}
