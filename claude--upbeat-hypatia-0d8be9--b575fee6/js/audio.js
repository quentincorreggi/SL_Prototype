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
  laserCharge: function () {
    // Rising electric charge buildup
    tone(200, 0.06, 'sawtooth', 0.05, 400);
    setTimeout(function () { tone(400, 0.08, 'sawtooth', 0.06, 800); }, 60);
    setTimeout(function () { tone(700, 0.10, 'sawtooth', 0.05, 1200); }, 130);
  },
  laserFire: function () {
    // Sharp high-energy zap
    tone(2000, 0.03, 'square', 0.15, 400);
    setTimeout(function () { tone(600, 0.18, 'sawtooth', 0.10, 80); }, 30);
    setTimeout(function () { tone(300, 0.22, 'sine',     0.07, 60); }, 55);
  },
  win:   function () {
    [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.25, 'sine', 0.12); }, i * 100);
    });
  }
};
