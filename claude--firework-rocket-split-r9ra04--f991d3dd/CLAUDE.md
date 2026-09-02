# Sand Loop — AI Prototyping Tool

> Working name: "Sand Loop". The repo is `SL_Prototype`. Rename freely when
> a final title is chosen — update this file, `landing.html`, and `index.html`'s
> `<title>` together.

## Session Behavior

When a user starts a session, greet them warmly and explain that this is the
Sand Loop prototyping environment. Ask them to describe the game mechanic
they'd like to try. If they're unsure, suggest some ideas:

- A bucket that doubles in capacity but moves through the belt at half speed
- A "magnet" bucket that pulls any color of sand, not just its own
- A sand grain type that explodes outward when extracted (chain reactions)
- A bucket that splits into two smaller buckets when it leaves the grid
- A "frozen" sand region that thaws only when an adjacent bucket finishes filling
- A tunnel that re-colors sand grains as they pass through it

Always use plain language. The user may not know programming terms.

## Quick Start for Team Members

Just describe your mechanic idea in plain language. For example:

- "Add a bucket that pulls sand twice as fast but only fits 6 grains"
- "Make sand grains fall sideways into wind currents"
- "I want a bucket type that releases its sand back into the image when tapped"

Claude will handle the rest: create a branch, write the code, push, and give
you a playable URL.

You can also use these commands:

- `/prototype` — Start a new mechanic prototype from scratch
- `/iterate` — Refine an existing prototype

## The Core Game

Sand Loop is a pixel-puzzle game with three stacked zones:

```
┌──────────────────────────────────────┐
│   32×32 SAND IMAGE                   │  ← colored pixel art, falls via physics
├──────────────────────────────────────┤
│   ←  [B] [B] [B] [B] [B]  ←  CONVEYOR │  ← 5 slots, wraps right→left
├──────────────────────────────────────┤
│   ┌─┬─┬─┬─┬─┬─┬─┐                    │
│   ├─┼─┼─┼─┼─┼─┼─┤                    │
│   ├─┼─┼─┼─┼─┼─┼─┤  7×7 LEVEL GRID    │  ← interactive puzzle
│   ├─┼─┼─┼─┼─┼─┼─┤    (buckets,       │
│   ├─┼─┼─┼─┼─┼─┼─┤     tunnels,       │
│   ├─┼─┼─┼─┼─┼─┼─┤     walls)         │
│   └─┴─┴─┴─┴─┴─┴─┘                    │
└──────────────────────────────────────┘
```

**Gameplay loop:**

1. Player taps an **active** bucket in the 7×7 grid (a bucket is active iff
   there's an open path of empty/used cells from its position upward to the
   conveyor belt).
2. The bucket flies onto the conveyor belt.
3. While on the belt, the bucket has an **attraction radius**. Each frame it
   finds the nearest matching-colored sand grain within that radius and pulls
   it along an animated trail into the bucket.
4. Sand above the extracted grain falls down via cellular automaton physics
   (down, then down-left, then down-right) to fill the gap.
5. When a bucket is full, it disappears from the belt with a satisfying pop.
6. **Goal:** collect every grain of sand by filling all buckets.

**Belt overflow:** if the player taps an active bucket but all 5 belt slots
are full, the tap is rejected with a small shake and audio cue.

## Project Architecture

### Tech Stack

- Vanilla JavaScript, HTML5 Canvas, Web Audio API
- No dependencies, no build step — runs directly in browser via `index.html`
- Initial scaffold; full implementation lands in prototype branches

### File Map

> **On this branch:** `index.html` is the single-file "Core Gameplay Prototype"
> (its own `WORLD`/`CONFIG`/`Renderer` architecture, all modules inlined as
> `<script>` blocks, tuning panel generated from `CONFIG_SCHEMA`). The streak
> firework lives in its `js/firework.js` block. The earlier multi-file
> prototype described below is kept at `prototype-v1-grid.html` and still
> loads the `js/*.js` files.

