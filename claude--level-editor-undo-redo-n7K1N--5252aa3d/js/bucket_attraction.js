// ============================================================
// bucket_attraction.js — Per-frame attraction + trails
// ============================================================
//
// For every bucket on the belt:
//   - tick pullCooldown down
//   - when ready, find nearest matching grain in radius and pull it
//   - extracted grain immediately leaves sandGrid (sand above starts to
//     fall next CA tick); a visual trail flies to the bucket
//   - on trail arrival, bucket.fill++. When fill === bucket.capacity, the
//     bucket is marked done — belt update will pop it next frame. Capacity
//     is per-color (see game.js#computeLevelCapacities).
// ============================================================

function updateBucketAttraction() {
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (!b || b.reserved || b.done) continue;
    if (b.pullCooldown > 0) { b.pullCooldown--; continue; }
    if ((b.capacity || 0) <= 0) continue;
    if ((b.fill || 0) >= b.capacity) continue;
    // Count en-route trails so we don't over-pull and exceed capacity.
    var enRoute = 0;
    for (var t = 0; t < attractionTrails.length; t++) {
      if (attractionTrails[t].slot === i) enRoute++;
    }
    if ((b.fill || 0) + enRoute >= b.capacity) continue;

    var sp = getBeltSlotSandPos(i);
    // ATTRACT_RADIUS_CELLS is in image-pixel units; scale to actual sand
    // cells so the physical reach stays consistent across subdivisions.
    var radius = ATTRACT_RADIUS_CELLS * SAND_SUBDIV;
    var grain = findNearestGrain(sp.x, sp.y, b.ci, radius);
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
      // Arrival: credit only if the bucket still occupies the slot and
      // still has capacity. Otherwise the grain is silently dropped —
      // it was already extracted from the image and should never re-appear.
      var slot = t.slot;
      var b = beltSlots[slot];
      if (b && b === t.bucketRef && !b.done) {
        b.fill = (b.fill || 0) + 1;
        if (b.capacity > 0 && b.fill >= b.capacity) {
          b.done = true;
        }
      }
      attractionTrails.splice(i, 1);
    }
  }
}
