// ============================================================
// wall.js — Wall cell
// ============================================================
//
// Inert blocker: never passable for the activation BFS, never spawns.
// Visual: brick pattern in muted stone tones.
// ============================================================

function isWall(cell) { return cell && cell.kind === 'wall'; }

function drawWall(ctx, x, y, w, h, S, tick) {
  ctx.save();
  // Base stone fill
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#A89B88');
  grad.addColorStop(1, '#7C705F');
  ctx.fillStyle = grad;
  rRect(x, y, w, h, 4 * S); ctx.fill();

  // Brick pattern
  ctx.save();
  rRect(x, y, w, h, 4 * S);
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,50,40,0.45)';
  ctx.lineWidth = 1 * S;
  var rows = 3, cols = 2;
  var rH = h / rows, rW = w / cols;
  for (var r = 0; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * rH);
    ctx.lineTo(x + w, y + r * rH);
    ctx.stroke();
    var off = (r % 2) * (rW * 0.5);
    for (var c = 0; c < cols + 1; c++) {
      var xx = x + c * rW - off;
      if (xx > x && xx < x + w) {
        ctx.beginPath();
        ctx.moveTo(xx, y + r * rH);
        ctx.lineTo(xx, y + (r + 1) * rH);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Outline
  ctx.strokeStyle = 'rgba(40,32,24,0.55)';
  ctx.lineWidth = 1.5 * S;
  rRect(x, y, w, h, 4 * S); ctx.stroke();

  ctx.restore();
}
