// ============================================================
// tunnel.js — Tunnel cell
// ============================================================
//
// A tunnel stores a queue of bucket descriptors. When the activation path
// from below reaches the tunnel, the next bucket in the queue spawns into
// the adjacent cell in the configured direction (top/bottom/left/right).
//
// Tunnels are pass-through for the activation-path check, regardless of
// contents — matches Marble Sorter behavior, just inverted: we now check
// paths upward to the belt rather than downward to the bottom edge.
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// port the tunnel logic, retargeting the path check at the belt.
// ============================================================

function isTunnel(cell) {
  return cell && cell.tunnel === true;
}

function tunnelSpawnIntoAdjacent(/* tunnelIndex */) {
  // TODO: pop next bucket descriptor and place into adjacent cell.
}

function drawTunnel(/* ctx, x, y, w, h, cell, S, tick */) {
  // TODO: tunnel art.
}
