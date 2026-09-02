// ============================================================
// firework.js — Streak reward: firework rocket that splits in two
// ============================================================
//
// This is a CORE / META reward, not a level piece. If the player has
// their streak active when a level starts (streakFireworkActive), a
// single rocket auto-launches a moment after the board appears:
//
//   1. Rocket rises from below the grid, through the belt, into the
//      sand picture.
//   2. At the apex it bangs and splits into FIREWORK_SHELLS smaller
//      shells (default 2).
//   3. Each shell dives onto ONE bucket in the grid and destroys it,
//      and in the same instant vaporises exactly the sand that bucket
//      was going to collect (levelCapacities[ci] grains of its colour).
//      A bright streamer connects the bucket to the sand hole.
//   4. Sand above the hole collapses through the normal CA. The empty
//      cells re-open activation paths, so buckets underneath unlock.
//
// Why bucket + its own sand share, together: capacity is derived as
// ceil(sandOfColour / bucketsOfColour), so removing a bucket without
// removing its share of sand would make the level unwinnable. Doing
// both at the same frame keeps that invariant exact.
//
// Targeting deliberately avoids the player's FIRST MOVES: currently
// active buckets and the front row are heavily penalised, and the
// middle rows of the grid score best (FIREWORK_ROW_PREF). Sand is cut
// from mid-picture rather than the edges.
//
// Input is locked out for the ~1.5s the show runs, so a tap can never
// land between "sand vaporised" and "bucket destroyed".
// ============================================================

function resetFirework() {
  fireworkQueued = 0;
  fireworkRocket = null;
  fireworkShells = [];
  fireworkStreamers = [];
  fireworkBlasts = [];
  fireworkGhosts = [];
  fireworkLabelT = 0;
}

// Every firework timer advances by this instead of 1 frame, so the whole
// show slows down or speeds up together (debug panel → Firework speed).
function fwStep() {
  var v = fireworkSpeed;
  // Never fully freeze: input stays locked until the show resolves, so a
  // speed of 0 (only reachable from the console — the slider floor is
  // 0.05) would otherwise wedge the level.
  if (!(v > 0.02)) return 0.02;
  return v;
}

// Called at the end of initGame. No-op unless the streak is active.
function startStreakFirework() {
  resetFirework();
  if (!streakFireworkActive) return;
  fireworkQueued = FIREWORK_LAUNCH_DELAY;
}

// Debug panel → "Fire again". Replays the show on the board as it stands
// now, so the speed slider can be judged without restarting the level.
function replayStreakFirework() {
  if (!gameActive || won) return;
  if (fireworkBusy()) return;
  fireworkQueued = 6;
}

// True while the show is running — blocks taps.
function fireworkBusy() {
  return fireworkQueued > 0 || fireworkRocket != null || fireworkShells.length > 0;
}

// ============================================================
// Target selection
// ============================================================
//
// Lower score = better target. The middle rows win; anything the
// player could tap right now (active, or front row) is pushed to the
// back so the reward bites into the middle of the level.

function fireworkTargetScore(idx, cell) {
  var r = (idx / GRID_W) | 0;
  var pref = FIREWORK_ROW_PREF.indexOf(r);
  if (pref < 0) pref = GRID_H;
  var s = pref * 10;
  if (cell.active) s += 100;   // this is a first-move bucket — avoid
  if (r === 0) s += 60;        // front row — avoid
  return s;
}

// Pick up to `n` distinct bucket cells to blow up. Shells prefer
// different colours and columns far apart, so the two blasts read as
// two separate events instead of one double-hit.
function pickFireworkTargets(n) {
  var cands = [];
  for (var i = 0; i < stock.length; i++) {
    var cell = stock[i];
    if (!cell || cell.kind !== 'bucket' || cell.used) continue;
    cands.push({ idx: i, ci: cell.ci, score: fireworkTargetScore(i, cell) + Math.random() * 4 });
  }
  var out = [];
  for (var k = 0; k < n; k++) {
    var best = -1, bestScore = 0;
    for (var c = 0; c < cands.length; c++) {
      var cd = cands[c];
      if (cd.taken) continue;
      var sc = cd.score;
      for (var o = 0; o < out.length; o++) {
        if (out[o].ci === cd.ci) sc += 15;               // spread across colours
        var colDist = Math.abs((out[o].idx % GRID_W) - (cd.idx % GRID_W));
        sc -= colDist * 2;                                // spread across columns
      }
      if (best < 0 || sc < bestScore) { best = c; bestScore = sc; }
    }
    if (best < 0) break;
    cands[best].taken = true;
    out.push({ idx: cands[best].idx, ci: cands[best].ci });
  }
  return out;
}

