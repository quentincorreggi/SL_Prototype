// ============================================================
// rendering.js — Canvas drawing
// ============================================================
//
// Per-frame draw pass:
//   drawFrame()
//     drawBackground
//     drawSandImage     (32×32 grains in a wood-tone frame)
//     drawBelt          (track + tread marks + buckets + counter)
//     drawGrid          (7×7 cells, with buckets/tunnels/walls)
//     drawJumpers       (grid → belt arc animation)
//     drawTrails        (grain → bucket attraction lines)
//     drawParticles
//     drawWinOverlay    (no-op; HTML handles it)
// ============================================================

// Helper: rounded rect path (browser roundRect is recent — fall back).
function rRect(x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  if (r > w * 0.5) r = w * 0.5;
  if (r > h * 0.5) r = h * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawFrame() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  // Apply screen-shake to everything except the background.
  var shaking = typeof screenShake !== 'undefined' && screenShake.t > 0;
  if (shaking) {
    var k = screenShake.t / 22;
    var mag = screenShake.mag * S * k;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
  }
  drawSandImage();
  drawBelt();
  drawGrid();
  drawJumpers();
  drawTrails();
  if (typeof drawFlyingGrains === 'function') drawFlyingGrains();
  if (typeof drawSandBombs === 'function') drawSandBombs();
  if (typeof drawParticles === 'function') drawParticles();
  if (shaking) ctx.restore();
}

function drawBackground() {
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#EDE5D8');
  bg.addColorStop(1, '#D4C4AA');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

// ============================================================
// Sand image
// ============================================================

function drawSandImage() {
  if (!L.image) return;
  ctx.save();

  // Wood-tone frame around image
  var frame = 6 * S;
  var fx = L.image.x - frame, fy = L.image.y - frame;
  var fw = L.image.w + frame * 2, fh = L.image.h + frame * 2;
  var grad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
  grad.addColorStop(0, '#C4A878');
  grad.addColorStop(1, '#8E7240');
  ctx.fillStyle = grad;
  rRect(fx, fy, fw, fh, 8 * S); ctx.fill();
  ctx.strokeStyle = '#5A4628';
  ctx.lineWidth = 1.5 * S;
  rRect(fx, fy, fw, fh, 8 * S); ctx.stroke();

  // Sky (image background)
  ctx.fillStyle = '#FCEFD6';
  ctx.fillRect(L.image.x, L.image.y, L.image.w, L.image.h);

  // Grains
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

// ============================================================
// Belt
// ============================================================

function drawBelt() {
  if (!L.belt) return;
  ctx.save();

  var trackPad = 6 * S;
  var tx = L.belt.x, ty = L.belt.y + trackPad;
  var tw = L.belt.w, th = L.belt.h - trackPad * 2;

  // Track body
  var grad = ctx.createLinearGradient(tx, ty, tx, ty + th);
  grad.addColorStop(0, '#5A5048');
  grad.addColorStop(0.5, '#7A6F65');
  grad.addColorStop(1, '#5A5048');
  ctx.fillStyle = grad;
  rRect(tx, ty, tw, th, 6 * S); ctx.fill();

  // Tread marks (animate right→left)
  ctx.save();
  ctx.beginPath();
  rRect(tx, ty, tw, th, 6 * S);
  ctx.clip();
  var treadW = 14 * S;
  var gap = 10 * S;
  var period = treadW + gap;
  var shift = (beltOffset * (L.belt.w / BELT_SLOTS)) % period;
  ctx.fillStyle = 'rgba(40,32,24,0.35)';
  for (var x = tx - period + shift; x < tx + tw + period; x += period) {
    ctx.fillRect(x, ty + th * 0.5 - 2 * S, treadW, 4 * S);
  }
  ctx.restore();

  // Track outline
  ctx.strokeStyle = 'rgba(40,32,24,0.55)';
  ctx.lineWidth = 1.5 * S;
  rRect(tx, ty, tw, th, 6 * S); ctx.stroke();

  // Buckets in slots
  for (var s = 0; s < BELT_SLOTS; s++) {
    var b = beltSlots[s];
    if (!b || b.reserved) continue;
    drawBeltBucket(s, b);
  }

  // "0/5" counter chip — center, just above belt
  drawBeltCounter();

  ctx.restore();
}

function drawBeltBucket(s, b) {
  var pos = getBeltSlotPos(s);
  var size = L.belt.cell;
  var scale = 1;
  if (b.done) {
    // Pop animation: scale up to 1.25 then to 0
    var p = b.popT / BUCKET_POP_FRAMES;
    scale = p < 0.4 ? 1 + p * 0.6 : 1.24 - (p - 0.4) / 0.6 * 1.24;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (p - 0.4) / 0.6));
  } else {
    ctx.save();
  }
  // Reveal-cross-fade for hidden type
  var displayCi = b.ci;
  var revealAlpha = 1;
  if (b.type === 'hidden' && b.revealT != null && b.revealT < 12) {
    revealAlpha = b.revealT / 12;
  }
  var type = getBucketType(b.type === 'hidden' && revealAlpha < 1 ? 'hidden' : 'default');
  // Draw "in-between" reveal: under-cap hidden, over-cap default fading in
  if (b.type === 'hidden' && b.revealT != null && b.revealT < 12) {
    var hidden = getBucketType('hidden');
    var defType = getBucketType('default');
    var w = size * scale, h = size * scale;
    var x = pos.x - w / 2, y = pos.y - h / 2;
    ctx.globalAlpha = 1 - revealAlpha;
    hidden.drawActive(ctx, x, y, w, h, displayCi, S, tick, 0);
    ctx.globalAlpha = revealAlpha;
    drawJar(ctx, x, y, w, h, displayCi, S, b.fill || 0, b.capacity || 0);
    ctx.globalAlpha = 1;
  } else {
    var w = size * scale, h = size * scale;
    var x = pos.x - w / 2, y = pos.y - h / 2;
    drawJar(ctx, x, y, w, h, displayCi, S, b.fill || 0, b.capacity || 0);
  }
  ctx.restore();
}

