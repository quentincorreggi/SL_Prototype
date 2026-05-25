// ============================================================
// config.js — Global state, constants, colors
// ============================================================
// Sand Loop — three vertical zones:
//   1. 32×32 sand image (top)
//   2. 5-slot wrapping conveyor belt (middle)
//   3. 7×7 grid of buckets/tunnels/walls (bottom)
// ============================================================

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, S = 1;
var L = {};
var tick = 0;
var hoverIdx = -1;
var won = false;
var gameActive = false;
var audioCtx = null;

// === LEVEL SYSTEM ===
var currentLevel = null;
var LEVELS = [];

// === GAME OBJECTS ===
var stock = [];                // 7×7 grid: bucket | tunnel | wall | null
var beltSlots = [];            // 5 slots on the belt; each null or a bucket-on-belt
var jumpers = [];              // buckets animating grid → belt
var particles = [];            // visual effects
var attractionTrails = [];     // animated grain → bucket trails
var belowReveals = [];         // hidden-bucket reveal animations (on belt landing)

// === SAND IMAGE ===
var SAND_W = 32, SAND_H = 32;
var sandGrid = new Int8Array(SAND_W * SAND_H);   // color index 0..NUM_COLORS-1, or -1 for empty

// === BELT ===
var BELT_SLOTS = 5;
var BELT_SPEED = 0.011;        // slot-fractions per frame (one slot per ~1.5s at 60fps)
var beltOffset = 0;            // 0..1 — fraction of a slot scrolled left

// === BUCKETS ===
var BUCKET_CAPACITY = 12;
var ATTRACT_RADIUS_CELLS = 8;  // sand-cell units
var ATTRACT_PULL_FRAMES = 6;   // pull one grain every N frames per bucket
var BUCKET_TRAIL_FRAMES = 18;  // duration of grain-to-bucket trail
var BUCKET_POP_FRAMES = 18;    // duration of pop animation
var JUMPER_FRAMES = 24;        // duration of grid→belt arc

// === GRID ===
var GRID_W = 7, GRID_H = 7;

// === COLOR PALETTE (sand + buckets share the palette) ===
var CLR_NAMES = ['pink', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal'];
var COLORS = [
  { fill: '#FF4E8C', light: '#FF85B5', dark: '#C73068', glow: 'rgba(255,78,140,0.5)' },
  { fill: '#4A9FFF', light: '#80C0FF', dark: '#2B6FCC', glow: 'rgba(74,159,255,0.5)' },
  { fill: '#4EE68C', light: '#82F0B2', dark: '#2DB866', glow: 'rgba(78,230,140,0.5)' },
  { fill: '#FFB545', light: '#FFD080', dark: '#CC8A1F', glow: 'rgba(255,181,69,0.5)' },
  { fill: '#A66DD4', light: '#C89CF2', dark: '#7B4FA8', glow: 'rgba(166,109,212,0.5)' },
  { fill: '#FF7F50', light: '#FFA885', dark: '#CC5A30', glow: 'rgba(255,127,80,0.5)' },
  { fill: '#4ECDC4', light: '#7EDDD6', dark: '#35A89F', glow: 'rgba(78,205,196,0.5)' }
];
var NUM_COLORS = COLORS.length;

// === CALIBRATION (placeholders; sliders may bind later) ===
var cal = {
  image:  { dx: 0, dy: 0, s: 1.0 },
  belt:   { dx: 0, dy: 0, sw: 1.0, sh: 1.0 },
  grid:   { dx: 0, dy: 0, s: 1.0 }
};

// === BELT-OVERFLOW SHAKE (feedback when user taps with no free slot) ===
var rejectShake = { idx: -1, t: 0 };

// === HELPERS ===
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = ~~(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

function sandIdx(x, y) { return y * SAND_W + x; }
function gridIdx(r, c) { return r * GRID_W + c; }

(function clearSandGridOnLoad() {
  for (var i = 0; i < sandGrid.length; i++) sandGrid[i] = -1;
})();