// ============================================================
// Sand vaporising
// ============================================================

// Remove `count` grains of colour ci, taken as the cluster nearest the
// middle of the picture. Returns the burst centre in canvas space, or
// null if there was nothing of that colour left.
function fireworkVaporizeSand(ci, count) {
  if (count <= 0) return null;
  var pts = [];
  for (var y = 0; y < SAND_H; y++) {
    for (var x = 0; x < SAND_W; x++) {
      if (sandGrid[sandIdx(x, y)] === ci) pts.push({ x: x, y: y });
    }
  }
  if (pts.length === 0) return null;

  // Anchor on the grain of this colour closest to the middle of the
  // image, so the hole is punched mid-picture, not at an edge.
  var mx = SAND_W / 2 - 0.5, my = SAND_H / 2 - 0.5;
  var ax = pts[0].x, ay = pts[0].y, bestD = 1e9;
  for (var p = 0; p < pts.length; p++) {
    var dx0 = pts[p].x - mx, dy0 = pts[p].y - my;
    var d0 = dx0 * dx0 + dy0 * dy0;
    if (d0 < bestD) { bestD = d0; ax = pts[p].x; ay = pts[p].y; }
  }

  // Nearest `count` grains to that anchor.
  for (var q = 0; q < pts.length; q++) {
    var dx1 = pts[q].x - ax, dy1 = pts[q].y - ay;
    pts[q].d2 = dx1 * dx1 + dy1 * dy1;
  }
  pts.sort(function (a, b) { return a.d2 - b.d2; });
  var take = Math.min(count, pts.length);

  var cs = L.image ? L.image.cell : 1;
  var step = Math.max(1, Math.floor(take / 26));  // subsample the puff particles
  var maxR = 0;
  for (var t = 0; t < take; t++) {
    var g = pts[t];
    sandGrid[sandIdx(g.x, g.y)] = -1;
    if (g.d2 > maxR) maxR = g.d2;
    if (t % step === 0 && L.image) {
      var px = L.image.x + (g.x + 0.5) * cs;
      var py = L.image.y + (g.y + 0.5) * cs;
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      particles.push({
        x: px, y: py, vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
        r: (1.5 + Math.random() * 2.5) * S, color: COLORS[ci].fill,
        life: 1, decay: 0.02 + Math.random() * 0.02, grav: true, ts: fireworkSpeed
      });
    }
  }

  var bx = L.image ? L.image.x + (ax + 0.5) * cs : W / 2;
  var by = L.image ? L.image.y + (ay + 0.5) * cs : H / 2;
  fireworkBlasts.push({ x: bx, y: by, r: Math.sqrt(maxR) * cs, ci: ci, t: 0, dur: 22 });
  return { x: bx, y: by };
}

// ============================================================
// Update
// ============================================================

function updateFirework() {
  if (fireworkLabelT > 0) fireworkLabelT -= fwStep();
  updateFireworkBlasts();
  updateFireworkStreamers();
  updateFireworkGhosts();

  if (fireworkQueued > 0) {
    fireworkQueued--;
    if (fireworkQueued === 0) launchFireworkRocket();
    return;
  }

  updateFireworkRocket();
  updateFireworkShells();
}

function launchFireworkRocket() {
  var targets = pickFireworkTargets(FIREWORK_SHELLS);
  var apexY = L.image ? L.image.y + L.image.h * 0.42 : H * 0.3;
  fireworkRocket = {
    x: W / 2,
    y: H + 30 * S,
    fromY: H + 30 * S,
    apexY: apexY,
    targets: targets,
    t: 0,
    dur: FIREWORK_RISE_FRAMES
  };
  fireworkLabelT = 90;
  if (typeof sfx !== 'undefined' && sfx.rocket) sfx.rocket();
}

