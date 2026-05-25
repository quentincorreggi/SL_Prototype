// ============================================================
// editor.js — Level editor
// ============================================================
//
// Owns:
//   - 7×7 grid painter (place buckets/tunnels/walls)
//   - 32×32 sand image painter (paint grains, right-click to erase)
//   - import/export level JSON
//   - "Test Play" handoff to game.js
//
// NOTE: This file is a SCAFFOLDING STUB. The first prototype branch will
// implement the editor UI. For now, the editor screen just shows the
// placeholder buttons defined in index.html.
// ============================================================

var currentLevel_editor = {
  name: 'Custom Level',
  desc: 'My custom level',
  grid: new Array(49),
  sandImage: new Array(SAND_W * SAND_H)
};

function showEditor() {
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.add('hidden');
  if (ed) ed.classList.remove('hidden');
}

function editorBack() {
  var ls = document.getElementById('level-screen');
  var ed = document.getElementById('editor-screen');
  if (ls) ls.classList.remove('hidden');
  if (ed) ed.classList.add('hidden');
}

function editorSetName(v) { currentLevel_editor.name = v; }
function editorSetDesc(v) { currentLevel_editor.desc = v; }

function editorTestPlay() {
  // TODO: hand level to game.js — implemented in first prototype.
  alert('Test Play — not yet implemented. Coming in the first prototype.');
}

function editorExportJSON() {
  // TODO: serialize currentLevel_editor — implemented in first prototype.
}

function editorImportJSON() {
  // TODO: parse pasted JSON — implemented in first prototype.
}
