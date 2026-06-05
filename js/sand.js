// ============================================================
// sand.js — sand image + falling CA with centre-biased slip
// ============================================================
//
// Stored in `sandGrid` (Int8Array). Each cell holds a color index
// (0..NUM_COLORS-1) or -1 for empty.
//
// Per cell, in order:
//   1. Try to fall straight down (vertical gravity for everyone).
//   2. If down is blocked, try a diagonal slip — biased toward the
//      bottom-centre of the image (slip-toward-centre first, then
//      slip-away if that's blocked too).
//   3. Otherwise stay.
//
// Effect: sand falls straight down (no horizontal drift while in
// free space, so no funnelling through the centre column). When it
// lands on a pile it slumps toward the centre, so the pile builds up
// at the bottom middle with natural slopes on either side. Edge cells
// behave like normal falling sand — gravity is purely vertical there.
//
// Iteration: bottom-up rows, tick-parity decides L→R vs R→L sweep.
// ============================================================

function updateSand() {
  var cx = SAND_W / 2 - 0.5;
  for (var y = SAND_H - 2; y >= 0; y--) {
    var leftFirst = ((tick + y) & 1) === 0;
    if (leftFirst) {
      for (var x = 0; x < SAND_W; x++) processSandCell(x, y, cx);
    } else {
      for (var x = SAND_W - 1; x >= 0; x--) processSandCell(x, y, cx);
    }
  }
}

function processSandCell(x, y, cx) {
  var idx = sandIdx(x, y);
  if (sandGrid[idx] < 0) return;
  var ci = sandGrid[idx];

  // 1. Straight down — open iff empty AND not blocked by a sieve wall/floor.
  var belowIdx = sandIdx(x, y + 1);
  if (sandGrid[belowIdx] < 0 && !sieveBlocks(belowIdx, ci)) {
    sandGrid[belowIdx] = ci;
    sandGrid[idx] = -1;
    return;
  }

  // 2. Slip — prefer the direction that points toward the centre.
  var ddx = cx - x;
  var slipFirst, slipSecond;
  if (ddx > 0.5) {
    slipFirst = 1;  slipSecond = -1;
  } else if (ddx < -0.5) {
    slipFirst = -1; slipSecond = 1;
  } else {
    // Centre column: no centre-bias, alternate by parity to stay symmetric.
    if ((tick + y) & 1) { slipFirst = 1;  slipSecond = -1; }
    else                { slipFirst = -1; slipSecond = 1;  }
  }

  var nx = x + slipFirst;
  if (nx >= 0 && nx < SAND_W) {
    var ni = sandIdx(nx, y + 1);
    if (sandGrid[ni] < 0 && !sieveBlocks(ni, ci)) {
      sandGrid[ni] = ci;
      sandGrid[idx] = -1;
      return;
    }
  }
  nx = x + slipSecond;
  if (nx >= 0 && nx < SAND_W) {
    var ni2 = sandIdx(nx, y + 1);
    if (sandGrid[ni2] < 0 && !sieveBlocks(ni2, ci)) {
      sandGrid[ni2] = ci;
      sandGrid[idx] = -1;
      return;
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
      if (sandCellTrapped(x, y)) continue; // locked in a sieve — unreachable
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