function updateFireworkRocket() {
  var rk = fireworkRocket;
  if (!rk) return;
  rk.t += fwStep();
  var u = Math.min(1, rk.t / rk.dur);
  var e = 1 - (1 - u) * (1 - u);           // decelerate toward the apex
  rk.y = rk.fromY + (rk.apexY - rk.fromY) * e;
  rk.x = W / 2 + Math.sin(rk.t * 0.35) * 3 * S;

  // Spark trail — spawn rate follows the playback speed so a slowed
  // rocket doesn't leave a solid wall of sparks behind it.
  for (var i = 0; i < 2; i++) {
    if (Math.random() > Math.min(1, fireworkSpeed + 0.25)) continue;
    particles.push({
      x: rk.x + (Math.random() - 0.5) * 5 * S,
      y: rk.y + 8 * S + Math.random() * 6 * S,
      vx: (Math.random() - 0.5) * 1.2 * S,
      vy: (1 + Math.random() * 1.5) * S,
      r: (1 + Math.random() * 2) * S,
      color: Math.random() < 0.5 ? '#FFF6D0' : '#FFC741',
      life: 1, decay: 0.05 + Math.random() * 0.04, grav: false, ts: fireworkSpeed
    });
  }

  if (rk.t >= rk.dur) {
    splitFireworkRocket(rk);
    fireworkRocket = null;
  }
}

// The apex bang: white flash + ring, then one shell per target.
function splitFireworkRocket(rk) {
  fireworkBlasts.push({ x: rk.x, y: rk.y, r: 26 * S, ci: -1, t: 0, dur: 18 });
  spawnBurst(rk.x, rk.y, '#FFFDF0', 18);
  if (typeof sfx !== 'undefined' && sfx.split) sfx.split();

  var n = rk.targets.length;
  for (var i = 0; i < n; i++) {
    var tg = rk.targets[i];
    var r = (tg.idx / GRID_W) | 0;
    var c = tg.idx % GRID_W;
    var to = gridCellCenter(r, c);
    // Fan the shells outward before they dive, so the two paths read
    // as separate arcs rather than one line.
    var side = (n === 1) ? 0 : (i * 2 / (n - 1) - 1);
    fireworkShells.push({
      fromX: rk.x, fromY: rk.y,
      ctrlX: rk.x + side * W * 0.34,
      ctrlY: rk.y - 30 * S,
      toX: to.x, toY: to.y,
      x: rk.x, y: rk.y,
      idx: tg.idx, ci: tg.ci,
      delay: i * FIREWORK_SHELL_STAGGER,
      t: 0, dur: FIREWORK_SHELL_FRAMES
    });
  }
}

function updateFireworkShells() {
  for (var i = fireworkShells.length - 1; i >= 0; i--) {
    var sh = fireworkShells[i];
    if (sh.delay > 0) { sh.delay -= fwStep(); continue; }
    sh.t += fwStep();
    var u = Math.min(1, sh.t / sh.dur);
    var iu = 1 - u;
    sh.x = iu * iu * sh.fromX + 2 * iu * u * sh.ctrlX + u * u * sh.toX;
    sh.y = iu * iu * sh.fromY + 2 * iu * u * sh.ctrlY + u * u * sh.toY;

    // Glitter tail
    if (Math.random() <= Math.min(1, fireworkSpeed + 0.25)) {
      particles.push({
        x: sh.x, y: sh.y,
        vx: (Math.random() - 0.5) * 1.5 * S,
        vy: (Math.random() - 0.5) * 1.5 * S,
        r: (1 + Math.random() * 2) * S,
        color: COLORS[sh.ci].light,
        life: 1, decay: 0.06, grav: false, ts: fireworkSpeed
      });
    }

    if (sh.t >= sh.dur) {
      detonateFireworkShell(sh);
      fireworkShells.splice(i, 1);
    }
  }
}