| File | Purpose |
|------|---------|
| `index.html` | Entry point, loads all JS in order, CSS + HTML |
| `js/config.js` | Global state, constants, COLORS, sand palette, bucket capacity |
| `js/registry.js` | Bucket type registration system (`registerBucketType`/`getBucketType`) |
| `js/bucket_default.js` | Default bucket — active/inactive draw, editor hooks |
| `js/bucket_hidden.js` | Hidden "?" bucket — color unknown until activated |
| `js/sand.js` | Sand image storage, falling-sand cellular automaton, color extraction |
| `js/bucket_attraction.js` | Per-frame logic: each bucket on belt pulls matching grains within radius |
| `js/belt.js` | 5-slot conveyor — wraps right→left, holds buckets, position helpers |
| `js/tunnel.js` | Tunnel mechanic — spawns into adjacent cell when activation path reaches it |
| `js/wall.js` | Wall cell — inert structural blocker |
| `js/layout.js` | Layout computation — three vertical zones (image / belt / grid) |
| `js/rendering.js` | Core drawing — sand image, belt with buckets, grid, attraction trails |
| `js/editor.js` | Level editor UI — grid painting, sand image painter, import/export JSON |
| `js/game.js` | Game loop, init, update, input handling, win check |
| `js/particles.js` | Particle effects (bursts, sand puffs) |
| `js/audio.js` | Sound effects via Web Audio API |
| `js/calibration.js` | Dev calibration panel (slider offsets) |

### Script Load Order (matters!)

Scripts load in `index.html` in this exact order. New files must go in the
correct position:

1. `config.js` — globals and constants (must be first)
2. `registry.js` — bucket type registration system
3. `bucket_*.js` — bucket type implementations (register themselves on load)
4. `calibration.js`, `audio.js`, `particles.js` — utilities
5. `layout.js` — layout computation
6. `belt.js` — belt helpers
7. `sand.js` — sand image + cellular automaton physics
8. `bucket_attraction.js` — bucket pulls matching grains
9. `tunnel.js` — tunnel mechanic
10. `wall.js` — wall mechanic
11. `rendering.js` — all drawing code
12. `editor.js` — level editor
13. `game.js` — game loop, init, boot (must be last)

**Rule: New bucket type files go AFTER `registry.js` and BEFORE `calibration.js`.**
**Rule: New mechanic files go AFTER `belt.js` and BEFORE `rendering.js`.**

### Key Patterns

#### Global State

All game state lives in global variables declared in `config.js`:

- `stock[]` — the 7×7 grid of bucket/tunnel/wall objects
- `beltSlots[]` — 5 slots on the conveyor belt; each is `null` or a bucket
- `sandGrid` — flat 32×32 array of color indices (or `-1` for empty)
- `sandFalling[]` — animation state for grains mid-fall
- `attractionTrails[]` — animated trails from grain → bucket
- `particles[]` — visual effects
- `L` — layout measurements (computed by `computeLayout()`)
- `S` — global scale factor (`H / 850`)
- `W, H` — canvas width/height
- `tick` — frame counter

#### The Registry Pattern

Bucket types register via `registerBucketType(id, definition)` in `registry.js`.
Each bucket type must implement:

```js
registerBucketType('yourtype', {
  label: 'Display Name',            // shown in editor toolbar
  editorColor: '#hexcolor',         // button color in editor
  drawActive: function(ctx, x, y, w, h, ci, S, tick, idlePhase) { ... },
  drawInactive: function(ctx, x, y, w, h, ci, S, tick) { ... },
  drawOnBelt: function(ctx, x, y, w, h, ci, S, fill, capacity, tick) { ... },
  editorCellStyle: function(ci) { return { background: '...', borderColor: '...' }; },
  editorCellHTML: function(ci) { return '<span>...</span>'; }
});
```

Parameters:

- `ci` = color index (maps to the sand palette in `COLORS`)
- `S` = scale factor
- `fill` = current grains in bucket, `capacity` = max grains
- `tick` = global frame counter

#### Game Flow

1. Player sees the 32×32 sand image, the 5-slot belt, and the 7×7 grid of
   buckets (some active, some inactive, some hidden).
