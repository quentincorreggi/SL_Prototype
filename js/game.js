// ============================================================
// game.js — Boot, game loop, input
// ============================================================
//
// Top-level responsibilities:
//   - initGame()                build stock[], beltSlots[], seed sand image
//   - update()                  one tick: belt → sand → attraction → trails
//   - frame()                   requestAnimationFrame loop, calls drawFrame()
//   - handleTap()               route taps to grid (activate bucket) or editor
//   - updateBucketActivation()  recompute every cell's active state based
//                               on upward-path-to-belt rule
//   - win check                 all sand grains collected → won = true
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// implement the tap handler, activation logic, and win condition.
// ============================================================

function initGame() {
  computeLayout();
  initBelt();

  stock = new Array(49);
  for (var i = 0; i < stock.length; i++) stock[i] = null;

  for (var s = 0; s < sandGrid.length; s++) sandGrid[s] = -1;

  // Seed a tiny demo image so the canvas isn't blank on first load.
  // The first prototype branch will remove this — real levels supply
  // their own sand image.
  seedDemoSand();

  jumpers = [];
  particles = [];
  attractionTrails = [];
  won = false;
  gameActive = true;
}

function seedDemoSand() {
  for (var y = 0; y < SAND_H; y++) {
    for (var x = 0; x < SAND_W; x++) {
      if ((x + y) % 3 === 0) sandGrid[sandIdx(x, y)] = 0;
      else if ((x * 2 + y) % 5 === 0) sandGrid[sandIdx(x, y)] = 1;
      else if ((x + y * 3) % 7 === 0) sandGrid[sandIdx(x, y)] = 2;
    }
  }
}

function update() {
  tick++;
  if (!gameActive) return;
  updateBelt();
  updateSand();
  updateBucketAttraction();
  updateAttractionTrails();

  if (countSandRemaining() === 0 && !won) {
    won = true;
    showWin();
  }
}

function frame() {
  update();
  drawFrame();
  requestAnimationFrame(frame);
}

function handleTap(/* sx, sy */) {
  // TODO: route to grid (activate bucket) — implemented in first prototype.
}

function updateBucketActivation() {
  // TODO: BFS upward from each cell to row -1 (above the grid = belt).
  // A bucket is active iff there's a path of empty/used cells.
  // Implemented in first prototype.
}

function showWin() {
  var el = document.getElementById('win-screen');
  if (el) el.classList.add('show');
}

function showLevelSelect() {
  var win = document.getElementById('win-screen');
  if (win) win.classList.remove('show');
  initGame();
}

// === Boot ===
window.addEventListener('resize', function () { computeLayout(); });

canvas.addEventListener('pointerdown', function (e) {
  var rect = canvas.getBoundingClientRect();
  handleTap(e.clientX - rect.left, e.clientY - rect.top);
});

initGame();
requestAnimationFrame(frame);