// One shell landing: destroy the bucket AND vaporise its sand share in
// the same frame, so capacity totals stay balanced no matter what.
function detonateFireworkShell(sh) {
  var cell = stock[sh.idx];
  if (!cell || cell.kind !== 'bucket' || cell.used || cell.ci !== sh.ci) {
    // Target went away (shouldn't happen — input is locked) — fizzle
    // harmlessly rather than eating sand with nothing to pay for it.
    spawnBurst(sh.x, sh.y, '#FFFDF0', 10);
    if (typeof sfx !== 'undefined' && sfx.crackle) sfx.crackle();
    return;
  }

  var ci = cell.ci;
  var pad = 3 * S;
  var cs = L.grid.cell;
  stock[sh.idx] = null;
  var sandPos = fireworkVaporizeSand(ci, levelCapacities[ci] || 0);

  // Bucket blast — plus a ghost of the jar that just died, blowing up
  // and fading out of its cell so you can see WHICH bucket was hit.
  fireworkGhosts.push({
    x: sh.toX - (cs - pad * 2) / 2, y: sh.toY - (cs - pad * 2) / 2,
    w: cs - pad * 2, h: cs - pad * 2,
    ci: ci, t: 0, dur: 26
  });
  fireworkFlower(sh.toX, sh.toY, ci, 26);
  fireworkBlasts.push({ x: sh.toX, y: sh.toY, r: cs * 0.75, ci: ci, t: 0, dur: 24 });

  // Sand blast + the streamer that links the two
  if (sandPos) {
    fireworkFlower(sandPos.x, sandPos.y, ci, 22);
    fireworkStreamers.push({
      x1: sh.toX, y1: sh.toY, x2: sandPos.x, y2: sandPos.y,
      ci: ci, t: 0, dur: 34
    });
  }

  if (typeof sfx !== 'undefined' && sfx.bang) sfx.bang();

  // The hole in the grid may have opened new activation paths.
  updateTunnels();
  updateBucketActivation();
}

function fireworkFlower(x, y, ci, n) {
  n = n || 24;
  for (var i = 0; i < n; i++) {
    var a = Math.PI * 2 * i / n + Math.random() * 0.3;
    var sp = 3 + Math.random() * 5;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp * S, vy: Math.sin(a) * sp * S - 1.5 * S,
      r: (2 + Math.random() * 3) * S,
      color: (i % 3 === 0) ? '#FFFDF0' : (i % 3 === 1 ? COLORS[ci].fill : COLORS[ci].light),
      life: 1, decay: 0.012 + Math.random() * 0.012, grav: true, ts: fireworkSpeed
    });
  }
}

function updateFireworkBlasts() {
  for (var i = fireworkBlasts.length - 1; i >= 0; i--) {
    fireworkBlasts[i].t += fwStep();
    if (fireworkBlasts[i].t >= fireworkBlasts[i].dur) fireworkBlasts.splice(i, 1);
  }
}

function updateFireworkStreamers() {
  for (var i = fireworkStreamers.length - 1; i >= 0; i--) {
    fireworkStreamers[i].t += fwStep();
    if (fireworkStreamers[i].t >= fireworkStreamers[i].dur) fireworkStreamers.splice(i, 1);
  }
}

function updateFireworkGhosts() {
  for (var i = fireworkGhosts.length - 1; i >= 0; i--) {
    fireworkGhosts[i].t += fwStep();
    if (fireworkGhosts[i].t >= fireworkGhosts[i].dur) fireworkGhosts.splice(i, 1);
  }
}

// ============================================================
// Drawing — called from drawFrame (rendering.js) after the grid
// ============================================================

function drawFireworks() {
  drawFireworkGhosts();
  drawFireworkStreamers();
  drawFireworkBlasts();
  drawFireworkRocket();
  drawFireworkShells();
  drawFireworkLabel();
}

// The destroyed jar, swelling and fading where it used to sit.
function drawFireworkGhosts() {
  for (var i = 0; i < fireworkGhosts.length; i++) {
    var g = fireworkGhosts[i];
    var u = g.t / g.dur;
    var sc = 1 + u * 0.55;
    var cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - u);
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    drawJar(ctx, g.x, g.y, g.w, g.h, g.ci, S, 0, 0);
    ctx.restore();
  }
}

