// ============================================================
// vortex.js — Centre-collection "vortex" mechanic
// ============================================================
//
// While at least one VORTEX bucket rides the belt, the game swaps the
// falling-sand physics for a swirl:
//
//   1. updateVortexPhysics() — every sand grain steps toward the centre of
//      the image along a curved (inward + tangential) path, so the picture
//      genuinely collapses and twists into a spiral.
//   2. updateVortex() — each vortex bucket collects the matching grains that
//      are CLOSEST TO THE CENTRE first, so the hole grows from the middle
//      outward. Collected grains spiral up to the bucket along a corkscrew
//      trail (drawn in rendering.js).
//   3. A rendering-space swirl warp + spiral overlay (rendering.js) smooth
//      the deformation into a clean vortex and add a dark "eye".
//
// `vortexStrength` eases 0..1 as vortex buckets appear/leave the belt, so
// levels with no vortex buckets behave exactly like before.
// ============================================================

function resetVortex() {
  vortexStrength = 0;
  vortexSpin = 0;
  vortexOrder = null;
  vortexMoved = null;
}

// Precompute a fixed iteration order over sand cells, inner → outer. The
// centre never moves, so this only needs rebuilding when the grid resizes.
function buildVortexOrder() {
  var cx = SAND_W / 2 - 0.5, cy = SAND_H / 2 - 0.5;
  var n = SAND_W * SAND_H;
  var order = new Array(n);
  for (var i = 0; i < n; i++) order[i] = i;
  order.sort(function (a, b) {
    var ax = a % SAND_W, ay = (a / SAND_W) | 0;
    var bx = b % SAND_W, by = (b / SAND_W) | 0;
    var da = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy);
    var db = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
    return da - db;
  });
  vortexOrder = order;
  vortexMoved = new Uint8Array(n);
}

// Vortex buckets currently active on the belt (ready to collect).
function vortexBucketsOnBelt() {
  var out = [];
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (!b || b.reserved || b.done) continue;
    if (b.type === 'vortex') out.push({ slot: i, bucket: b });
  }
  return out;
}

function isVortexActive() {
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (b && !b.reserved && !b.done && b.type === 'vortex') return true;
  }
  return false;
}

// Find the `count` grains of colour `ci` nearest the image centre. Returns an
// array of {x, y}, innermost first.
function findGrainsNearestCenter(ci, count) {
  var cx = SAND_W / 2 - 0.5, cy = SAND_H / 2 - 0.5;
  var found = [];
  for (var i = 0; i < sandGrid.length; i++) {
    if (sandGrid[i] !== ci) continue;
    var x = i % SAND_W, y = (i / SAND_W) | 0;
    var dx = x - cx, dy = y - cy;
    found.push({ x: x, y: y, d2: dx * dx + dy * dy });
  }
  found.sort(function (a, b) { return a.d2 - b.d2; });
  if (count != null && found.length > count) found.length = count;
  return found;
}

// Discretise a direction component to -1 / 0 / 1.
function _vStep(v) { return v > 0.35 ? 1 : (v < -0.35 ? -1 : 0); }

// One tick of inward+swirl migration. Replaces updateSand() while a vortex
// is active. Grains step toward the centre along a curved path; inner cells
// move first so outer grains can flow into the space they vacate.
function updateVortexPhysics() {
  if (!vortexOrder || vortexOrder.length !== SAND_W * SAND_H) buildVortexOrder();
  var cx = SAND_W / 2 - 0.5, cy = SAND_H / 2 - 0.5;
  var moved = vortexMoved;
  for (var m = 0; m < moved.length; m++) moved[m] = 0;

  var cosP = Math.cos(VORTEX_FLOW_ANGLE), sinP = Math.sin(VORTEX_FLOW_ANGLE);
  var ord = vortexOrder;
  for (var k = 0; k < ord.length; k++) {
    var idx = ord[k];
    if (moved[idx]) continue;
    var ci = sandGrid[idx];
    if (ci < 0) continue;
    var x = idx % SAND_W, y = (idx / SAND_W) | 0;
    var dx = cx - x, dy = cy - y;
    var r = Math.sqrt(dx * dx + dy * dy);
    if (r < 0.9) continue; // already at the eye — waits to be collected
    var ux = dx / r, uy = dy / r;                 // inward unit vector
    var rvx = ux * cosP - uy * sinP;              // rotated (curved) inward
    var rvy = ux * sinP + uy * cosP;

    // Candidate steps, in preference order: curved-inward, straight-inward,
    // tangential (so a grain never freezes just because one cell is blocked).
    var cand = [
      [_vStep(rvx), _vStep(rvy)],
      [_vStep(ux), _vStep(uy)],
      [_vStep(-uy), _vStep(ux)]
    ];
    for (var ci2 = 0; ci2 < cand.length; ci2++) {
      var ax = cand[ci2][0], ay = cand[ci2][1];
      if (ax === 0 && ay === 0) continue;
      var nx = x + ax, ny = y + ay;
      if (nx < 0 || nx >= SAND_W || ny < 0 || ny >= SAND_H) continue;
      var nidx = ny * SAND_W + nx;
      if (sandGrid[nidx] >= 0 || moved[nidx]) continue;
      sandGrid[nidx] = ci;
      sandGrid[idx] = -1;
      moved[nidx] = 1;
      break;
    }
  }
}

