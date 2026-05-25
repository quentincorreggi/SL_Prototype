// ============================================================
// bucket_default.js — Default bucket type (jar with cap)
// Active:    full-color jar
// Inactive:  same jar, desaturated + lock icon
// On belt:   delegated to drawJar in rendering.js (fill indicator + count)
// ============================================================

registerBucketType('default', {
  label: 'Default',
  editorColor: '#A08060',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    ctx.restore();
    // Lock icon overlay
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 2 * S;
    ctx.fillText('🔒', x + w / 2, y + h * 0.55);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
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
