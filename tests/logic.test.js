// Run: node tests/logic.test.js
const assert = require('assert');
const L = require('../app/src/main/assets/www/logic.js');
const { play } = require('./bot');
const { SIZE, idx } = L;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}

function gameWithTray(shapes, opts) {
  const g = new L.Game(Object.assign({ mode: 'classic', rng: L.mulberry32(1) }, opts));
  g.tray = shapes.map(id => ({ shape: id, color: 1 }));
  return g;
}

test('shapes are well-formed', () => {
  const ids = new Set();
  L.SHAPES.forEach(s => {
    assert(!ids.has(s.id), 'duplicate ' + s.id); ids.add(s.id);
    assert(s.cells.length > 0 && s.weight > 0);
    s.cells.forEach(([r, c]) => assert(r < s.h && c < s.w));
  });
});

test('placement bounds and collisions', () => {
  const b = L.emptyBoard();
  const s = L.SHAPE_BY_ID.i3h;
  assert(L.canPlace(b, s, 0, 0));
  assert(L.canPlace(b, s, 7, 5));
  assert(!L.canPlace(b, s, 7, 6));
  assert(!L.canPlace(b, s, -1, 0));
  b.cells[idx(0, 1)] = 3;
  assert(!L.canPlace(b, s, 0, 0));
});

test('completing a row clears it and scores', () => {
  const g = gameWithTray(['i4h', 'i4h', 'dot']);
  let res = g.place(0, 0, 0);
  assert.strictEqual(res.nLines, 0);
  assert.strictEqual(res.points, 4);
  res = g.place(1, 0, 4);
  assert.deepStrictEqual(res.rows, [0]);
  assert.strictEqual(res.nLines, 1);
  assert(res.boardCleared);
  assert.strictEqual(res.points, 4 + 10 + 300);
  assert.strictEqual(g.score, 4 + 14 + 300);
  for (let c = 0; c < SIZE; c++) assert.strictEqual(g.board.cells[idx(0, c)], 0);
});

test('row + column cleared together', () => {
  const g = gameWithTray(['dot', 'dot', 'dot']);
  for (let c = 1; c < SIZE; c++) g.board.cells[idx(0, c)] = 2;
  for (let r = 1; r < SIZE; r++) g.board.cells[idx(r, 0)] = 2;
  g.board.cells[idx(5, 5)] = 4;
  const res = g.place(0, 0, 0);
  assert.strictEqual(res.nLines, 2);
  assert.strictEqual(res.cleared.length, 15);
  assert.strictEqual(res.points, 1 + 30);
  assert(!res.boardCleared);
});

test('combo multiplies line score and survives short gaps', () => {
  const g = gameWithTray(['dot', 'dot', 'dot']);
  const fillRow = r => { for (let c = 1; c < SIZE; c++) g.board.cells[idx(r, c)] = 2; };
  g.board.cells[idx(7, 7)] = 5; // keep board from being empty
  fillRow(0);
  assert.strictEqual(g.place(0, 0, 0).combo, 1);
  fillRow(1);
  const r2 = g.place(1, 1, 0);
  assert.strictEqual(r2.combo, 2);
  assert.strictEqual(r2.points, 1 + 10 * 2);
  g.tray = [{ shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }];
  g.place(0, 5, 5); g.place(1, 5, 6); // two misses keep combo
  fillRow(2);
  assert.strictEqual(g.place(2, 2, 0).combo, 3);
  g.tray = [{ shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }];
  g.place(0, 6, 1); g.place(1, 6, 2); g.place(2, 6, 3); // three misses reset
  assert.strictEqual(g.combo, 0);
});

test('tray refills after three pieces', () => {
  const g = gameWithTray(['dot', 'dot', 'dot']);
  g.place(0, 3, 3); g.place(1, 4, 4);
  assert(!g.place(1, 5, 5), 'used slot cannot be placed again');
  const res = g.place(2, 5, 5);
  assert(res.refilled);
  assert(g.tray.every(t => t));
});

