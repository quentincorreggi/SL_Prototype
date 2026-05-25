// ============================================================
// bucket_hidden.js — Hidden bucket (color unknown until on belt)
// Active:    gray jar with "?" symbol
// Inactive:  same gray jar, dimmer
// On belt:   crossfades to the real color via drawJar (handled in rendering.js)
// ============================================================

registerBucketType('hidden', {
  label: 'Hidden',
  editorColor: '#4A4450',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawHiddenJar(ctx, x, y, w, h, S, 1.0);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.42) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 2 * S;
    ctx.fillText('?', x + w / 2, y + h * 0.58);
    ctx.restore();
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    drawHiddenJar(ctx, x, y, w, h, S, 0.5);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.42) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h * 0.58);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    // Handled in rendering.js (drawBeltBucket) which does the reveal fade.
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
  },

  editorCellStyle: function (ci) {
    return { background: 'linear-gradient(135deg,#5A5460,#2A2530)', borderColor: '#5A5460' };
  },

  editorCellHTML: function (ci) {
    return '<span class="ed-cell-dot" style="color:#ddd">?</span>';
  }
});

function drawHiddenJar(ctx, x, y, w, h, S, alpha) {
  var capH = h * 0.18;
  var bodyY = y + capH;
  var bodyH = h - capH;
  ctx.save();
  ctx.globalAlpha = alpha;
  var grad = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
  grad.addColorStop(0, '#7A7068');
  grad.addColorStop(1, '#3A3530');
  ctx.fillStyle = grad;
  rRect(x, bodyY, w, bodyH, 6 * S); ctx.fill();
  ctx.strokeStyle = '#2A2530';
  ctx.lineWidth = 1.5 * S;
  rRect(x, bodyY, w, bodyH, 6 * S); ctx.stroke();

  var capGrad = ctx.createLinearGradient(x, y, x, y + capH);
  capGrad.addColorStop(0, '#3A3530');
  capGrad.addColorStop(1, '#7A7068');
  ctx.fillStyle = capGrad;
  rRect(x - 1 * S, y, w + 2 * S, capH, 3 * S); ctx.fill();
  ctx.strokeStyle = '#2A2530';
  ctx.lineWidth = 1.5 * S;
  rRect(x - 1 * S, y, w + 2 * S, capH, 3 * S); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + 2 * S, y + 1 * S, w - 4 * S, 1.5 * S);
  ctx.restore();
}
