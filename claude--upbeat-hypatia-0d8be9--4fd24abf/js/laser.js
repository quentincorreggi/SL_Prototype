// ============================================================
// laser.js — Laser charge bar + horizontal sand-cutting beam
// ============================================================
//
// Each bucket pop charges the bar by 1. After LASER_CHARGE_COUNT
// pops the bar fires a horizontal laser across the sand image,
// destroying a LASER_HEIGHT_PX-tall band of sand.
//
// States: 'idle' → 'targeting' (scan sweeps, picks row) →
//         'firing' (beam flash, sand erased) → 'idle'
// ============================================================

var LASER_CHARGE_COUNT  = 5;   // bucket pops needed to fill bar
var LASER_HEIGHT_PX     = 10;  // image rows erased (out of 32)
var LASER_TARGET_FRAMES = 40;  // frames for targeting sweep
var LASER_FIRE_FRAMES   = 28;  // frames for beam flash

// Runtime state (reset by initLaser)
var laserCharge     = 0;       // 0..LASER_CHARGE_COUNT
var laserState      = 'idle';  // 'idle' | 'targeting' | 'firing'
var laserAnimT      = 0;
var laserTargetRow  = 0;       // image-pixel row chosen for beam
var laserScanRow    = 0;       // current row highlighted during targeting

function initLaser() {
  laserCharge    = 0;
  laserState     = 'idle';
  laserAnimT     = 0;
  laserTargetRow = 0;
  laserScanRow   = 0;
}

// Called by belt.js whenever a bucket finishes its pop animation.
function onBucketPopped() {
  if (!gameActive || won) return;
  if (laserState !== 'idle') return; // mid-animation; drop the charge

  laserCharge++;
  if (laserCharge >= LASER_CHARGE_COUNT) {
    laserCharge    = 0;
    laserState     = 'targeting';
    laserAnimT     = 0;
    laserTargetRow = pickLaserTargetRow();
    laserScanRow   = 0;
    if (typeof sfx !== 'undefined') sfx.laserCharge();
  }
}

// Pick a random image row that contains at least one sand grain.
function pickLaserTargetRow() {
  var valid = [];
  for (var iy = 0; iy < IMG_H; iy++) {
    outer: for (var sy = iy * SAND_SUBDIV; sy < (iy + 1) * SAND_SUBDIV; sy++) {
      for (var sx = 0; sx < SAND_W; sx++) {
        if (sandGrid[sy * SAND_W + sx] >= 0) { valid.push(iy); break outer; }
      }
    }
  }
  if (valid.length === 0) return (IMG_H / 2) | 0;
  return valid[(Math.random() * valid.length) | 0];
}

// ============================================================
// Update — called once per frame from game.js update()
// ============================================================

function updateLaser() {
  if (laserState === 'idle') return;
  laserAnimT++;

  if (laserState === 'targeting') {
    // First 24 frames: sweep fast (2 rows per frame).
    // Remaining frames: decelerate toward targetRow.
    if (laserAnimT < 24) {
      laserScanRow = (laserScanRow + 2) % IMG_H;
    } else {
      var delta = laserTargetRow - laserScanRow;
      if (Math.abs(delta) > 1) {
        laserScanRow += Math.sign(delta) * Math.max(1, Math.ceil(Math.abs(delta) * 0.35));
        laserScanRow = Math.max(0, Math.min(IMG_H - 1, laserScanRow));
      } else {
        laserScanRow = laserTargetRow;
      }
    }
    if (laserAnimT >= LASER_TARGET_FRAMES) {
      laserScanRow   = laserTargetRow;
      laserState     = 'firing';
      laserAnimT     = 0;
      if (typeof sfx !== 'undefined') sfx.laserFire();
    }
    return;
  }

  if (laserState === 'firing') {
    // Erase the sand band on the frame the beam is at peak intensity.
    if (laserAnimT === ((LASER_FIRE_FRAMES * 0.35) | 0)) {
      eraseLaserBand();
    }
    if (laserAnimT >= LASER_FIRE_FRAMES) {
      laserState = 'idle';
      laserAnimT = 0;
    }
  }
}

function eraseLaserBand() {
  var half     = (LASER_HEIGHT_PX / 2) | 0;
  var startIY  = Math.max(0, laserTargetRow - half);
  var endIY    = Math.min(IMG_H - 1, laserTargetRow + (LASER_HEIGHT_PX - half - 1));
  var burstBudget = 18; // max burst calls to avoid particle explosion

  for (var iy = startIY; iy <= endIY; iy++) {
    for (var sy = iy * SAND_SUBDIV; sy < (iy + 1) * SAND_SUBDIV; sy++) {
      for (var sx = 0; sx < SAND_W; sx++) {
        var ci = sandGrid[sy * SAND_W + sx];
        if (ci < 0) continue;
        if (typeof spawnBurst === 'function' && burstBudget > 0 && Math.random() < 0.06) {
          var px = L.image.x + (sx + 0.5) * L.image.cell;
          var py = L.image.y + (sy + 0.5) * L.image.cell;
          spawnBurst(px, py, COLORS[ci].fill, 3);
          burstBudget--;
        }
        sandGrid[sy * SAND_W + sx] = -1;
      }
    }
  }
}

// ============================================================
// Drawing — called from drawFrame() in rendering.js
// ============================================================

