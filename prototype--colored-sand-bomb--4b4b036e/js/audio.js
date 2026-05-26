// ============================================================
// audio.js — Sound effects via Web Audio API
// ============================================================

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function tone(freq, dur, type, vol, ramp) {
  ensureAudio();
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (ramp) o.frequency.exponentialRampToValueAtTime(ramp, t + dur);
  g.gain.setValueAtTime(vol || 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur);
}

var sfx = {
  pop:   function () { tone(800, 0.12, 'sine', 0.13, 300); },
  drop:  function () { tone(400, 0.08, 'sine', 0.04, 200); },
  pull:  function () { tone(600, 0.05, 'triangle', 0.04, 900); },
  reject:function () { tone(180, 0.10, 'square', 0.06, 110); },
  // Low whump as the bomb launches off the grid
  bombLaunch:    function () { tone(220, 0.18, 'sine',     0.10, 90); },
  // Brighter pop / thump on detonation (a quick two-layer hit)
  bombDetonate:  function () {
    tone(140, 0.28, 'sawtooth', 0.10, 50);
    tone(540, 0.14, 'triangle', 0.12, 180);
  },
  win:   function () {
    [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.25, 'sine', 0.12); }, i * 100);
    });
  }
};