function drawFireworkRocket() {
  var rk = fireworkRocket;
  if (!rk) return;
  var bw = 10 * S, bh = 28 * S;
  ctx.save();
  ctx.translate(rk.x, rk.y);

  // Exhaust flame
  var flame = (0.7 + Math.random() * 0.6) * 16 * S;
  var fg = ctx.createLinearGradient(0, bh * 0.5, 0, bh * 0.5 + flame);
  fg.addColorStop(0, 'rgba(255,255,220,0.95)');
  fg.addColorStop(0.5, 'rgba(255,190,60,0.75)');
  fg.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-bw * 0.5, bh * 0.5);
  ctx.lineTo(bw * 0.5, bh * 0.5);
  ctx.lineTo(0, bh * 0.5 + flame);
  ctx.closePath();
  ctx.fill();

  // Fins
  ctx.fillStyle = '#C43B2E';
  ctx.beginPath();
  ctx.moveTo(-bw * 0.5, bh * 0.2);
  ctx.lineTo(-bw * 1.2, bh * 0.55);
  ctx.lineTo(-bw * 0.5, bh * 0.55);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bw * 0.5, bh * 0.2);
  ctx.lineTo(bw * 1.2, bh * 0.55);
  ctx.lineTo(bw * 0.5, bh * 0.55);
  ctx.closePath(); ctx.fill();

  // Steel body
  var bg = ctx.createLinearGradient(-bw * 0.5, 0, bw * 0.5, 0);
  bg.addColorStop(0, '#8A8F98');
  bg.addColorStop(0.4, '#EFF2F6');
  bg.addColorStop(1, '#6C727C');
  ctx.fillStyle = bg;
  ctx.fillRect(-bw * 0.5, -bh * 0.3, bw, bh * 0.85);

  // Red nose cone
  ctx.fillStyle = '#FF453B';
  ctx.beginPath();
  ctx.moveTo(-bw * 0.5, -bh * 0.3);
  ctx.lineTo(bw * 0.5, -bh * 0.3);
  ctx.lineTo(0, -bh * 0.75);
  ctx.closePath(); ctx.fill();

  ctx.restore();
}