function drawBeltCounter() {
  var live = countBucketsOnBelt() + jumpers.length;
  var maxN = BELT_SLOTS;
  var txt = live + '/' + maxN;
  ctx.save();
  ctx.font = 'bold ' + (16 * S) + 'px sans-serif';
  var pad = 8 * S;
  var w = ctx.measureText(txt).width + pad * 2 + 18 * S;
  var h = 26 * S;
  var x = L.belt.x + L.belt.w / 2 - w / 2;
  var y = L.belt.y - h - 4 * S;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  rRect(x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(90,74,56,0.4)';
  ctx.lineWidth = 1 * S;
  rRect(x, y, w, h, h / 2); ctx.stroke();
  // Bucket icon
  ctx.fillStyle = '#9C8A70';
  var ix = x + pad + 4 * S;
  var iy = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(ix - 5 * S, iy - 5 * S);
  ctx.lineTo(ix + 5 * S, iy - 5 * S);
  ctx.lineTo(ix + 4 * S, iy + 5 * S);
  ctx.lineTo(ix - 4 * S, iy + 5 * S);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = '#5A4A38';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, ix + 10 * S, iy);
  ctx.restore();
}

// ============================================================
// Grid
// ============================================================

function drawGrid() {
  if (!L.grid) return;
  ctx.save();
  var cs = L.grid.cell;
  var pad = 3 * S;
  // Backing panel
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  rRect(L.grid.x - 6 * S, L.grid.y - 6 * S, L.grid.w + 12 * S, L.grid.h + 12 * S, 10 * S);
  ctx.fill();

  for (var r = 0; r < GRID_H; r++) {
    for (var c = 0; c < GRID_W; c++) {
      var idx = r * GRID_W + c;
      var x = L.grid.x + c * cs;
      var y = L.grid.y + r * cs;
      // Cell slot (always drawn so empty cells are visible)
      ctx.fillStyle = 'rgba(120,100,80,0.10)';
      rRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2, 4 * S);
      ctx.fill();

      var cell = stock[idx];
      if (!cell) continue;

      var bx = x + pad, by = y + pad, bw = cs - pad * 2, bh = cs - pad * 2;

      // Shake offset on belt-full rejection
      var ox = 0;
      if (rejectShake.t > 0 && rejectShake.idx === idx) {
        ox = Math.sin(rejectShake.t * 1.5) * 4 * S;
      }

      if (cell.kind === 'wall') {
        drawWall(ctx, bx + ox, by, bw, bh, S, tick);
        continue;
      }
      if (cell.kind === 'tunnel') {
        drawTunnel(ctx, bx + ox, by, bw, bh, cell, S, tick);
        continue;
      }
      if (cell.kind === 'sandball') {
        if (cell.used) { drawUsedBucket(bx + ox, by, bw, bh, 0); continue; }
        drawSandballCell(ctx, bx + ox, by, bw, bh, S, tick, !!cell.active);
        continue;
      }
      if (cell.kind === 'bucket') {
        if (cell.used) {
          drawUsedBucket(bx + ox, by, bw, bh, cell.ci);
          continue;
        }
        var type = getBucketType(cell.type);
        if (cell.active) {
          type.drawActive(ctx, bx + ox, by, bw, bh, cell.ci, S, tick, 0);
        } else {
          type.drawInactive(ctx, bx + ox, by, bw, bh, cell.ci, S, tick);
        }
      }
    }
  }
  ctx.restore();
}

