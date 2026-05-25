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

// Hook a slider to a top-level numeric global (read by name from window).
function hookGlobalSlider(id, globalName, onChange) {
  var el = document.getElementById(id);
  var valEl = document.getElementById(id + '-v');
  if (!el) return;
  // Initialize slider to current global value.
  var cur = window[globalName];
  if (cur != null) {
    el.value = cur;
    if (valEl) valEl.textContent = cur;
  }
  el.addEventListener('input', function () {
    var v = parseFloat(el.value);
    window[globalName] = v;
    if (valEl) valEl.textContent = el.value;
    if (typeof onChange === 'function') onChange(v);
  });
}

(function bindDebugSliders() {
  hookGlobalSlider('cal-radius',  'ATTRACT_RADIUS_CELLS');
  hookGlobalSlider('cal-pull',    'ATTRACT_PULL_FRAMES');
  hookGlobalSlider('cal-batch',   'ATTRACT_BATCH');
  // Subdivision slider — display as "N×N" and refresh the editor's
  // capacity totals (each pixel becomes N² grains).
  var subEl = document.getElementById('cal-subdiv');
  var subVal = document.getElementById('cal-subdiv-v');
  if (subEl) {
    var cur = SAND_SUBDIV || 1;
    subEl.value = cur;
    if (subVal) subVal.textContent = cur + '×' + cur;
    subEl.addEventListener('input', function () {
      var v = parseInt(subEl.value, 10) || 1;
      SAND_SUBDIV = v;
      if (subVal) subVal.textContent = v + '×' + v;
      if (typeof edRefreshLiveSections === 'function') edRefreshLiveSections();
    });
  }
})();
