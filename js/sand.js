// ============================================================
// sand.js — Sand image storage + falling-sand cellular automaton
// ============================================================
//
// The 32×32 sand image is stored as `sandGrid` (Int8Array) in config.js.
// Each cell holds a color index (0..NUM_COLORS-1) or -1 for empty.
//
// This file owns:
//   - updateSand()       — one tick of CA physics (down, down-left, down-right)
//   - extractGrain(x, y) — remove a grain at (x, y); returns color index or -1
//   - findNearestGrain(cx, cy, ci, maxR) — find nearest sand cell of color ci
//                                          within radius maxR from belt-relative
//                                          point (cx, cy). Returns {x, y} or null.
//   - paintGrain(x, y, ci) — used by the editor to author the image
//
// CA RULES:
//   For each cell (scanned bottom-up so falling doesn't cascade in one frame):
//     - if cell below is empty → swap down
//     - else if down-left is empty → swap down-left
//     - else if down-right is empty → swap down-right
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// implement the CA loop and the extraction helpers.
// ============================================================

function updateSand() {
  // TODO: cellular automaton step — implemented in first prototype.
}

function extractGrain(x, y) {
  if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) return -1;
  var i = sandIdx(x, y);
  var ci = sandGrid[i];
  if (ci < 0) return -1;
  sandGrid[i] = -1;
  return ci;
}

function findNearestGrain(cx, cy, ci, maxR) {
  // Returns {x, y, dist} or null. Scans cells within `maxR` of (cx, cy).
  // TODO: optimize with spatial index if needed; brute-force is fine for 32×32.
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

function paintGrain(x, y, ci) {
  if (x < 0 || x >= SAND_W || y < 0 || y >= SAND_H) return;
  sandGrid[sandIdx(x, y)] = ci;
}

function countSandRemaining() {
  var n = 0;
  for (var i = 0; i < sandGrid.length; i++) if (sandGrid[i] >= 0) n++;
  return n;
}
