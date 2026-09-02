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

// Band-passed white-noise burst — the crackle/whoosh half of a firework.
function noiseBurst(dur, vol, startFreq, endFreq) {
  ensureAudio();
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  var len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = audioCtx.createBufferSource();
  src.buffer = buf;
  var bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(0.8, t);
  bp.frequency.setValueAtTime(startFreq || 1200, t);
  if (endFreq) bp.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(vol || 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
  src.start(t);
}

var sfx = {
  pop:   function () { tone(800, 0.12, 'sine', 0.13, 300); },
  drop:  function () { tone(400, 0.08, 'sine', 0.04, 200); },
  pull:  function () { tone(600, 0.05, 'triangle', 0.04, 900); },
  reject:function () { tone(180, 0.10, 'square', 0.06, 110); },
  // --- Streak firework ---
  rocket:function () {
    tone(200, 0.55, 'sawtooth', 0.045, 1100);
    noiseBurst(0.55, 0.05, 500, 3200);
  },
  split: function () {
    tone(950, 0.14, 'square', 0.07, 240);
    noiseBurst(0.20, 0.13, 2400, 700);
  },
  bang:  function () {
    noiseBurst(0.34, 0.15, 2600, 380);
    tone(150, 0.26, 'sine', 0.09, 55);
    for (var i = 0; i < 4; i++) {
      setTimeout(function () { noiseBurst(0.06, 0.05, 3000, 1400); }, 90 + i * 55);
    }
  },
  crackle:function () { noiseBurst(0.12, 0.07, 2800, 1200); },
  win:   function () {
    [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) {
      setTimeout(function () { tone(f, 0.25, 'sine', 0.12); }, i * 100);
    });
  }
};
