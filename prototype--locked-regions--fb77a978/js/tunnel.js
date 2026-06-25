// ============================================================
// tunnel.js — Tunnel cell
// ============================================================
//
// A tunnel stores a queue of bucket descriptors in `contents`. When the
// activation BFS visits a tunnel and the adjacent cell (in `dir`) is empty,
// the next bucket in the queue spawns there. The auto-spawn step lives in
// game.js#updateBucketActivation.
//
// Tunnels are pass-through for the activation BFS regardless of contents.
//
// Visual: rounded square with a directional arrow and a content count badge.
// ============================================================

function isTunnel(cell) { return cell && cell.kind === 'tunnel'; }

function drawTunnel(ctx, x, y, w, h, cell, S, tick) {
  ctx.save();
  // Dark cap-stone look
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#4A4248');
  grad.addColorStop(1, '#28232A');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 5 * S); ctx.fill();
  ctx.strokeStyle = '#1A171C';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 5 * S); ctx.stroke();

  // Arrow indicator (pointing in `dir`)
  ctx.fillStyle = '#FFC04D';
  ctx.strokeStyle = '#8B5A20';
  ctx.lineWidth = 1 * S;
  drawTunnelArrow(ctx, x + w / 2, y + h / 2, w * 0.32, cell.dir || 'top');

  // Content count badge (top-right)
  var count = cell.contents ? cell.contents.length : 0;
  if (count > 0) {
    var bx = x + w - 7 * S;
    var by = y + 4 * S;
    ctx.fillStyle = '#FFB545';
    ctx.beginPath();
    ctx.arc(bx, by, 7 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8B5A20';
    ctx.lineWidth = 1 * S;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (10 * S) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count + '', bx, by + 0.5 * S);
  }

  ctx.restore();
}

function drawTunnelArrow(ctx, cx, cy, r, dir) {
  ctx.save();
  ctx.translate(cx, cy);
  if (dir === 'top') ctx.rotate(-Math.PI / 2);
  else if (dir === 'bottom') ctx.rotate(Math.PI / 2);
  else if (dir === 'left') ctx.rotate(Math.PI);
  // (right = default, no rotation)
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.5, -r * 0.7);
  ctx.lineTo(-r * 0.5, -r * 0.3);
  ctx.lineTo(-r, -r * 0.3);
  ctx.lineTo(-r, r * 0.3);
  ctx.lineTo(-r * 0.5, r * 0.3);
  ctx.lineTo(-r * 0.5, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
