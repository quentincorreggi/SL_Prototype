// ============================================================
// belt.js — 5-slot wrapping conveyor
// ============================================================
//
// Belt scrolls left → right at BELT_SPEED slot-fractions per frame.
// `beltOffset` accumulates 0..1; when it crosses 1, contents shift one
// slot right (slot BELT_SLOTS-1 wraps to slot 0).
//
// Slot contents are bucket-on-belt objects:
//   { type: 'default'|'hidden', ci, fill, pullCooldown, done, popT,
//     bornAt, revealT }
//
// Reserved placeholder during jumper flight:
//   { reserved: true }   (so firstFreeBeltSlot won't reuse it)
// ============================================================

function initBelt() {
  beltSlots = new Array(BELT_SLOTS);
  for (var i = 0; i < BELT_SLOTS; i++) beltSlots[i] = null;
  beltOffset = 0;
}

function updateBelt() {
  // Pause scrolling while a bucket is jumping onto the belt — otherwise
  // its reserved slot would shift mid-flight and the bucket would land
  // in the wrong slot.
  if (jumpers.length === 0) {
    beltOffset += BELT_SPEED;
    while (beltOffset >= 1) {
      beltOffset -= 1;
      // Left→right scroll: shift contents one slot right, last wraps to slot 0.
      var last = beltSlots[BELT_SLOTS - 1];
      for (var i = BELT_SLOTS - 1; i > 0; i--) beltSlots[i] = beltSlots[i - 1];
      beltSlots[0] = last;
    }
  }

  // Tick down pop animations; clear when finished.
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b || b.reserved) continue;
    if (b.done) {
      b.popT = (b.popT || 0) + 1;
      if (b.popT === 1) {
        if (typeof sfx !== 'undefined') sfx.pop();
        if (typeof spawnBurst === 'function') {
          var pos = getBeltSlotPos(s);
          spawnBurst(pos.x, pos.y, COLORS[b.ci].fill, 14);
        }
        // A bucket clearing ticks down every locked Conveyor Block.
        if (typeof onBucketCleared === 'function') onBucketCleared(b);
      }
      if (b.popT >= BUCKET_POP_FRAMES) {
        beltSlots[s] = null;
      }
    }
    if (b && b.revealT != null && b.revealT < 12) b.revealT++;
    // Conveyor Block animation timers.
    if (b.badgeBumpT > 0) b.badgeBumpT--;
    if (b.unlockAnimT != null && b.unlockAnimT >= 0 && b.unlockAnimT < CONVEYOR_UNLOCK_FRAMES) b.unlockAnimT++;
  }
}

function firstFreeBeltSlot() {
  // Left-most free slot first — newly-tapped buckets enter on the left
  // and ride rightward.
  for (var i = 0; i < BELT_SLOTS; i++) {
    if (beltSlots[i] == null) return i;
  }
  return -1;
}

function countBucketsOnBelt() {
  var n = 0;
  for (var i = 0; i < BELT_SLOTS; i++) {
    var b = beltSlots[i];
    if (b && !b.reserved && !b.done) n++;
  }
  return n;
}

function getBeltSlotPos(i) {
  var slotW = L.belt.w / BELT_SLOTS;
  var x = L.belt.x + slotW * (i + 0.5 + beltOffset);
  var y = L.belt.y + L.belt.h / 2;
  return { x: x, y: y };
}

function getBeltSlotSandPos(i) {
  // Project slot center onto sand-image x-axis; y = just below the image.
  var pos = getBeltSlotPos(i);
  var sx = (pos.x - L.image.x) / L.image.cell;
  var sy = SAND_H - 0.5;
  return { x: sx, y: sy };
}
