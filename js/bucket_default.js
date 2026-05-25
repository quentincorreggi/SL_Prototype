// ============================================================
// bucket_default.js — Default bucket type
// Active:   solid colored bucket, face-up, ready to tap
// Inactive: same bucket face-down / desaturated, with a small lock icon
// On belt:  bucket with a fill indicator showing collected grains
// ============================================================
//
// NOTE: This file is a SCAFFOLDING STUB. The actual draw routines will
// be implemented in the first prototype branch. The registry contract
// is in place so future prototypes can extend it without churn.
// ============================================================

registerBucketType('default', {
  label: 'Default',
  editorColor: '#A08060',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    var c = COLORS[ci];
    ctx.save();
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2 * S;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    var c = COLORS[ci];
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = c.dark;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    var c = COLORS[ci];
    ctx.save();
    ctx.fillStyle = c.fill;
    ctx.fillRect(x, y, w, h);
    if (capacity > 0) {
      var fillFrac = Math.min(1, fill / capacity);
      ctx.fillStyle = c.light;
      ctx.fillRect(x, y + h * (1 - fillFrac), w, h * fillFrac);
    }
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 2 * S;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: c.dark
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot">' + CLR_NAMES[ci][0].toUpperCase() + '</span>';
  }
});
