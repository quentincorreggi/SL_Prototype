// ============================================================
// bucket_attraction.js — Per-frame attraction + trails
// ============================================================
//
// For every bucket on the belt:
//   - tick pullCooldown down
//   - when ready, pull the nearest ATTRACT_BATCH matching grains in
//     the radius (capped by remaining capacity minus en-route trails)
//   - extracted grains immediately leave sandGrid (sand above falls
//     into the gaps on the next CA tick); a visual trail flies to
//     the bucket for each one
//   - the cooldown imposes ATTRACT_PULL_FRAMES between pull cycles,
//     so a grain that falls into the radius after a pull waits a
//     frame-delay before being pulled
//   - on trail arrival, bucket.fill++. When fill === bucket.capacity,
//     the bucket is marked done — belt update will pop it next frame.
//     Capacity is per-color (see game.js#computeLevelCapacities).
//
// Trail destination is snapshotted at spawn time (toX, toY) so a belt
// wrap or pop never warps the grain off to a far position.
// ============================================================

function updateBucketAttraction() {
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (!b || b.reserved || b.done) continue;
    if (b.locked) continue;
    if (b.pullCooldown > 0) { b.pullCooldown--; continue; }
    if ((b.capacity || 0) <= 0) continue;
    if ((b.fill || 0) >= b.capacity) continue;

    // Count en-route trails by bucket identity (slot indices shift on
    // belt wrap, so the bucket reference is the reliable key).
    var enRoute = 0;
    for (var t = 0; t < attractionTrails.length; t++) {
      if (attractionTrails[t].bucketRef === b) enRoute++;
    }
    var remaining = b.capacity - (b.fill || 0) - enRoute;
    if (remaining <= 0) continue;

    var sp = getBeltSlotSandPos(i);
    // ATTRACT_RADIUS_CELLS is in image-pixel units; scale to actual sand
    // cells so the physical reach stays consistent across subdivisions.
    var radius = ATTRACT_RADIUS_CELLS * SAND_SUBDIV;
    // Pull up to ATTRACT_BATCH grains per cycle, capped by remaining
    // capacity. The nearest grains go first.
    var batch = Math.max(1, ATTRACT_BATCH | 0);
    var cap = Math.min(batch, remaining);
    var grains = findGrainsInRadius(sp.x, sp.y, b.ci, radius, cap);
    if (grains.length === 0) continue;

    for (var g = 0; g < grains.length; g++) {
      extractGrain(grains[g].x, grains[g].y);
      spawnAttractionTrail(grains[g].x, grains[g].y, i, b.ci);
    }
    b.pullCooldown = ATTRACT_PULL_FRAMES;
  }
}

function spawnAttractionTrail(sandX, sandY, slot, ci) {
  // Origin in canvas space (center of the grain cell)
  var ox = L.image.x + (sandX + 0.5) * L.image.cell;
  var oy = L.image.y + (sandY + 0.5) * L.image.cell;
  // Snapshot destination so belt wrap / bucket pop can't teleport
  // the trail to a far-away position mid-flight.
  var bpos = getBeltSlotPos(slot);
  attractionTrails.push({
    fromX: ox,
    fromY: oy,
    toX: bpos.x,
    toY: bpos.y,
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

    // Steer the trail toward the bucket's CURRENT position each frame
    // so the grain always heads for the centre even as the belt scrolls.
    // If the bucket teleports (belt wrap, pop), keep the previous
    // destination so the grain doesn't fly across the screen.
    var bpos = null;
    for (var s = 0; s < BELT_SLOTS; s++) {
      if (beltSlots[s] === t.bucketRef) { bpos = getBeltSlotPos(s); break; }
    }
    if (bpos && L.belt) {
      var slotW = L.belt.w / BELT_SLOTS;
      var ddx = bpos.x - t.toX;
      var ddy = bpos.y - t.toY;
      if (ddx * ddx + ddy * ddy < slotW * slotW) {
        t.toX = bpos.x;
        t.toY = bpos.y;
      }
    }

    t.t++;
    if (t.t >= t.dur) {
      // Arrival: credit by bucket identity (slot may have shifted on
      // belt wrap). Otherwise the grain is silently dropped — it was
      // already extracted from the image and should never re-appear.
      var b = null;
      for (var s2 = 0; s2 < BELT_SLOTS; s2++) {
        if (beltSlots[s2] === t.bucketRef) { b = beltSlots[s2]; break; }
      }
      if (b && !b.done) {
        b.fill = (b.fill || 0) + 1;
        if (b.capacity > 0 && b.fill >= b.capacity) {
          b.done = true;
        }
      }
      attractionTrails.splice(i, 1);
    }
  }
}
