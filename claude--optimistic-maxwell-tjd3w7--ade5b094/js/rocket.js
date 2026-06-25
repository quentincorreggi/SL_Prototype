// ============================================================
// rocket.js — Rocket Booster mechanic
// Always-available button next to the grid. Tap to fire a
// rocket at the sand image; it explodes and destroys sand
// within a blast radius.
// ============================================================

var rocketProjectile = null;        // null or active projectile object
var ROCKET_BLAST_RADIUS_IMG = 5;    // blast radius in image-pixel units

// ============================================================
// Button geometry (recomputed from layout each query)
// ============================================================

function getRocketButtonPos() {
  if (!L.grid) return null;
  var btnR = 26 * S;
  return {
    x: L.grid.x + L.grid.w + btnR + 10 * S,
    y: L.grid.y + L.grid.h * 0.5,
    r: btnR
  };
}

function isRocketButtonTap(sx, sy) {
  if (!gameActive || won) return false;
  var btn = getRocketButtonPos();
  if (!btn) return false;
  var dx = sx - btn.x, dy = sy - btn.y;
  return dx * dx + dy * dy <= btn.r * btn.r;
}

// ============================================================
// Fire
// ============================================================

function fireRocket() {
  if (rocketProjectile) return; // already in flight
  var btn = getRocketButtonPos();
  if (!btn || !L.image) return;

  // Random target inside the sand image (avoiding edges)
  var margin = 0.15;
  var tx = L.image.x + (margin + Math.random() * (1 - 2 * margin)) * L.image.w;
  var ty = L.image.y + (margin + Math.random() * (1 - 2 * margin)) * L.image.h;

  var dx = tx - btn.x, dy = ty - btn.y;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var frames = 50;
  var speed = dist / frames;

  rocketProjectile = {
    x: btn.x,
    y: btn.y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    tx: tx,
    ty: ty,
    trail: []
  };
}

// ============================================================
// Update (called from game.js update())
// ============================================================

function updateRocket() {
  if (!rocketProjectile) return;
  var r = rocketProjectile;

  // Record trail point
  r.trail.push({ x: r.x, y: r.y, life: 1 });
  if (r.trail.length > 18) r.trail.shift();

  // Move
  r.x += r.vx;
  r.y += r.vy;

  // Fade trail
  for (var i = r.trail.length - 1; i >= 0; i--) {
    r.trail[i].life -= 0.055;
    if (r.trail[i].life <= 0) r.trail.splice(i, 1);
  }

  // Arrival check
  var dx = r.x - r.tx, dy = r.y - r.ty;
  if (dx * dx + dy * dy < (8 * S) * (8 * S)) {
    rocketExplode(r.tx, r.ty);
    rocketProjectile = null;
  }
}

// ============================================================
// Explosion
// ============================================================

function rocketExplode(cx, cy) {
  // Map canvas coords → sand grid coords
  var imgFracX = (cx - L.image.x) / L.image.w;
  var imgFracY = (cy - L.image.y) / L.image.h;
  var sandCX = Math.round(imgFracX * SAND_W);
  var sandCY = Math.round(imgFracY * SAND_H);
  var blastR = ROCKET_BLAST_RADIUS_IMG * SAND_SUBDIV;
  var blastR2 = blastR * blastR;

  for (var sy = 0; sy < SAND_H; sy++) {
    for (var sx = 0; sx < SAND_W; sx++) {
      var ddx = sx - sandCX, ddy = sy - sandCY;
      if (ddx * ddx + ddy * ddy <= blastR2) {
        sandGrid[sandIdx(sx, sy)] = -1;
      }
    }
  }

  // Big particle burst
  if (typeof spawnBurst === 'function') {
    for (var c = 0; c < 5; c++) {
      spawnBurst(cx, cy, COLORS[c % NUM_COLORS].fill, 16);
    }
    // Fire-colored burst on top
    spawnBurst(cx, cy, '#ff6600', 24);
    spawnBurst(cx, cy, '#ffdd00', 16);
  }

  // Shockwave ring stored for drawing
  rocketShockwave = { x: cx, y: cy, r: 0, maxR: 60 * S, life: 1 };
}

// ============================================================
// Shockwave ring
// ============================================================

var rocketShockwave = null;

function updateRocketShockwave() {
  if (!rocketShockwave) return;
  rocketShockwave.r += 4 * S;
  rocketShockwave.life -= 0.06;
  if (rocketShockwave.life <= 0) rocketShockwave = null;
}

// ============================================================
// Draw
// ============================================================

function drawRocketButton() {
  if (!L.grid) return;
  var btn = getRocketButtonPos();
  if (!btn) return;
  var r = btn.r;

  ctx.save();

  // Glow when idle (no rocket in flight)
  if (!rocketProjectile) {
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 14 * S;
  }

  // Button circle
  var grad = ctx.createRadialGradient(btn.x - r * 0.25, btn.y - r * 0.25, r * 0.05, btn.x, btn.y, r);
  grad.addColorStop(0, rocketProjectile ? '#885522' : '#ff8833');
  grad.addColorStop(1, rocketProjectile ? '#552200' : '#cc2200');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rocketProjectile ? '#664422' : '#ffaa55';
  ctx.lineWidth = 2 * S;
  ctx.stroke();

  // Rocket emoji
  ctx.font = Math.round(r * 1.05) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚀', btn.x, btn.y + r * 0.05);

  ctx.restore();
}

function drawRocketProjectile() {
  if (!rocketProjectile) return;
  var r = rocketProjectile;
  var angle = Math.atan2(r.vy, r.vx);

  ctx.save();

  // Flame trail
  for (var i = 0; i < r.trail.length; i++) {
    var t = r.trail[i];
    var frac = i / r.trail.length;
    ctx.globalAlpha = t.life * 0.7 * frac;
    var tr = (6 * S) * frac;
    // Orange to yellow gradient along trail
    ctx.fillStyle = frac > 0.6 ? '#ffdd00' : '#ff6600';
    ctx.beginPath();
    ctx.arc(t.x, t.y, Math.max(1, tr), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // Rocket emoji rotated toward target
  ctx.translate(r.x, r.y);
  ctx.rotate(angle + Math.PI / 2); // emoji nose points up; rotate so nose leads
  ctx.font = Math.round(20 * S) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚀', 0, 0);

  ctx.restore();
}

function drawRocketShockwave() {
  if (!rocketShockwave) return;
  var sw = rocketShockwave;
  ctx.save();
  ctx.globalAlpha = sw.life * 0.6;
  ctx.strokeStyle = '#ffaa44';
  ctx.lineWidth = 3 * S;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
