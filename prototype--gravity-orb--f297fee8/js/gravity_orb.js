// ============================================================
// gravity_orb.js — Gravity Orb mechanic
// ============================================================
// A special non-bucket cell placed in the 7×7 grid.
// When its path to the belt becomes clear (same activation rules
// as a bucket), it auto-collects — no tap required.
// On collection, the whole canvas rotates 180° over 2 seconds,
// then the sandGrid flips vertically (top↔bottom rows swap).
// Play resumes normally: sand now "falls" from the new top.
// ============================================================

// gravityFlipAnim and gravityOrbCollected are declared in config.js.

function isGravityOrb(cell) {
  return cell && cell.kind === 'gravity_orb';
}

// Check every gravity orb in the grid; collect the first one
// whose activation path to the belt is clear.
function checkGravityOrbCollection() {
  if (gravityOrbCollected) return;
  if (gravityFlipAnim.active) return;

  // BFS — identical to updateBucketActivation but we only need the
  // visited set, not to update cell.active flags.
  var visited = new Uint8Array(GRID_W * GRID_H);
  var queue = [];
  for (var c = 0; c < GRID_W; c++) {
    if (isPassable(stock[c])) { visited[c] = 1; queue.push(c); }
  }
  while (queue.length > 0) {
    var qi = queue.shift();
    var qr = (qi / GRID_W) | 0;
    var qc = qi % GRID_W;
    var nbrs = [];
    if (qr > 0)           nbrs.push(qi - GRID_W);
    if (qr < GRID_H - 1)  nbrs.push(qi + GRID_W);
    if (qc > 0)           nbrs.push(qi - 1);
    if (qc < GRID_W - 1)  nbrs.push(qi + 1);
    for (var ni = 0; ni < nbrs.length; ni++) {
      var n = nbrs[ni];
      if (!visited[n] && isPassable(stock[n])) { visited[n] = 1; queue.push(n); }
    }
  }

  // An orb is collectable when it is in row 0, or any neighbor is passable
  // and reachable (visited).
  for (var idx = 0; idx < stock.length; idx++) {
    var cell = stock[idx];
    if (!cell || cell.kind !== 'gravity_orb') continue;
    var orbR = (idx / GRID_W) | 0;
    var orbC = idx % GRID_W;
    var reachable = (orbR === 0);
    if (!reachable) {
      if (orbR > 0          && visited[idx - GRID_W]) reachable = true;
      if (orbR < GRID_H - 1 && visited[idx + GRID_W]) reachable = true;
      if (orbC > 0          && visited[idx - 1])      reachable = true;
      if (orbC < GRID_W - 1 && visited[idx + 1])      reachable = true;
    }
    if (reachable) {
      collectGravityOrb(idx);
      return;
    }
  }
}

function collectGravityOrb(idx) {
  gravityOrbCollected = true;

  // Particle burst at orb position
  if (L.grid && L.grid.cell) {
    var orbR = (idx / GRID_W) | 0;
    var orbC = idx % GRID_W;
    var px = L.grid.x + (orbC + 0.5) * L.grid.cell;
    var py = L.grid.y + (orbR + 0.5) * L.grid.cell;
    spawnBurst(px, py, '#cc88ff', 24);
    spawnBurst(px, py, '#ffffff', 10);
  }

  stock[idx] = null;
  updateTunnels();
  updateBucketActivation();

  // Start rotation animation (120 frames = 2 s at 60 fps)
  gravityFlipAnim.active = true;
  gravityFlipAnim.t = 0;
  gravityFlipAnim.flipped = false;
}

// Called once per frame from game.js update().
function updateGravityOrb() {
  if (!gravityFlipAnim.active) return;
  gravityFlipAnim.t++;

  // Flip the sandGrid exactly at the halfway point (canvas is edge-on, invisible)
  if (!gravityFlipAnim.flipped && gravityFlipAnim.t >= gravityFlipAnim.dur / 2) {
    flipSandGrid();
    gravityFlipAnim.flipped = true;
  }

  if (gravityFlipAnim.t >= gravityFlipAnim.dur) {
    gravityFlipAnim.active = false;
  }
}

// Mirror sandGrid rows: row 0 ↔ row (SAND_H-1), etc.
function flipSandGrid() {
  var half = (SAND_H / 2) | 0;
  for (var y = 0; y < half; y++) {
    var topOff = y * SAND_W;
    var botOff = (SAND_H - 1 - y) * SAND_W;
    for (var x = 0; x < SAND_W; x++) {
      var tmp = sandGrid[topOff + x];
      sandGrid[topOff + x] = sandGrid[botOff + x];
      sandGrid[botOff + x] = tmp;
    }
  }
}

// Draw the gravity orb in the grid (called from rendering.js drawGrid).
function drawGravityOrb(ctx, x, y, w, h, S, tick) {
  var cx = x + w / 2;
  var cy = y + h / 2;
  var r = Math.min(w, h) * 0.38;
  var pulse = 0.88 + 0.12 * Math.sin(tick * 0.07);

  ctx.save();

  // Soft outer glow
  ctx.shadowColor = 'rgba(200,100,255,0.95)';
  ctx.shadowBlur = 18 * S * pulse;

  // Orb body
  var grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.08, cx, cy, r * pulse);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, '#dd99ff');
  grad.addColorStop(0.65, '#7700dd');
  grad.addColorStop(1, '#1a0033');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Flip-arrows symbol (two arrows pointing away from a centre line)
  ctx.strokeStyle = 'rgba(255,255,255,0.90)';
  ctx.lineWidth = 1.5 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var hs = r * 0.55; // half-span

  // Top arrow (pointing up)
  ctx.beginPath();
  ctx.moveTo(cx, cy - hs);
  ctx.lineTo(cx - r * 0.22, cy - r * 0.18);
  ctx.moveTo(cx, cy - hs);
  ctx.lineTo(cx + r * 0.22, cy - r * 0.18);
  ctx.stroke();

  // Bottom arrow (pointing down)
  ctx.beginPath();
  ctx.moveTo(cx, cy + hs);
  ctx.lineTo(cx - r * 0.22, cy + r * 0.18);
  ctx.moveTo(cx, cy + hs);
  ctx.lineTo(cx + r * 0.22, cy + r * 0.18);
  ctx.stroke();

  // Horizontal centre line
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.32, cy);
  ctx.lineTo(cx + r * 0.32, cy);
  ctx.stroke();

  ctx.restore();
}
