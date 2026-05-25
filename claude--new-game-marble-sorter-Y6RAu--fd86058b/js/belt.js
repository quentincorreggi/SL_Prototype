// ============================================================
// belt.js — 5-slot wrapping conveyor
// ============================================================
//
// Buckets ride on `beltSlots[0..4]`. Each slot is `null` or a bucket
// object: { ci, type, fill, pullCooldown, done, ... }.
//
// The belt scrolls right → left at BELT_SPEED slot-fractions per frame.
// `beltOffset` accumulates 0..1; when it crosses 1, contents shift one
// slot left (slot 0 wraps to slot BELT_SLOTS-1).
//
// Position helpers:
//   getBeltSlotPos(i)     → {x, y} canvas coords for the visible center
//                           of slot i, accounting for beltOffset scroll
//   getBeltSlotSandPos(i) → {x, y} in sand-cell coords (used by the
//                           attraction logic)
// ============================================================

function initBelt() {
  beltSlots = new Array(BELT_SLOTS);
  for (var i = 0; i < BELT_SLOTS; i++) beltSlots[i] = null;
  beltOffset = 0;
}

function updateBelt() {
  beltOffset += BELT_SPEED;
  while (beltOffset >= 1) {
    beltOffset -= 1;
    // Right→left scroll: shift contents one slot left, slot 0 wraps to last.
    var first = beltSlots[0];
    for (var i = 0; i < BELT_SLOTS - 1; i++) beltSlots[i] = beltSlots[i + 1];
    beltSlots[BELT_SLOTS - 1] = first;
  }
}

function firstFreeBeltSlot() {
  // Right-most free slot, so a newly-tapped bucket appears on the right
  // and rides leftward. Returns -1 if all full.
  for (var i = BELT_SLOTS - 1; i >= 0; i--) {
    if (beltSlots[i] == null) return i;
  }
  return -1;
}

function getBeltSlotPos(i) {
  var slotW = L.belt.w / BELT_SLOTS;
  var x = L.belt.x + slotW * (i + 0.5 - beltOffset);
  var y = L.belt.y + L.belt.h / 2;
  return { x: x, y: y };
}

function getBeltSlotSandPos(i) {
  // Project the slot's x onto the sand image's x-axis; y is the bottom
  // row of the image (since the bucket sits just below the image).
  var pos = getBeltSlotPos(i);
  var sx = (pos.x - L.image.x) / L.image.cell;
  var sy = SAND_H - 0.5;
  return { x: sx, y: sy };
}
