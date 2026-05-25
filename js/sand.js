// ============================================================
// sand.js — sand image + radial falling-sand cellular automaton
// ============================================================
//
// Stored in `sandGrid` (Int8Array). Each cell holds a color index
// (0..NUM_COLORS-1) or -1 for empty.
//
// Gravity points toward the bottom-centre of the image:
//   cx = SAND_W / 2 - 0.5    (symmetric between the two middle columns)
//   cy = SAND_H - 1          (bottom row)
//
// Per-cell rule:
//   - sx = sign(cx - x)  with a ±0.5 dead-zone so the two centre
//                        columns get sx=0 and fall straight down.
//   - sy = sign(cy - y)  (≥0 since cy is the bottom row).
//   - Primary step depends on the ray slope:
//        |dy| ≥ 2|dx|  → mostly vertical:  (0, sy)
//        |dx| ≥ 2|dy|  → mostly horizontal: (sx, 0)
//        else          → diagonal:         (sx, sy)
//   - If the primary cell is full, fall back to its cardinal
//     components, then (for vertical primaries) the other diagonal
//     slip.
// Iteration order is "closest to centre first" so cells radially
// below get a chance to free up space before the cells above them
// try to move.
// ============================================================

function updateSand() {
  var cx = SAND_W / 2 - 0.5;
  var cy = SAND_H - 1;
  var midL = Math.floor(cx);
  var midR = midL + 1;
  var maxD = Math.max(midL + 1, SAND_W - midR);

  // Bottom-up by row; within each row, fan out from the centre columns.
  // Tick-parity flips which side of the centre we try first to avoid
  // bias building up over many ticks.
  for (var y = SAND_H - 1; y >= 0; y--) {
    var leftFirst = ((tick + y) & 1) === 0;
    for (var d = 0; d <= maxD; d++) {
      var lx = midL - d;
      var rx = midR + d;
      var lValid = lx >= 0;
      var rValid = rx < SAND_W;
      if (!lValid && !rValid) break;
      if (leftFirst) {
        if (lValid) processSandCell(lx, y, cx, cy);
        if (rValid && rx !== lx) processSandCell(rx, y, cx, cy);
      } else {
        if (rValid) processSandCell(rx, y, cx, cy);
        if (lValid && lx !== rx) processSandCell(lx, y, cx, cy);
      }
    }
  }
}

function processSandCell(x, y, cx, cy) {
  var idx = sandIdx(x, y);
  if (sandGrid[idx] < 0) return;
  var ci = sandGrid[idx];

  var ddx = cx - x;
  var ddy = cy - y;
  var sx = ddx > 0.5 ? 1 : (ddx < -0.5 ? -1 : 0);
  var sy = ddy > 0.5 ? 1 : (ddy < -0.5 ? -1 : 0);
  if (sx === 0 && sy === 0) return; // at centre

  var adx = ddx < 0 ? -ddx : ddx;
  var ady = ddy < 0 ? -ddy : ddy;

  // Up to 3 candidate (dx, dy) pairs, primary first.
  var dx0, dy0, dx1, dy1, dx2, dy2, nCands;
  if (sx === 0) {
    // Pure vertical (centre columns)
    dx0 = 0; dy0 = sy;
    if ((tick + y) & 1) { dx1 =  1; dy1 = sy; dx2 = -1; dy2 = sy; }
    else                { dx1 = -1; dy1 = sy; dx2 =  1; dy2 = sy; }
    nCands = 3;
  } else if (sy === 0) {
    // Pure horizontal (bottom row, off centre)
    dx0 = sx; dy0 = 0;
    nCands = 1;
  } else if (ady >= 2 * adx) {
    // Mostly vertical
    dx0 = 0;   dy0 = sy;
    dx1 = sx;  dy1 = sy;
    dx2 = -sx; dy2 = sy;
    nCands = 3;
  } else if (adx >= 2 * ady) {
    // Mostly horizontal (slopes near the floor)
    dx0 = sx; dy0 = 0;
    dx1 = sx; dy1 = sy;
    nCands = 2;
  } else {
    // Diagonal
    dx0 = sx; dy0 = sy;
    dx1 = sx; dy1 = 0;
    dx2 = 0;  dy2 = sy;
    nCands = 3;
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