test('game over when nothing fits', () => {
  const g = gameWithTray(['dot', 'o3', 'o3']);
  // checkerboard of holes: a dot fits, a 3x3 never does
  for (let k = 0; k < SIZE * SIZE; k++) g.board.cells[k] = ((Math.floor(k / SIZE) + k % SIZE) % 2) ? 1 : 0;
  assert(g.fits(0) && !g.fits(1));
  const res = g.place(0, 0, 0);
  assert(res && res.nLines === 0);
  assert.strictEqual(g.status, 'over');
});

test('levels: valid layouts, leaves on blocks, no full lines', () => {
  for (let n = 1; n <= L.LEVEL_COUNT; n++) {
    const lv = L.getLevel(n);
    const { rows, cols } = L.fullLines(lv.board.cells);
    assert.strictEqual(rows.length + cols.length, 0, 'level ' + n + ' starts with a full line');
    let leaves = 0;
    lv.board.leaves.forEach((v, k) => { if (v) { leaves++; assert(lv.board.cells[k], 'leaf on empty cell'); } });
    if (lv.goal.type === 'leaves') assert.strictEqual(leaves, lv.goal.target, 'level ' + n + ' leaf count');
    else assert.strictEqual(leaves, 0);
    assert(lv.moves >= 10, 'level ' + n + ' moves');
    assert.deepStrictEqual(L.getLevel(n).board, lv.board, 'deterministic');
  }
});

test('collecting all leaves wins the level', () => {
  const g = new L.Game({ mode: 'challenge', level: 1, rng: L.mulberry32(5) });
  assert.strictEqual(g.leavesTotal, 3);
  for (let i = 0; i < 20 && g.status === 'playing'; i++) {
    // cheat: clear a row containing a leaf with a dot
    const k = g.board.leaves.indexOf(1);
    const r = Math.floor(k / SIZE);
    for (let c = 0; c < SIZE; c++) if (!g.board.cells[idx(r, c)]) g.board.cells[idx(r, c)] = 3;
    const c0 = g.board.cells.findIndex((v, j) => Math.floor(j / SIZE) === r && j !== k && g.board.cells[j] === 3);
    g.board.cells[c0] = 0;
    g.tray[0] = { shape: 'dot', color: 1 };
    const res = g.place(0, r, c0 % SIZE);
    assert(res.leaves.length >= 1);
  }
  assert.strictEqual(g.status, 'won');
  assert(g.stars >= 1 && g.stars <= 3);
});

test('running out of pieces fails the level', () => {
  const lv = Object.assign({}, L.getLevel(2), { moves: 2 });
  const g = new L.Game({ mode: 'challenge', level: 2, levelData: lv, rng: L.mulberry32(9) });
  g.tray = [{ shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }, { shape: 'dot', color: 1 }];
  g.place(0, 0, 0); g.place(1, 0, 2);
  assert.strictEqual(g.status, 'failed');
  assert.strictEqual(g.failReason, 'moves');
});

test('trio generation always offers a playable piece', () => {
  const rng = L.mulberry32(42);
  for (let t = 0; t < 300; t++) {
    const b = L.emptyBoard();
    for (let k = 0; k < SIZE * SIZE; k++) if (rng() < 0.6) b.cells[k] = 1;
    // break full lines
    L.fullLines(b.cells).rows.forEach(r => { b.cells[idx(r, 0)] = 0; });
    L.fullLines(b.cells).cols.forEach(c => { b.cells[idx(0, c)] = 0; });
    const trio = L.generateTrio(b, rng, 3);
    assert(trio.some(s => L.fitsAnywhere(b, s)));
  }
});

test('serialize / deserialize round-trip', () => {
  const g = play(new L.Game({ mode: 'challenge', level: 7, rng: L.mulberry32(3) }), 10);
  const g2 = L.Game.deserialize(g.serialize());
  assert.deepStrictEqual(g2.board, g.board);
  assert.deepStrictEqual(g2.tray, g.tray);
  assert.strictEqual(g2.score, g.score);
  assert.strictEqual(g2.level.n, 7);
  assert.strictEqual(L.Game.deserialize('{"v":0}'), null);
});

test('bot plays full classic games without errors', () => {
  for (let i = 0; i < 5; i++) {
    const g = play(new L.Game({ mode: 'classic', rng: L.mulberry32(100 + i) }), 400);
    assert(g.moves > 0 && g.score > 0);
  }
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ' (with failures)' : ''));
