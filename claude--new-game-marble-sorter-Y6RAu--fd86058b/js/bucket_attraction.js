// ============================================================
// bucket_attraction.js — Per-frame attraction logic
// ============================================================
//
// Each frame, for every bucket on the belt:
//   1. Compute its (cx, cy) in sand-cell coordinates.
//   2. If bucket.pullCooldown > 0, decrement and skip.
//   3. Find the nearest sand grain matching bucket.ci within
//      ATTRACT_RADIUS_CELLS. (See sand.js#findNearestGrain.)
//   4. If found:
//      - Remove the grain from sandGrid immediately (sand above falls
//        next CA tick).
//      - Spawn an attraction trail (visual) from grain position to
//        bucket position. The bucket's fill increments when the trail
//        completes its travel.
//      - Reset bucket.pullCooldown = ATTRACT_PULL_FRAMES.
//   5. If bucket.fill === BUCKET_CAPACITY → mark bucket.done = true; the
//      belt update will remove it next frame with a pop.
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// wire this into the game loop and tune the visual trail.
// ============================================================

function updateBucketAttraction() {
  for (var i = 0; i < beltSlots.length; i++) {
    var b = beltSlots[i];
    if (!b || b.done) continue;
    if (b.pullCooldown > 0) { b.pullCooldown--; continue; }

    // TODO: implement actual pull logic in first prototype.
    // Pseudocode (to be filled in):
    //
    //   var pos = bucketSandSpacePos(i);              // belt slot → sand coords
    //   var grain = findNearestGrain(pos.x, pos.y, b.ci, ATTRACT_RADIUS_CELLS);
    //   if (!grain) continue;
    //   extractGrain(grain.x, grain.y);
    //   spawnAttractionTrail(grain, b);
    //   b.pullCooldown = ATTRACT_PULL_FRAMES;
  }
}

function updateAttractionTrails() {
  // Advance each trail toward its target bucket. When it arrives, increment
  // bucket.fill and remove the trail.
  for (var i = attractionTrails.length - 1; i >= 0; i--) {
    var t = attractionTrails[i];
    t.t = (t.t || 0) + 1;
    if (t.t >= (t.duration || 18)) {
      if (t.bucket && !t.bucket.done) {
        t.bucket.fill = (t.bucket.fill || 0) + 1;
        if (t.bucket.fill >= BUCKET_CAPACITY) t.bucket.done = true;
      }
      attractionTrails.splice(i, 1);
    }
  }
}