function drawFireworkShells() {
  for (var i = 0; i < fireworkShells.length; i++) {
    var sh = fireworkShells[i];
    if (sh.delay > 0) continue;
    var c = COLORS[sh.ci];
    var pulse = 1 + Math.sin(tick * 0.4) * 0.12;
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 20 * S;
    // Coloured halo, so the shell reads against the sand picture as well
    // as against the grid.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.fill;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 11 * S * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Dark rim first — keeps the shell readable even when it flies over
    // sand of its own colour.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(50,30,10,0.55)';
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 7.2 * S, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 20 * S;
    ctx.fillStyle = '#FFFDF0';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 6.5 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.fill;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 3.6 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawFireworkBlasts() {
  for (var i = 0; i < fireworkBlasts.length; i++) {
    var b = fireworkBlasts[i];
    var u = b.t / b.dur;
    var r = b.r * (0.25 + u * 1.05);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - u);
    ctx.strokeStyle = b.ci < 0 ? '#FFFDF0' : COLORS[b.ci].light;
    ctx.lineWidth = Math.max(1, 3.5 * S * (1 - u));
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = Math.max(0, 0.35 * (1 - u));
    ctx.fillStyle = b.ci < 0 ? '#FFFDF0' : COLORS[b.ci].fill;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// The bright line linking a destroyed bucket to the sand it owned —
// this is what tells the player WHY that hole appeared in the picture.
function drawFireworkStreamers() {
  for (var i = 0; i < fireworkStreamers.length; i++) {
    var s = fireworkStreamers[i];
    var u = s.t / s.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - u);
    ctx.strokeStyle = COLORS[s.ci].light;
    ctx.lineWidth = Math.max(1, 3 * S * (1 - u * 0.7));
    ctx.shadowColor = COLORS[s.ci].glow;
    ctx.shadowBlur = 10 * S;
    ctx.setLineDash([6 * S, 5 * S]);
    ctx.lineDashOffset = -s.t * 3 * S;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFireworkLabel() {
  if (fireworkLabelT <= 0) return;
  var u = fireworkLabelT / 90;
  ctx.save();
  ctx.globalAlpha = Math.min(1, u * 2.2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + (26 * S) + 'px Fredoka, sans-serif';
  ctx.lineWidth = 5 * S;
  ctx.strokeStyle = 'rgba(90,70,40,0.55)';
  ctx.fillStyle = '#FFF3C4';
  var y = (L.belt ? L.belt.y + L.belt.h / 2 : H * 0.5) - 0;
  ctx.strokeText('STREAK BONUS!', W / 2, y);
  ctx.fillText('STREAK BONUS!', W / 2, y);
  ctx.restore();
}

// ============================================================
// Streak toggle (stands in for the real meta layer)
// ============================================================

function toggleStreakFirework() {
  streakFireworkActive = !streakFireworkActive;
  refreshStreakButtons();
}

function refreshStreakButtons() {
  var on = streakFireworkActive;
  var a = document.getElementById('streak-btn');
  if (a) {
    a.textContent = on ? '🎆 Streak Boost: ON' : '🎆 Streak Boost: OFF';
    a.style.opacity = on ? '1' : '0.62';
    a.style.background = on ? 'linear-gradient(135deg,#FFE08A,#FFB03A)' : 'rgba(255,255,255,0.6)';
    a.style.color = on ? '#6B4A12' : '#5A4A38';
  }
  var b = document.getElementById('ed-streak-btn');
  if (b) {
    b.textContent = on ? '🎆 Streak: ON' : '🎆 Streak: OFF';
    b.style.opacity = on ? '1' : '0.62';
  }
}

// ============================================================
// Streak demo level — a board where the middle rows are worth hitting
// ============================================================

function streakDemoLevel() {
  var grid = new Array(GRID_W * GRID_H);
  for (var i = 0; i < grid.length; i++) grid[i] = null;
  function placeB(r, c, ci, type) {
    grid[r * GRID_W + c] = { kind: 'bucket', type: type || 'default', ci: ci };
  }
  function placeW(r, c) { grid[r * GRID_W + c] = { kind: 'wall' }; }

  // Row 2 — the front line the player can tap immediately.
  var row2 = [0, 1, 2, 9, 0, 1, 2];
  for (var c2 = 0; c2 < GRID_W; c2++) placeB(2, c2, row2[c2]);
  // Row 3 — walls with gaps, plus the first locked buckets.
  placeW(3, 0); placeW(3, 2); placeW(3, 4); placeW(3, 6);
  placeB(3, 1, 9); placeB(3, 3, 0); placeB(3, 5, 1);
  // Rows 4-6 — the mid/late body of the level.
  var row4 = [2, 9, 0, 1, 2, 9, 0];
  for (var c4 = 0; c4 < GRID_W; c4++) placeB(4, c4, row4[c4]);
  placeW(5, 1); placeW(5, 5);
  placeB(5, 0, 1); placeB(5, 2, 2); placeB(5, 3, 9, 'hidden');
  placeB(5, 4, 0); placeB(5, 6, 2);
  var row6 = [9, 0, 1, 2, 9, 0, 1];
  for (var c6 = 0; c6 < GRID_W; c6++) placeB(6, c6, row6[c6]);

  // Sand image — four vertical bands so a mid-picture hole is obvious.
  var bands = [0, 1, 2, 9];
  var sand = new Array(IMG_W * IMG_H);
  for (var y = 0; y < IMG_H; y++) {
    for (var x = 0; x < IMG_W; x++) {
      sand[y * IMG_W + x] = bands[Math.floor(x / (IMG_W / 4)) % 4];
    }
  }
  return {
    name: 'Streak Split',
    desc: 'Firework streak reward — 2 buckets + their sand vanish',
    grid: grid,
    sandImage: sand
  };
}

function startStreakDemo() {
  streakFireworkActive = true;
  refreshStreakButtons();
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.add('hidden');
  if (ed) ed.classList.add('hidden');
  if (typeof ensureAudio === 'function') ensureAudio();
  initGame(streakDemoLevel());
}