2. Tap an **active** bucket → it flies onto the next free belt slot.
3. Belt carries the bucket right → wraps to the left → repeats.
4. Each frame, the bucket pulls the nearest matching-color grain within its
   attraction radius; an animated trail flies from grain to bucket.
5. Removed grains leave holes — sand above falls via cellular automaton
   (down → down-left → down-right) to settle into the gap.
6. When a bucket is full, it pops off the belt.
7. Collect every grain → win.

#### How a Bucket Tap Works

`handleTap()` in `game.js` → checks `isBucketTappable(i)`:

1. Bucket is active (path-to-belt is open) AND there's a free belt slot.
2. If yes: bucket flies onto the next free slot (animated jump).
3. The grid cell becomes `used=true`.
4. `updateBucketActivation()` re-evaluates every cell's active state — a bucket
   is active iff there is a path of passable cells (empty slots, used-up
   buckets, or tunnels) from its position upward to the top edge of the grid
   (where the grid meets the belt). Walls and other active/inactive buckets
   block the path. Tunnels are pass-through regardless of contents. Buckets
   whose path just opened become active.

#### Level Data Format

Levels are created via the level editor and played via "Test Play". Each level has:

- `grid[]` (49 cells, 7×7) — each cell is:
  - `null` — empty slot
  - `{ ci: 0-N, type: 'default'|'hidden' }` — bucket
  - `{ tunnel: true, dir: 'top'|'bottom'|'left'|'right', contents: [{ci, type}...] }` — tunnel
  - `{ wall: true }` — wall
- `sandImage[]` (1024 cells, 32×32) — array of color indices (`-1` = empty)
- `name`, `desc` — display metadata

## How to Add a New Bucket Type

1. Create `js/bucket_<name>.js`
2. Call `registerBucketType('<name>', { ... })` with all required methods
3. Add `<script src="js/bucket_<name>.js"></script>` to `index.html` AFTER
   the other `bucket_*.js` and BEFORE `calibration.js`
4. If the bucket needs special game logic, add hooks in `game.js`
5. If the bucket needs custom state on stock objects, initialize it in
   `initGame()` where stock objects are created
6. The registry auto-adds new types to the editor toolbar

## How to Add an Entirely New Mechanic

For mechanics beyond bucket types (new sand behaviors, belt modifiers,
grid effects):

1. Create a new JS file (e.g., `js/yourmechanic.js`)
2. Add the `<script>` tag in `index.html` AFTER `belt.js` and BEFORE `rendering.js`
3. Hook into the game loop: add update logic in `game.js` `update()` function
4. Hook into rendering: add draw calls in `game.js` `frame()` or extend `rendering.js`
5. Hook into input if needed: extend `handleTap()` in `game.js`
6. Add any new global state variables to `config.js`

## Coding Conventions

- Vanilla JS only. No frameworks, no npm, no modules, no classes.
- All functions and variables are global (no module system).
- Use `var` (not `let`/`const`) to match existing code style.
- Canvas drawing uses the global `ctx` and scale factor `S`.
- Colors reference `COLORS[ci]` which has `.fill`, `.light`, `.dark`, `.glow`.
- Animations use timer fields on objects (e.g., `popT`, `shakeT`) that count
  down each frame.
- Use `function` declarations, not arrow functions.

## Core Defaults (tunable in `config.js`)

- **Sand image:** 32×32 grid
- **Sand palette:** 7 colors max (indices 0-6), index `-1` = empty
- **Belt slots:** 5
- **Belt direction:** right → left (slots exiting right re-enter on left)
- **Belt speed:** one slot-width per ~1.5 seconds
- **Bucket attraction radius:** 8 sand-cells (~¼ image width)
- **Attraction pull rate:** 1 grain every 6 frames (~10/sec at 60fps)
- **Sand physics:** full cellular automaton — each frame, every grain tries
  down, then down-left, then down-right

## Bucket capacity rule (important)

Bucket capacity is **not a constant** — it's derived per-color per-level:

```
capacity[ci] = ceil(totalSandOfColor[ci] / totalBucketsOfColor[ci])
```

