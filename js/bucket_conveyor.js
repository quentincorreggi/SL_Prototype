// ============================================================
// bucket_conveyor.js — Conveyor Block (belt-only locked bucket)
//
// Spawns directly on the belt at level start. Loops continuously
// while locked, occupying a slot without collecting sand. Unlocks
// after X other buckets are cleared, then collects normally.
// ============================================================

registerBucketType('conveyor', {
  label: 'Conveyor',
  editorColor: '#8B5E3C',

  drawActive: function (ctx, x, y, w, h, ci, S, tick, idlePhase) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },

  drawInactive: function (ctx, x, y, w, h, ci, S, tick) {
    drawJar(ctx, x, y, w, h, ci, S, 0, 0);
  },

  drawOnBelt: function (ctx, x, y, w, h, ci, S, fill, capacity, tick) {
    drawJar(ctx, x, y, w, h, ci, S, fill, capacity);
  },

  editorCellStyle: function (ci) {
    var c = COLORS[ci];
    return {
      background: 'linear-gradient(135deg,' + c.light + ',' + c.dark + ')',
      borderColor: '#8B5E3C'
    };
  },

  editorCellHTML: function (ci) {
    return '';
  }
});

var CONVEYOR_UNLOCK_FRAMES = 24;

function drawConveyorBeltBucket(ctx, x, y, w, h, b, S, tick) {
  var ci = b.ci;

  if (b.locked) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    drawJar(ctx, x, y, w, h, ci, S, 0, b.capacity || 0);
    ctx.restore();

    var capH = h * 0.18;
    ctx.save();
    ctx.fillStyle = 'rgba(30,25,20,0.35)';
    rRect(x, y + capH, w, h - capH, 6 * S);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = (h * 0.28) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3 * S;
    ctx.fillText('🔒', x + w / 2, y + h * 0.55);
    ctx.restore();

    drawConveyorBadge(ctx, x + w + 2 * S, y - 2 * S, b.clearsRemaining, S);

  } else if (b.unlockT != null && b.unlockT < CONVEYOR_UNLOCK_FRAMES) {
    var p = b.unlockT / CONVEYOR_UNLOCK_FRAMES;
    var pulse = 1 + 0.12 * Math.sin(p * Math.PI);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pulse, pulse);
    drawJar(ctx, -w / 2, -h / 2, w, h, ci, S, b.fill || 0, b.capacity || 0);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - p);
    ctx.fillStyle = '#fff';
    rRect(x, y, w, h, 6 * S);
    ctx.fill();
    ctx.restore();

  } else {
    drawJar(ctx, x, y, w, h, ci, S, b.fill || 0, b.capacity || 0);
  }
}

function drawConveyorBadge(ctx, cx, cy, count, S) {
  var r = 9 * S;
  ctx.save();
  ctx.fillStyle = '#D43030';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 3 * S;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5 * S;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (r * 1.1) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count + '', cx, cy + 0.5 * S);
  ctx.restore();
}
