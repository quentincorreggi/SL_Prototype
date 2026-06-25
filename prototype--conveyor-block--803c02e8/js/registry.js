// ============================================================
// registry.js — Bucket type registration system
// ============================================================
//
// Bucket types register: drawActive, drawInactive, drawOnBelt, plus
// editor metadata. The core engine calls these without knowing about
// specific types.
//
// To add a new bucket type, create js/bucket_yourtype.js and call:
//   registerBucketType('yourtype', { ... });
//
// Required interface:
//   label        : string — display name in editor toolbar
//   editorColor  : string — button color in editor
//   drawActive(ctx, x, y, w, h, ci, S, tick, idlePhase)
//   drawInactive(ctx, x, y, w, h, ci, S, tick)
//   drawOnBelt(ctx, x, y, w, h, ci, S, fill, capacity, tick)
//   editorCellStyle(ci)   — returns { background, borderColor }
//   editorCellHTML(ci)     — returns inner HTML for editor grid cell
// ============================================================

var BucketTypes = {};
var BucketTypeOrder = []; // insertion order for toolbar

function registerBucketType(id, def) {
  def.id = id;
  BucketTypes[id] = def;
  BucketTypeOrder.push(id);
}

function getBucketType(id) {
  return BucketTypes[id] || BucketTypes[BucketTypeOrder[0]];
}
