// ============================================================
// calibration.js — Calibration panel sliders
// ============================================================
//
// Defensive: every getElementById is guarded so the page works even if
// the calibration UI hasn't been built yet. The first prototype branch
// will add the actual sliders in index.html and wire them here.
// ============================================================

var calVisible = false;

function toggleCal() {
  var panel = document.getElementById('cal-panel');
  if (!panel) return;
  calVisible = !calVisible;
  panel.style.display = calVisible ? 'block' : 'none';
}

(function bindCalToggle() {
  var btn = document.getElementById('cal-toggle');
  if (btn) btn.addEventListener('click', toggleCal);
})();

function hookCal(id, obj, key, factor) {
  var el = document.getElementById(id);
  var valEl = document.getElementById(id + '-v');
  if (!el) return;
  el.addEventListener('input', function () {
    obj[key] = parseFloat(el.value) * factor;
    if (valEl) valEl.textContent = el.value;
    if (typeof computeLayout === 'function') computeLayout();
  });
}

// Future: bind sliders for cal.image, cal.belt, cal.grid here.
