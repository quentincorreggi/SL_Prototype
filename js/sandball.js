// ============================================================
// sandball.js — Sand Ball mechanic
// ============================================================
//
// A grid ingredient (kind: 'sandball') that follows the same path-to-belt
// activation rule as buckets, but does NOT ride the belt. When the player
// taps an active sand ball:
//   1. The grid cell becomes empty (so the activation BFS reopens behind it).
//   2. A bomb projectile flies in a parabolic arc to the bottom-centre of
//      the sand image.
//   3. On impact: every grain becomes a "flying grain" with a velocity vector
//      pointing radially outward from the blast (plus upward lift). Grains
//      ballistically fall back into the sand grid, then the existing CA
//      settles the pile — colours preserved, image shuffled.
//
// State lives in this file as globals (vanilla JS convention).
// ============================================================

var sandBombs = [];        // bomb projectiles arcing toward the pile
var flyingGrains = [];     // grains in mid-explosion
var screenShake = { t: 0, mag: 0 };

var SANDBALL_FUSE_FRAMES = 26;     // arc duration from grid to impact
var GRAIN_GRAVITY = 0.045;          // sand-cells / frame^2
var EXPLOSION_BASE_FORCE = 0.55;    // peak outward velocity
var EXPLOSION_UP_LIFT = 0.55;       // upward boost at impact

// ============================================================
// Trigger — called from handleTap() when an active sandball is tapped.
// ============================================================

function triggerSandball(fromX, fromY) {
  if (!L.image) return;
  // Target: just above the floor, horizontally centred.
  var toX = L.image.x + L.image.w * 0.5;
  var toY = L.image.y + L.image.h - L.image.cell * 1.5;
  sandBombs.push({
    fromX: fromX,
    fromY: fromY,
    toX: toX,
    toY: toY,
    t: 0,
    dur: SANDBALL_FUSE_FRAMES
  });
  if (typeof sfx !== 'undefined' && sfx.drop) sfx.drop();
}

// ============================================================
// Per-frame updates
// ============================================================

function updateSandBombs() {
  for (var i = sandBombs.length - 1; i >= 0; i--) {
    var b = sandBombs[i];
    b.t++;
    if (b.t >= b.dur) {
      detonateAt(b.toX, b.toY);
      sandBombs.splice(i, 1);
    }
  }
}

function updateFlyingGrains() {
  if (flyingGrains.length === 0) return;
  for (var i = flyingGrains.length - 1; i >= 0; i--) {
    var g = flyingGrains[i];
    g.vy += GRAIN_GRAVITY;
    g.x += g.vx;
    g.y += g.vy;

    // Bounce softly off the left/right walls of the image.
    if (g.x < 0.5) { g.x = 0.5; g.vx = -g.vx * 0.4; }
    if (g.x > SAND_W - 0.5) { g.x = SAND_W - 0.5; g.vx = -g.vx * 0.4; }

    // Off the top: keep going until gravity pulls it back.
    if (g.y < -2) { g.y = -2; if (g.vy < 0) g.vy = 0; }

    // Settle once falling and touching ground / pile.
    if (g.vy > 0 && g.y >= 0) {
      var cx = Math.floor(g.x);
      var cy = Math.floor(g.y);
      if (cx < 0) cx = 0;
      if (cx >= SAND_W) cx = SAND_W - 1;
      // Past the floor → land on top of the column.
      if (cy >= SAND_H - 1) {
        depositGrain(g.ci, cx, SAND_H - 1);
        flyingGrains.splice(i, 1);
        continue;
      }
      // If the cell directly below is solid, drop into the current cell.
      var below = sandGrid[sandIdx(cx, cy + 1)];
      if (below >= 0) {
        depositGrain(g.ci, cx, cy);
        flyingGrains.splice(i, 1);
        continue;
      }
    }
  }
}

