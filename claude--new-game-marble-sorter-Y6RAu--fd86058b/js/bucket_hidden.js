// ============================================================
// bucket_hidden.js — Hidden bucket type
// Active:   dark "?" cap — color unknown until activated
// Inactive: same dark cap, dimmer
// On belt:  reveals the real color with a pop
// ============================================================
//
// NOTE: This file is a SCAFFOLDING STUB. The reveal animation will be
// implemented in the first prototype branch.
// ============================================================

registerBucketType('hidden', {
  label: 'Hidden',
  editorColor: '#4A4450',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    ctx.save();
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#4A4450');
    grad.addColorStop(1, '#2A2530');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#5A5460';
    ctx.lineWidth = 1.5 * S;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold ' + (h * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2);
    ctx.restore();
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#2A2530';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    var def = getBucketType('default');
    def.drawOnBelt(ctx, x, y, w, h, ci, S, fill, capacity, tick);
  },

  editorCellStyle: function (ci) {
    return { background: 'linear-gradient(135deg,#4A4450,#2A2530)', borderColor: '#5A5460' };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#ddd">?</span>';
  }
});