Total bucket capacity therefore always matches (or slightly exceeds, via the
ceiling) the sand of that color. Buckets stored inside tunnels count toward
the bucket total for their color.

Constraints enforced by the editor:

- Every color present in the sand image must have at least one bucket placed
  somewhere (grid or tunnel contents). Test Play is blocked otherwise.
- The bucket-grid toolbar only offers colors that appear in the sand image —
  paint sand first, then choose bucket colors.

Runtime safety net (in `game.js`): if a color's sand is exhausted while a
bucket of that color still sits on the belt, the bucket is auto-popped (the
last bucket of a color naturally fills partially when totals don't divide
evenly).

Capacities are computed once at `initGame` time and stored in the global
`levelCapacities[ci]`. Each belt-bucket carries its own `.capacity` field
copied from this array at creation, so prototypes can override per-bucket.

## Prototyping Workflow

### For Claude: Step-by-step process

1. Understand the mechanic the user wants to prototype
2. Align on the design: present a plain-language design brief covering how
   the mechanic works, how the player interacts with it, what it looks/sounds
   like, and how it appears in the level editor. Propose concrete defaults
   and let the user confirm or adjust before coding. (See `/prototype` command
   for the detailed prompt.)
3. Create a branch: `git checkout main && git checkout -b prototype/<slug>`
4. Implement the mechanic following the patterns above
5. Validate syntax: run `node --check` on each modified/new JS file
6. Commit all changes with a descriptive message
7. Push: `git push -u origin prototype/<slug>`
8. Construct the GitHub Pages preview URL (see below)
9. Share the URL with the user
10. Tell the user to open the Level Editor, place buckets using the new
    mechanic, paint a sand image, and hit "Test Play" to try it out

### Getting the Preview URL

Each push is auto-deployed to GitHub Pages via a GitHub Actions workflow.
The URL includes the short commit SHA so it is always unique — no caching issues.

**URL pattern:**
`https://quentincorreggi.github.io/SL_Prototype/<branch-name>--<short-sha>/`

Branch names containing slashes are converted: `/` becomes `--`.
Get the short SHA with: `git rev-parse --short=8 HEAD`

**IMPORTANT:** The SHA MUST be exactly 8 characters. Using 7 characters (the
git default) will produce a 404. Always use `--short=8` — never omit the
length argument.

Examples:

- `prototype/magnet-bucket` at commit `abc12345` → `https://quentincorreggi.github.io/SL_Prototype/prototype--magnet-bucket--abc12345/`
- `claude/my-feature-abc123` at commit `deadbeef` → `https://quentincorreggi.github.io/SL_Prototype/claude--my-feature-abc123--deadbeef/`

After pushing, the deploy takes 30-60 seconds. You can construct the URL
immediately without waiting.

Each new push to a branch **replaces** the previous versioned folder, so only
the latest deployment is kept on gh-pages per branch.

**IMPORTANT:** Always replace `/` with `--` in branch names when constructing
the URL.

### Prototype Library Landing Page

All prototypes are automatically listed on the landing page at:

`https://quentincorreggi.github.io/SL_Prototype/`

The landing page reads a `manifest.json` (auto-generated by the deploy
workflow) and displays clickable cards for each prototype. Users can browse
and search all available prototypes from this page.

All branches (except `main`) will appear on the landing page.

### Safety Rules

- **NEVER** commit directly to `main`
- Each prototype is isolated on its own branch
- Keep prototypes self-contained (don't depend on other prototype branches)
- The game must remain playable — always verify `index.html` loads without errors

### Alignment Phase

Before coding any prototype or iteration, confirm alignment with the user on
four dimensions:

1. **Design** — Core rules, behavior, edge cases, interactions with existing
   mechanics (sand physics, tunnels, walls, hidden buckets)
2. **Interaction** — How the player triggers or uses the feature (tap, timing,
   sequence, etc.)
3. **Visuals & Feedback** — Colors, shapes, animations, particles, sound
   effects
4. **Level Editor** — Toolbar appearance, configuration options, placement
   behavior

Always propose specific defaults rather than asking open-ended questions.
The user should be able to approve with a single "go for it" response. Keep
the language plain and non-technical.
