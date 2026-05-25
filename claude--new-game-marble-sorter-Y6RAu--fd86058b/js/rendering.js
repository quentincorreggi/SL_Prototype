// ============================================================
// rendering.js — Canvas drawing
// ============================================================
//
// Per-frame draw pass:
//   drawFrame() → drawSandImage(), drawBelt(), drawGrid(), drawTrails()
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// flesh out the bucket art, attraction trails, and animations.
// ============================================================

function drawFrame() {
  ctx.clearRect(0, 0, W, H);

  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#EDE5D8');
  bg.addColorStop(1, '#D4C4AA');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawSandImage();
  drawBelt();
  drawGrid();
  drawTrails();
  drawScaffoldNotice();
}

function drawSandImage() {
  if (!L.image) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(L.image.x - 4 * S, L.image.y - 4 * S,
               L.image.w + 8 * S, L.image.h + 8 * S);
  ctx.strokeStyle = 'rgba(139,105,20,0.4)';
  ctx.lineWidth = 1 * S;
  ctx.strokeRect(L.image.x - 4 * S, L.image.y - 4 * S,
                 L.image.w + 8 * S, L.image.h + 8 * S);

  var cs = L.image.cell;
  for (var y = 0; y < SAND_H; y++) {
    for (var x = 0; x < SAND_W; x++) {
      var ci = sandGrid[sandIdx(x, y)];
      if (ci < 0) continue;
      ctx.fillStyle = COLORS[ci].fill;
      ctx.fillRect(L.image.x + x * cs, L.image.y + y * cs, cs + 0.5, cs + 0.5);
    }
  }
  ctx.restore();
}

function drawBelt() {
  if (!L.belt) return;
  ctx.save();
  ctx.fillStyle = 'rgba(90,74,56,0.18)';
  ctx.fillRect(L.belt.x, L.belt.y, L.belt.w, L.belt.h);
  ctx.strokeStyle = 'rgba(90,74,56,0.35)';
  ctx.lineWidth = 1 * S;
  ctx.strokeRect(L.belt.x, L.belt.y, L.belt.w, L.belt.h);

  // Direction-hint tread marks
  var treadCount = 16;
  var treadW = L.belt.w / treadCount;
  ctx.fillStyle = 'rgba(90,74,56,0.10)';
  for (var i = 0; i < treadCount; i++) {
    var tx = L.belt.x + (((i + treadCount * 4 - beltOffset * 4) % treadCount) * treadW);
    ctx.fillRect(tx, L.belt.y + L.belt.h * 0.45, treadW * 0.4, L.belt.h * 0.1);
  }

  // Buckets in slots
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b) continue;
    var pos = getBeltSlotPos(s);
    var size = L.belt.cell;
    var type = getBucketType(b.type || 'default');
    type.drawOnBelt(ctx, pos.x - size / 2, pos.y - size / 2,
                    size, size, b.ci, S,
                    b.fill || 0, BUCKET_CAPACITY, tick);
  }
  ctx.restore();
}

function drawGrid() {
  if (!L.grid) return;
  ctx.save();
  var cs = L.grid.cell;
  for (var r = 0; r < 7; r++) {
    for (var c = 0; c < 7; c++) {
      var x = L.grid.x + c * cs;
      var y = L.grid.y + r * cs;
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(x + 2 * S, y + 2 * S, cs - 4 * S, cs - 4 * S);
      ctx.strokeStyle = 'rgba(139,105,20,0.18)';
      ctx.lineWidth = 1 * S;
      ctx.strokeRect(x + 2 * S, y + 2 * S, cs - 4 * S, cs - 4 * S);
    }
  }
  ctx.restore();
}

function drawTrails() {
  // TODO: animate attractionTrails — implemented in first prototype.
}

function drawScaffoldNotice() {
  ctx.save();
  ctx.fillStyle = 'rgba(90,74,56,0.85)';
  ctx.font = 'bold ' + (14 * S) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Sand Loop — scaffolding ready. Implement on a prototype branch.',
               W / 2, H - 8 * S);
  ctx.restore();
}