function drawLaserBar() {
  if (!L.image) return;
  ctx.save();

  var frame  = 6 * S;                            // matches wood-frame width in drawSandImage
  var barGap = 6 * S;
  var barW   = 10 * S;
  var barX   = L.image.x + L.image.w + frame + barGap;
  var barY   = L.image.y;
  var barH   = L.image.h;
  var rad    = barW / 2;

  var chargeFrac = laserCharge / LASER_CHARGE_COUNT;

  // Background track
  rRect(barX, barY, barW, barH, rad);
  ctx.fillStyle = 'rgba(30,22,14,0.40)';
  ctx.fill();

  // Fill (bottom-to-top)
  if (chargeFrac > 0) {
    var fillH = barH * chargeFrac;
    var fillY = barY + barH - fillH;

    var grad = ctx.createLinearGradient(barX, fillY + fillH, barX, fillY);
    grad.addColorStop(0,   '#FF7A00');
    grad.addColorStop(0.55,'#FF2200');
    grad.addColorStop(1,   '#FFFFFF');
    ctx.save();
    rRect(barX, barY, barW, barH, rad);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(barX, fillY, barW, fillH);
    ctx.restore();

    // Glow around bar when charged
    ctx.shadowColor = '#FF4400';
    ctx.shadowBlur  = 10 * S * chargeFrac;
    rRect(barX, fillY, barW, fillH, rad);
    ctx.fillStyle = 'rgba(255,80,0,' + (chargeFrac * 0.25) + ')';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Segment tick marks (5 divisions)
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth   = 1 * S;
  for (var seg = 1; seg < LASER_CHARGE_COUNT; seg++) {
    var ty = barY + barH * (1 - seg / LASER_CHARGE_COUNT);
    ctx.beginPath();
    ctx.moveTo(barX + 2 * S, ty);
    ctx.lineTo(barX + barW - 2 * S, ty);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = 'rgba(60,44,28,0.55)';
  ctx.lineWidth   = 1.5 * S;
  rRect(barX, barY, barW, barH, rad);
  ctx.stroke();

  // Lightning bolt icon above bar
  var iconCx = barX + barW / 2;
  var iconCy = barY - 11 * S;
  ctx.font          = 'bold ' + (10 * S) + 'px sans-serif';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillStyle     = chargeFrac > 0 ? '#FF8C00' : 'rgba(100,80,60,0.45)';
  ctx.fillText('⚡', iconCx, iconCy);

  ctx.restore();
}

function drawLaserEffect() {
  if (!L.image) return;
  if (laserState === 'targeting') drawLaserTargeting();
  else if (laserState === 'firing') drawLaserFiring();
}

function drawLaserTargeting() {
  ctx.save();
  var p = laserAnimT / LASER_TARGET_FRAMES;

  // Scan line highlight on current row
  var cellH   = SAND_SUBDIV * L.image.cell;
  var scanTop = L.image.y + laserScanRow * cellH;
  var pulse   = 0.20 + 0.10 * Math.sin(laserAnimT * 0.6);
  ctx.fillStyle = 'rgba(255,120,0,' + pulse + ')';
  ctx.fillRect(L.image.x, scanTop, L.image.w, cellH);

  // Once settling into the target row, show the full danger band blinking
  if (p > 0.65) {
    var half    = (LASER_HEIGHT_PX / 2) | 0;
    var startIY = Math.max(0, laserTargetRow - half);
    var bandTop = L.image.y + startIY * cellH;
    var bandH   = LASER_HEIGHT_PX * cellH;
    var blink   = ((laserAnimT * 0.18) | 0) % 2 === 0;
    if (blink) {
      ctx.fillStyle = 'rgba(255,40,0,0.28)';
      ctx.fillRect(L.image.x, bandTop, L.image.w, bandH);
      ctx.strokeStyle  = 'rgba(255,80,0,0.75)';
      ctx.lineWidth    = 1.5 * S;
      ctx.setLineDash([4 * S, 3 * S]);
      ctx.strokeRect(L.image.x, bandTop, L.image.w, bandH);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function drawLaserFiring() {
  ctx.save();
  var p = laserAnimT / LASER_FIRE_FRAMES;

  // Intensity: ramp up to 0.4 then fade out
  var intensity = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
  intensity     = Math.max(0, intensity);

  var half    = (LASER_HEIGHT_PX / 2) | 0;
  var startIY = Math.max(0, laserTargetRow - half);
  var cellH   = SAND_SUBDIV * L.image.cell;
  var bandTop = L.image.y + startIY * cellH;
  var bandH   = LASER_HEIGHT_PX * cellH;
  var coreY   = L.image.y + laserTargetRow * cellH + cellH / 2;

  // Wide orange glow
  ctx.shadowColor = '#FF5500';
  ctx.shadowBlur  = 22 * S * intensity;
  ctx.fillStyle   = 'rgba(255,100,0,' + (intensity * 0.55) + ')';
  ctx.fillRect(L.image.x - 8 * S, bandTop - 6 * S, L.image.w + 16 * S, bandH + 12 * S);
  ctx.shadowBlur  = 0;

  // Beam body
  ctx.fillStyle = 'rgba(255,210,80,' + (intensity * 0.90) + ')';
  ctx.fillRect(L.image.x, bandTop, L.image.w, bandH);

  // Bright core line
  var coreH = Math.max(2, 3 * S);
  ctx.fillStyle = 'rgba(255,255,255,' + intensity + ')';
  ctx.fillRect(L.image.x, coreY - coreH / 2, L.image.w, coreH);

  // Left-to-right sweep front (during build-up)
  if (p < 0.4) {
    var frontX = L.image.x + L.image.w * (p / 0.4);
    ctx.fillStyle = 'rgba(255,255,255,' + (intensity * 0.95) + ')';
    ctx.fillRect(frontX - 8 * S, bandTop, 8 * S, bandH);
  }

  ctx.restore();
}
