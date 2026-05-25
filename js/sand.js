// ============================================================
// sand.js — 32×32 sand image + falling-sand cellular automaton
// ============================================================
//
// Stored in `sandGrid` (Int8Array). Each cell holds a color index
// (0..NUM_COLORS-1) or -1 for empty.
//
// CA RULES (each frame, iterate bottom-up):
//   For each grain at (x, y):
//     - if cell below empty → swap down
//     - else if diagonal down (alternating L/R based on parity) empty → swap
//     - else stay
//   Iteration alternates L→R / R→L per row to avoid bias.
// ============================================================

function updateSand() {
  for (var y = SAND_H - 2; y >= 0; y--) {
    var leftFirst = ((tick + y) & 1) === 0;
    for (var ii = 0; ii < SAND_W; ii++) {
      var x = leftFirst ? ii : (SAND_W - 1 - ii);
      var idx = sandIdx(x, y);
      var ci = sandGrid[idx];
      if (ci < 0) continue;

      var below = sandIdx(x, y + 1);
      if (sandGrid[below] < 0) {
        sandGrid[below] = ci;
        sandGrid[idx] = -1;
        continue;
      }

      var dl = (x > 0) ? sandIdx(x - 1, y + 1) : -1;
      var dr = (x < SAND_W - 1) ? sandIdx(x + 1, y + 1) : -1;
      var firstDir = leftFirst ? dl : dr;
      var secondDir = leftFirst ? dr : dl;

      if (firstDir >= 0 && sandGrid[firstDir] < 0) {
        sandGrid[firstDir] = ci;
        sandGrid[idx] = -1;
      } else if (secondDir >= 0 && sandGrid[secondDir] < 0) {
        sandGrid[secondDir] = ci;
        sandGrid[idx] = -1;
      }
    }
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
