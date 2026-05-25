// ============================================================
// wall.js — Wall cell
// ============================================================
//
// Inert structural blocker. Walls never become passable for the activation
// path check, so they permanently shape the puzzle's reachable regions.
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// add the wall art.
// ============================================================

function isWall(cell) {
  return cell && cell.wall === true;
}

function drawWall(/* ctx, x, y, w, h, S, tick */) {
  // TODO: wall art.
}