function drawUsedBucket(x, y, w, h, ci) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = COLORS[ci].dark;
  rRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.45, 4 * S);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// Jar drawing — shared between default bucket types and belt rendering
// ============================================================

function drawJar(ctx, x, y, w, h, ci, S, fill, capacity) {
  var c = COLORS[ci];
  var capH = h * 0.18;
  var bodyY = y + capH;
  var bodyH = h - capH;
  ctx.save();

  // Body
  var grad = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
  grad.addColorStop(0, c.light);
  grad.addColorStop(1, c.dark);
  ctx.fillStyle = grad;
  rRect(x, bodyY, w, bodyH, 6 * S); ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.5 * S;
  rRect(x, bodyY, w, bodyH, 6 * S); ctx.stroke();

  // Fill indicator — sand-level inside the jar
  if (capacity > 0 && fill > 0) {
    var fillFrac = Math.min(1, fill / capacity);
    ctx.save();
    rRect(x + 2 * S, bodyY + 2 * S, w - 4 * S, bodyH - 4 * S, 4 * S);
    ctx.clip();
    ctx.fillStyle = c.fill;
    ctx.fillRect(x, bodyY + bodyH * (1 - fillFrac), w, bodyH * fillFrac);
    // Top highlight on the fill
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, bodyY + bodyH * (1 - fillFrac), w, 1.5 * S);
    ctx.restore();
  }

  // Cap (lid)
  var capGrad = ctx.createLinearGradient(x, y, x, y + capH);
  capGrad.addColorStop(0, c.dark);
  capGrad.addColorStop(1, c.fill);
  ctx.fillStyle = capGrad;
  rRect(x - 1 * S, y, w + 2 * S, capH, 3 * S); ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.5 * S;
  rRect(x - 1 * S, y, w + 2 * S, capH, 3 * S); ctx.stroke();

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 2 * S, y + 1 * S, w - 4 * S, 1.5 * S);

  // Fill count (small)
  if (capacity > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (h * 0.22) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 2 * S;
    ctx.fillText(fill + '', x + w / 2, bodyY + bodyH * 0.6);
  }
  ctx.restore();
}

// ============================================================
// Jumpers (grid → belt arc)
// ============================================================

function drawJumpers() {
  for (var i = 0; i < jumpers.length; i++) {
    var j = jumpers[i];
    var p = j.t / j.dur;
    var x = j.from.x + (j.to.x - j.from.x) * p;
    var y = j.from.y + (j.to.y - j.from.y) * p;
    // Parabolic arc
    var arc = -120 * S * Math.sin(p * Math.PI);
    y += arc;
    var rot = (p - 0.5) * 0.5;
    var size = L.belt.cell;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    drawJar(ctx, -size / 2, -size / 2, size, size, j.bucket.ci, S, 0, j.bucket.capacity || 0);
    ctx.restore();
  }
}

// ============================================================
// Attraction trails
// ============================================================

function drawTrails() {
  for (var i = 0; i < attractionTrails.length; i++) {
    var t = attractionTrails[i];
    var p = t.t / t.dur;
    // Straight line from grain origin to the bucket's current centre.
    // toX/toY are re-steered every frame in updateAttractionTrails so
    // the grain keeps homing in as the bucket scrolls.
    var x = t.fromX + (t.toX - t.fromX) * p;
    var y = t.fromY + (t.toY - t.fromY) * p;
    var c = COLORS[t.ci];
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 8 * S;
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.arc(x, y, 3.5 * S * (1 - 0.3 * p), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
