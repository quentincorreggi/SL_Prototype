// ============================================================
// bucket_attraction.js — Per-frame attraction + trails
// ============================================================
//
// For every bucket on the belt:
//   - tick pullCooldown down
//   - when ready, find nearest matching grain in radius and pull it
//   - extracted grain immediately leaves sandGrid (sand above starts to
//     fall next CA tick); a visual trail flies to the bucket
//   - on trail arrival, bucket.fill++. When fill === BUCKET_CAPACITY, the
//     bucket is marked done — belt update will pop it next frame.
// ============================================================

function updateBucketAttraction() {
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (!b || b.reserved || b.done) continue;
    if (b.pullCooldown > 0) { b.pullCooldown--; continue; }
    if ((b.fill || 0) >= BUCKET_CAPACITY) continue;
    // Count en-route trails so we don't over-pull and exceed capacity.
    var enRoute = 0;
    for (var t = 0; t < attractionTrails.length; t++) {
      if (attractionTrails[t].slot === i) enRoute++;
    }
    if ((b.fill || 0) + enRoute >= BUCKET_CAPACITY) continue;

    var sp = getBeltSlotSandPos(i);
    var grain = findNearestGrain(sp.x, sp.y, b.ci, ATTRACT_RADIUS_CELLS);
    if (!grain) continue;

    extractGrain(grain.x, grain.y);
    spawnAttractionTrail(grain.x, grain.y, i, b.ci);
    b.pullCooldown = ATTRACT_PULL_FRAMES;
  }
}

function spawnAttractionTrail(sandX, sandY, slot, ci) {
  // Origin in canvas space (center of the grain cell)
  var ox = L.image.x + (sandX + 0.5) * L.image.cell;
  var oy = L.image.y + (sandY + 0.5) * L.image.cell;
  attractionTrails.push({
    fromX: ox,
    fromY: oy,
    slot: slot,
    bucketRef: beltSlots[slot], // identity check on arrival
    ci: ci,
    t: 0,
    dur: BUCKET_TRAIL_FRAMES
  });
}

function updateAttractionTrails() {
  for (var i = attractionTrails.length - 1; i >= 0; i--) {
    var t = attractionTrails[i];
    t.t++;
    if (t.t >= t.dur) {
      // Arrival: credit only if the bucket still occupies the slot.
      var slot = t.slot;
      var b = beltSlots[slot];
      if (b && b === t.bucketRef && !b.done) {
        b.fill = (b.fill || 0) + 1;
        if (b.fill >= BUCKET_CAPACITY) {
          b.done = true;
        }
      } else {
        // Bucket gone — return the grain so it isn't lost (drop at a random
        // empty cell near the top so it falls naturally back into place).
        // This is rare in practice (only if user pops the source bucket
        // mid-flight); keeping it for fairness.
        returnGrainToImage(t.ci);
      }
      attractionTrails.splice(i, 1);
    }
  }
}

function returnGrainToImage(ci) {
  for (var tries = 0; tries < 32; tries++) {
    var x = ~~(Math.random() * SAND_W);
    var y = ~~(Math.random() * 4);
    if (sandGrid[sandIdx(x, y)] < 0) {
      sandGrid[sandIdx(x, y)] = ci;
      return;
    }
  }
}