// Per-frame vortex update: ease strength, advance spin, run collection.
function updateVortex() {
  var active = isVortexActive();
  var target = active ? 1 : 0;
  vortexStrength += (target - vortexStrength) * VORTEX_EASE;
  if (vortexStrength < 0.002 && !active) vortexStrength = 0;
  if (vortexStrength > 0.002) vortexSpin += VORTEX_SPIN_SPEED * vortexStrength;

  if (!active) return;

  // Ambient whoosh while the vortex spins (throttled).
  if (typeof sfx !== 'undefined' && sfx.vortex && tick % 34 === 0) sfx.vortex();

  var buckets = vortexBucketsOnBelt();
  for (var i = 0; i < buckets.length; i++) {
    var slot = buckets[i].slot;
    var b = buckets[i].bucket;
    if (b.pullCooldown > 0) { b.pullCooldown--; continue; }
    if ((b.capacity || 0) <= 0) continue;
    if ((b.fill || 0) >= b.capacity) continue;

    var enRoute = 0;
    for (var t = 0; t < attractionTrails.length; t++) {
      if (attractionTrails[t].bucketRef === b) enRoute++;
    }
    var remaining = b.capacity - (b.fill || 0) - enRoute;
    if (remaining <= 0) continue;

    var batch = Math.max(1, ATTRACT_BATCH | 0);
    var cap = Math.min(batch, remaining);
    var grains = findGrainsNearestCenter(b.ci, cap);
    if (grains.length === 0) continue;

    for (var g = 0; g < grains.length; g++) {
      extractGrain(grains[g].x, grains[g].y);
      spawnVortexTrail(grains[g].x, grains[g].y, slot, b.ci);
    }
    b.pullCooldown = ATTRACT_PULL_FRAMES;
  }
}

// Spawn a corkscrew trail from a grain's position up to its bucket. Reuses
// the shared attractionTrails list (so credit / win-check logic is unchanged)
// but flags it `spiral` so drawTrails() curves the path.
function spawnVortexTrail(sandX, sandY, slot, ci) {
  var ox = L.image.x + (sandX + 0.5) * L.image.cell;
  var oy = L.image.y + (sandY + 0.5) * L.image.cell;
  var bpos = getBeltSlotPos(slot);
  attractionTrails.push({
    fromX: ox,
    fromY: oy,
    toX: bpos.x,
    toY: bpos.y,
    slot: slot,
    bucketRef: beltSlots[slot],
    ci: ci,
    t: 0,
    dur: BUCKET_TRAIL_FRAMES,
    spiral: true,
    spin: (tick % 63) / 10
  });
}

// Swirling overlay drawn over the image: a dark eye + rotating spiral arms.
function drawVortexOverlay() {
  if (vortexStrength <= 0.01 || !L.image) return;
  var vs = vortexStrength;
  var cx = L.image.x + L.image.w / 2;
  var cy = L.image.y + L.image.h / 2;
  var R = L.image.w * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.image.x, L.image.y, L.image.w, L.image.h);
  ctx.clip();

  // Dark eye at the centre
  var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
  g.addColorStop(0, 'rgba(18,4,38,' + (0.55 * vs) + ')');
  g.addColorStop(0.55, 'rgba(46,12,84,' + (0.18 * vs) + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Spiral arms
  ctx.strokeStyle = 'rgba(206,170,255,' + (0.32 * vs) + ')';
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round';
  var arms = 3;
  for (var a = 0; a < arms; a++) {
    ctx.beginPath();
    var base = vortexSpin + a * 2 * Math.PI / arms;
    for (var t = 0; t <= 1.0001; t += 0.04) {
      var rr = R * t;
      var ang = base + t * 6.0;
      var xx = cx + rr * Math.cos(ang);
      var yy = cy + rr * Math.sin(ang);
      if (t === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}
