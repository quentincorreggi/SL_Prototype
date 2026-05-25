// ============================================================
// layout.js — Three-zone vertical layout
// ============================================================
//
// Zones (top → bottom):
//   1. L.image — 32×32 sand image (square, centered horizontally)
//   2. L.belt  — 5-slot conveyor (full canvas width, height ≈ slot square)
//   3. L.grid  — 7×7 bucket grid (square, centered horizontally)
//
// Each zone exposes: { x, y, w, h, cell }
//   cell = size of a single sand-pixel / belt-slot / grid-cell
//
// computeLayout() is called on resize and on calibration changes.
// ============================================================

function computeLayout() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  S = H / 850;

  var pad = 16 * S;

  var imgH = H * 0.36;
  var beltH = H * 0.12;
  var gridH = H - imgH - beltH - pad * 4;

  // Image zone — square, centered
  var imgSide = Math.min(imgH, W - pad * 2);
  L.image = {
    x: (W - imgSide * cal.image.s) / 2 + cal.image.dx * S,
    y: pad + cal.image.dy * S,
    w: imgSide * cal.image.s,
    h: imgSide * cal.image.s,
    cell: (imgSide * cal.image.s) / SAND_W
  };

  // Belt zone — full width band
  L.belt = {
    x: pad + cal.belt.dx * S,
    y: L.image.y + L.image.h + pad + cal.belt.dy * S,
    w: (W - pad * 2) * cal.belt.sw,
    h: beltH * cal.belt.sh,
    cell: Math.min((W - pad * 2) / BELT_SLOTS, beltH) * 0.9
  };

  // Grid zone — square, centered
  var gridSide = Math.min(gridH, W - pad * 2);
  L.grid = {
    x: (W - gridSide * cal.grid.s) / 2 + cal.grid.dx * S,
    y: L.belt.y + L.belt.h + pad + cal.grid.dy * S,
    w: gridSide * cal.grid.s,
    h: gridSide * cal.grid.s,
    cell: (gridSide * cal.grid.s) / 7
  };
}
