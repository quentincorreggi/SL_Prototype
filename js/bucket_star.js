// ============================================================
// bucket_star.js — Star bucket type
// Visually: a golden jar with a ✦ star glyph.
// Mechanically: when it fills and pops off the belt, it unlocks
// all locked-region cells assigned to the same lockGroup.
// The lockGroup is stored on the grid cell as .lockGroup (0-4).
// ============================================================

registerBucketType('star', {
  label: 'Star',
  editorColor: '#D4A820',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawStarJar(ctx, x, y, w, h, ci, S, 0, 0);
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save();
    ctx.globalAlpha = 0.50;
    drawStarJar(ctx, x, y, w, h, ci, S, 0, 0);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawStarJar(ctx, x, y, w, h, ci, S, fill, capacity);
  },

  editorCellStyle: function (ci) {
    return {
      background: 'linear-gradient(135deg,#FFE066,#C4960A)',
      borderColor: '#8B6A00'
    };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="font-size:13px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5)">✦</span>';
  }
});

// Shared draw helper — golden tinted jar with star glyph
function drawStarJar(ctx, x, y, w, h, ci, S, fill, capacity) {
  // Draw underlying jar in the bucket's sand color
  drawJar(ctx, x, y, w, h, ci, S, fill, capacity);

  // Gold shimmer overlay on cap
  ctx.save();
  var capH = h * 0.18;
  var grad = ctx.createLinearGradient(x, y, x, y + capH);
  grad.addColorStop(0, 'rgba(255,230,80,0.75)');
  grad.addColorStop(1, 'rgba(200,155,10,0.55)');
  ctx.fillStyle = grad;
  rRect(x - 1 * S, y, w + 2 * S, capH, 3 * S);
  ctx.fill();

  // Star glyph centered on body
  ctx.fillStyle = 'rgba(255,240,100,0.92)';
  ctx.font = 'bold ' + (h * 0.36) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(200,140,0,0.7)';
  ctx.shadowBlur = 4 * S;
  ctx.fillText('✦', x + w / 2, y + h * 0.62);
  ctx.restore();
}