// Place a grain at (cx, cy); if occupied, walk upward to the first empty
// cell. If the whole column is full, drop the grain (sand was conserved
// by extraction, so this should be rare unless the pile overflows).
function depositGrain(ci, cx, cy) {
  if (cx < 0 || cx >= SAND_W) return;
  var y = cy;
  if (y < 0) y = 0;
  if (y >= SAND_H) y = SAND_H - 1;
  while (y >= 0 && sandGrid[sandIdx(cx, y)] >= 0) y--;
  if (y < 0) return;
  sandGrid[sandIdx(cx, y)] = ci;
}

function updateScreenShake() {
  if (screenShake.t > 0) screenShake.t--;
}

// ============================================================
// Detonation — converts every grain into a flying ballistic grain.
// (sx, sy) is the blast centre in canvas coords.
// ============================================================

function detonateAt(sx, sy) {
  if (!L.image) return;
  var cellSize = L.image.cell;
  var bx = (sx - L.image.x) / cellSize;
  var by = (sy - L.image.y) / cellSize;

  for (var y = 0; y < SAND_H; y++) {
    for (var x = 0; x < SAND_W; x++) {
      var idx = sandIdx(x, y);
      var ci = sandGrid[idx];
      if (ci < 0) continue;
      sandGrid[idx] = -1;

      var dx = (x + 0.5) - bx;
      var dy = (y + 0.5) - by;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) {
        // At the centre — random direction.
        var a = Math.random() * Math.PI * 2;
        dx = Math.cos(a); dy = Math.sin(a); d = 1;
      }
      var nx = dx / d;
      var ny = dy / d;
      var falloff = Math.max(0.35, 1 - d / (SAND_W * 0.55));
      var force = EXPLOSION_BASE_FORCE * falloff * (0.75 + Math.random() * 0.55);
      var jitter = 0.18;
      flyingGrains.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: nx * force + (Math.random() - 0.5) * jitter,
        vy: ny * force - EXPLOSION_UP_LIFT * falloff + (Math.random() - 0.5) * jitter,
        ci: ci
      });
    }
  }

  // Visual + audio impact
  if (typeof spawnBurst === 'function') {
    spawnBurst(sx, sy, '#fff1c2', 30);
    spawnBurst(sx, sy, '#ff8a3a', 24);
    spawnBurst(sx, sy, '#c44820', 18);
  }
  screenShake = { t: 22, mag: 14 };
  if (typeof sfx !== 'undefined') {
    // Low boom: descending square wave
    tone(120, 0.35, 'square', 0.18, 40);
    tone(60, 0.45, 'sawtooth', 0.12, 30);
  }
}

// ============================================================
// Drawing
// ============================================================

function drawSandBombs() {
  for (var i = 0; i < sandBombs.length; i++) {
    var b = sandBombs[i];
    var p = b.t / b.dur;
    var x = b.fromX + (b.toX - b.fromX) * p;
    var y = b.fromY + (b.toY - b.fromY) * p;
    // High arc so it visibly flies over the belt before slamming down.
    var arc = -220 * S * Math.sin(p * Math.PI);
    y += arc;
    var rot = p * Math.PI * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    drawBombSprite(ctx, 11 * S, true, tick);
    ctx.restore();
  }
}

function drawFlyingGrains() {
  if (!L.image || flyingGrains.length === 0) return;
  var cs = L.image.cell;
  // Subtle glow so airborne grains read against the background.
  ctx.save();
  for (var i = 0; i < flyingGrains.length; i++) {
    var g = flyingGrains[i];
    var px = L.image.x + g.x * cs;
    var py = L.image.y + g.y * cs;
    ctx.fillStyle = COLORS[g.ci].fill;
    ctx.fillRect(px - cs * 0.55, py - cs * 0.55, cs + 1, cs + 1);
  }
  ctx.restore();
}

