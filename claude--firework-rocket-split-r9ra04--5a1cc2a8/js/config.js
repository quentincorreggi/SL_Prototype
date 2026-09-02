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
// IMG_W/IMG_H — fixed 32×32 image (editor paints at this resolution).
// SAND_W/SAND_H — runtime sand grid; subdivided so each image pixel
// expands into a SAND_SUBDIV × SAND_SUBDIV block of real sand cells
// that fall via the CA independently. Resized at initGame.
var IMG_W = 32, IMG_H = 32;
var SAND_SUBDIV = 3;
var SAND_W = IMG_W * SAND_SUBDIV, SAND_H = IMG_H * SAND_SUBDIV;
var sandGrid = new Int8Array(SAND_W * SAND_H);   // color index 0..NUM_COLORS-1, or -1 for empty

// === BELT ===
var BELT_SLOTS = 5;
var BELT_SPEED = 0.007;        // slot-fractions per frame (one slot per ~2.4s at 60fps)
var beltOffset = 0;            // 0..1 — fraction of a slot scrolled left

// === BUCKETS ===
// Bucket capacity is per-color and per-level: ceil(sandOfColor / bucketsOfColor).
// `levelCapacities[ci]` is recomputed at every initGame; belt buckets get
// their own `.capacity` field at creation. There is no global capacity const.
var levelCapacities = [];
var ATTRACT_RADIUS_CELLS = 2;  // image-pixel units (scaled by SAND_SUBDIV)
var ATTRACT_PULL_FRAMES = 1;   // frames between pull cycles per bucket
var ATTRACT_BATCH = 12;        // grains pulled per cycle (debug slider)
var SAND_FRAME_INTERVAL = 2;   // run the falling-sand CA every N frames
var BUCKET_TRAIL_FRAMES = 18;  // duration of grain-to-bucket trail
var BUCKET_POP_FRAMES = 18;    // duration of pop animation
var JUMPER_FRAMES = 24;        // duration of grid→belt arc

// === GRID ===
var GRID_W = 7, GRID_H = 7;

// === STREAK FIREWORK (core meta reward, not a level piece) ===
// If the player's streak is active when a level starts, one rocket
// auto-launches, splits into FIREWORK_SHELLS shells, and each shell
// destroys one bucket plus exactly the sand that bucket was going to
// collect. See firework.js.
var streakFireworkActive = false;    // set by the meta layer / debug toggle
var FIREWORK_SHELLS = 2;             // how many smaller fireworks the rocket splits into
var FIREWORK_LAUNCH_DELAY = 40;      // frames after level start before the rocket fires
var FIREWORK_RISE_FRAMES = 42;       // rocket climb duration
var FIREWORK_SHELL_FRAMES = 34;      // shell dive duration
var FIREWORK_SHELL_STAGGER = 9;      // frames between shell impacts (double-crackle)
// Playback speed of the whole show. 1 = full speed, 0.35 = the default
// slow-mo so every stage is readable. Live-tunable from the debug panel
// ("Firework speed"); it scales the rocket, the shells, the blast rings,
// the streamers and the firework particles together.
var fireworkSpeed = 0.35;
// Row preference for targets — middle rows first, front row last, so the
// reward bites into the middle of the level and not the first moves.
var FIREWORK_ROW_PREF = [3, 4, 2, 5, 1, 6, 0];

var fireworkQueued = 0;              // frames until launch (0 = idle)
var fireworkRocket = null;           // the rising rocket
var fireworkShells = [];             // shells diving toward their buckets
var fireworkStreamers = [];          // bucket → sand-hole link lines
var fireworkBlasts = [];             // expanding flash rings
var fireworkGhosts = [];             // destroyed buckets fading out of their cell
var fireworkLabelT = 0;              // "STREAK BONUS!" label timer

// === COLOR PALETTE (sand + buckets share the palette) ===
// 12-color palette. Light/dark/glow are derived from the base hex so a
// future palette change only needs the base list.
function _hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [parseInt(hex.substr(0, 2), 16),
          parseInt(hex.substr(2, 2), 16),
          parseInt(hex.substr(4, 2), 16)];
}
function _hex2(n) {
  var v = Math.max(0, Math.min(255, Math.round(n))).toString(16);
  return v.length < 2 ? '0' + v : v;
}
function _rgbToHex(r, g, b) { return '#' + _hex2(r) + _hex2(g) + _hex2(b); }
function _mkColor(hex) {
  var rgb = _hexToRgb(hex);
  return {
    fill: hex,
    light: _rgbToHex(rgb[0] + (255 - rgb[0]) * 0.42,
                     rgb[1] + (255 - rgb[1]) * 0.42,
                     rgb[2] + (255 - rgb[2]) * 0.42),
    dark:  _rgbToHex(rgb[0] * 0.55, rgb[1] * 0.55, rgb[2] * 0.55),
    glow:  'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.5)'
  };
}
var CLR_NAMES = [
  'cyan', 'amber', 'magenta', 'white',
  'blue', 'lime', 'forest', 'pink',
  'red', 'yellow', 'violet', 'crimson'
];
var COLORS = [
  _mkColor('#00f1ff'),  // 0  cyan
  _mkColor('#ffc741'),  // 1  amber
  _mkColor('#ff4dde'),  // 2  magenta
  _mkColor('#fffef3'),  // 3  white
  _mkColor('#0066eb'),  // 4  blue
  _mkColor('#32ff36'),  // 5  lime
  _mkColor('#1e9f27'),  // 6  forest
  _mkColor('#ffc8fc'),  // 7  pink
  _mkColor('#ff453b'),  // 8  red
  _mkColor('#fffb3e'),  // 9  yellow
  _mkColor('#bb19fe'),  // 10 violet
  _mkColor('#9d0806')   // 11 crimson
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
