// ============================================================
// bucket_vortex.js — Vortex bucket type
// ============================================================
// A vortex bucket collects sand a completely different way. Instead of
// pulling the nearest grain near the belt, once it rides the belt it opens
// a swirling vortex at the CENTRE of the sand image: matching grains are
// sucked out from the middle outward and the whole picture twists inward.
//
// The special collection + deformation logic lives in js/vortex.js. This
// file only handles how the bucket looks (grid + belt + editor).
//
// Visual: a jar in deep violet with a white spinning spiral glyph.
// ============================================================

// Draw an Archimedean spiral glyph centred at (cx, cy).
function drawVortexBadge(ctx, cx, cy, rad, S, rot, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  var turns = 2.2, steps = 44;
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var ang = rot + t * turns * Math.PI * 2;
    var r = rad * t;
    var xx = cx + r * Math.cos(ang);
    var yy = cy + r * Math.sin(ang);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.restore();
}

registerBucketType('vortex', {
  label: 'Vortex',
  editorColor: '#8A3CE0',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    var rad = Math.min(w, h) * 0.28;
    drawVortexBadge(ctx, x + w / 2, y + h * 0.58, rad, S, tick * 0.06, 'rgba(255,255,255,0.92)');
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
    var rad = Math.min(w, h) * 0.28;
    drawVortexBadge(ctx, x + w / 2, y + h * 0.58, rad, S, 0, 'rgba(255,255,255,0.7)');
    ctx.restore();
    // Lock icon overlay (can't be tapped yet)
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.30) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 2 * S;
    ctx.fillText('🔒', x + w / 2, y + h * 0.5);
    ctx.restore();
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
    var rad = Math.min(w, h) * 0.22;
    drawVortexBadge(ctx, x + w / 2, y + h * 0.5, rad, S, tick * 0.09, 'rgba(255,255,255,0.85)');
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#8A3CE0'
    };
  },

  editorCellHTML: function (ci) {
    // Spiral marker so vortex buckets read differently from plain ones.
    return '<span class="ed-cell-dot">🌀</span>';
  }
});