// Bomb sprite shared between in-flight bomb and grid display.
function drawBombSprite(ctx, rad, sparkActive, t) {
  // Body
  var grad = ctx.createRadialGradient(-rad * 0.4, -rad * 0.4, rad * 0.15, 0, 0, rad);
  grad.addColorStop(0, '#5a4d52');
  grad.addColorStop(0.7, '#28201f');
  grad.addColorStop(1, '#0d0808');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Highlight blob
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.arc(-rad * 0.35, -rad * 0.4, rad * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Wick
  ctx.strokeStyle = '#8a5a32';
  ctx.lineWidth = Math.max(1.5, rad * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -rad + 1);
  ctx.quadraticCurveTo(rad * 0.4, -rad * 1.5, rad * 0.6, -rad * 1.35);
  ctx.stroke();
  // Spark
  if (sparkActive) {
    var phase = ((t || 0) % 24) / 24;
    var pulse = 0.85 + Math.sin(phase * Math.PI * 2) * 0.25;
    var sx = rad * 0.6;
    var sy = -rad * 1.35;
    var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 0.7 * pulse);
    glow.addColorStop(0, 'rgba(255,235,150,0.95)');
    glow.addColorStop(0.45, 'rgba(255,140,40,0.55)');
    glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 0.7 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,200,0.95)';
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 0.22 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Grid-cell drawing for kind:'sandball'.
function drawSandballCell(ctx, x, y, w, h, S, tick, active) {
  ctx.save();
  var cx = x + w / 2;
  var cy = y + h * 0.58;
  var rad = Math.min(w, h) * 0.30;

  if (!active) ctx.globalAlpha = 0.55;

  ctx.translate(cx, cy);
  drawBombSprite(ctx, rad, active, tick);
  ctx.translate(-cx, -cy);

  if (!active) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + (h * 0.28) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 2 * S;
    ctx.fillText('🔒', cx, cy);
  }
  ctx.restore();
}

// Editor preview tile (used when this cell is placed in the editor grid).
function drawSandballEditorPreview() {
  // Returns a CSS-style preview matching the in-game look.
  return {
    background: 'radial-gradient(circle at 35% 30%, #4a4044 0%, #1a1418 70%, #050303 100%)',
    borderColor: '#000'
  };
}

// ============================================================
// Reset hook — called from initGame so a fresh level starts clean.
// ============================================================

function resetSandball() {
  sandBombs = [];
  flyingGrains = [];
  screenShake = { t: 0, mag: 0 };
}

// ============================================================
// Showcase level registration (CLAUDE.md asks each prototype to
// register at least one demo level in the LEVELS array).
// The Play Demo button uses demoLevel() in game.js — this entry is for
// future level-select wiring.
// ============================================================

(function registerSandballLevel() {
  if (typeof LEVELS === 'undefined') return;
  var grid = new Array(GRID_W * GRID_H);
  for (var i = 0; i < grid.length; i++) grid[i] = null;
  function pb(r, c, ci) { grid[r * GRID_W + c] = { kind: 'bucket', type: 'default', ci: ci }; }
  pb(0, 0, 0); pb(0, 2, 1); pb(0, 4, 2); pb(0, 6, 0);
  pb(1, 1, 1); pb(1, 3, 0); pb(1, 5, 2);
  grid[2 * GRID_W + 2] = { kind: 'wall' };
  grid[2 * GRID_W + 3] = { kind: 'sandball' };
  grid[2 * GRID_W + 4] = { kind: 'wall' };
  pb(3, 1, 2); pb(3, 3, 1); pb(3, 5, 0);
  pb(4, 0, 1); pb(4, 2, 2); pb(4, 4, 0); pb(4, 6, 1);
  var sand = new Array(IMG_W * IMG_H);
  for (var y = 0; y < IMG_H; y++) {
    var ci = (y < 11) ? 0 : (y < 22) ? 1 : 2;
    for (var x = 0; x < IMG_W; x++) sand[y * IMG_W + x] = ci;
  }
  LEVELS.push({
    name: 'Sand Ball Demo',
    desc: 'Stripes shuffle when the ball pops',
    grid: grid,
    sandImage: sand
  });
})();
