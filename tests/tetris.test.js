// Run: node tests/tetris.test.js
const assert = require('assert');
const T = require('../app/src/main/assets/www/tetris.js');
const L = require('../app/src/main/assets/www/logic.js');
const { W, H, HIDDEN } = T;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}

const at = (r, c) => r * W + c;
function newGame(seed) { return new T.Tetris({ rng: L.mulberry32(seed || 1) }); }
function fillRow(g, r, holes) {
  for (let c = 0; c < W; c++) g.cells[at(r, c)] = holes.indexOf(c) >= 0 ? 0 : 8;
}
function setPiece(g, type, rot, r, c) {
  g.piece = { type, rot, r, c };
  g.lowest = r; g.lockResets = 0; g.lockTimer = 0; g.lastRotate = false;
}
const sorted = cells => cells.map(([r, c]) => r * 100 + c).sort((a, b) => a - b);

test('every rotation state has 4 distinct in-box cells', () => {
  T.TYPES.forEach(t => {
    T.ROT[t].forEach(state => {
      assert.strictEqual(state.length, 4);
      assert.strictEqual(new Set(state.map(([r, c]) => r * 10 + c)).size, 4);
      state.forEach(([r, c]) => assert(r >= 0 && c >= 0 && r < 4 && c < 4));
    });
  });
});

test('7-bag: each group of 7 pieces contains every tetromino once', () => {
  const g = newGame(7);
  const seq = [g.piece.type];
  for (let i = 0; i < 27; i++) { g.spawn(); seq.push(g.piece.type); }
  for (let k = 0; k < 28; k += 7) assert.strictEqual(new Set(seq.slice(k, k + 7)).size, 7, seq.join(''));
});

test('pieces spawn centred at the top and drop into view', () => {
  const g = newGame(1);
  setPiece(g, 'T', 0, 0, 0);
  g.spawn('T');
  assert.deepStrictEqual(sorted(g.pieceCells()), sorted([[1, 4], [2, 3], [2, 4], [2, 5]]));
  g.spawn('I');
  assert.deepStrictEqual(sorted(g.pieceCells()), sorted([[1, 3], [1, 4], [1, 5], [1, 6]]));
  g.spawn('O');
  assert.deepStrictEqual(sorted(g.pieceCells()), sorted([[1, 4], [1, 5], [2, 4], [2, 5]]));
});

test('walls stop movement; gravity drops one row per second at level 1', () => {
  const g = newGame(1);
  g.spawn('O');
  let moves = 0;
  while (g.move(-1)) moves++;
  assert.strictEqual(moves, 4);
  assert(!g.move(-1));
  const r = g.piece.r;
  g.tick(999); assert.strictEqual(g.piece.r, r);
  g.tick(2); assert.strictEqual(g.piece.r, r + 1);
  assert(T.gravityMs(10) < T.gravityMs(5) && T.gravityMs(5) < T.gravityMs(1));
});

test('rotation uses SRS wall kicks next to a wall', () => {
  const g = newGame(1);
  g.spawn('I');
  assert(g.rotate(1));            // vertical, column 5
  while (g.move(1)) { /* to the right wall */ }
  assert.strictEqual(Math.max(...g.pieceCells().map(([, c]) => c)), W - 1);
  assert(g.rotate(1));            // needs a kick to fit back horizontally
  assert(g.pieceCells().every(([, c]) => c >= 0 && c < W));
  assert.strictEqual(g.piece.rot, 2);
});

test('lock delay: grounded piece locks after 500 ms, moves reset it', () => {
  const g = newGame(1);
  g.spawn('O');
  while (g.stepDown()) { /* fall */ }
  const first = g.piece;
  g.tick(400);
  assert.strictEqual(g.piece, first);
  assert(g.move(1));               // resets the timer
  g.tick(400);
  assert.strictEqual(g.piece, first);
  g.tick(120);
  assert.notStrictEqual(g.piece, first);
  assert.strictEqual(g.cells.filter(Boolean).length, 4);
});

test('hard drop locks at the bottom and scores 2 per row', () => {
  const g = newGame(1);
  g.spawn('O');
  const n = g.hardDrop();
  assert.strictEqual(n, H - 3);
  assert.strictEqual(g.score, 2 * n);
  assert(g.cells[at(H - 1, 4)] && g.cells[at(H - 2, 5)]);
});

test('tetris clears 4 rows after the flash and scores 800', () => {
  const g = newGame(1);
  for (let r = H - 4; r < H; r++) fillRow(g, r, [9]);
  g.spawn('I');
  g.rotate(1);
  while (g.move(1)) { /* to the well */ }
  g.drainEvents();
  const n = g.hardDrop();
  const ev = g.drainEvents();
  const clear = ev.find(e => e.type === 'clear');
  assert(clear && clear.n === 4 && !clear.tspin);
  assert.strictEqual(g.score, 800 + 2 * n);
  assert(g.clearing);
  assert(!g.move(1), 'no input while rows flash');
  g.tick(T.CLEAR_MS + 1);
  assert(!g.clearing);
  assert.strictEqual(g.lines, 4);
  assert.strictEqual(g.cells.filter(Boolean).length, 0);
});

test('back-to-back tetris is worth 1.5x, and combos add 50 x combo', () => {
  const g = newGame(1);
  g.b2b = true; g.combo = 0;
  for (let r = H - 4; r < H; r++) fillRow(g, r, [0]);
  setPiece(g, 'I', 3, H - 4, -1);   // vertical I in column 0
  const before = g.score;
  g.lock();
  assert.strictEqual(g.score - before, 1200 + 50);
});

test('T-spin double is detected and scores 1200', () => {
  const g = newGame(1);
  fillRow(g, H - 1, [4]);
  fillRow(g, H - 2, [3, 4, 5]);
  g.cells[at(H - 3, 3)] = 8;          // overhang
  setPiece(g, 'T', 1, H - 3, 3);       // T pointing right, sitting in the slot
  assert(g.rotate(1));                 // spin into the slot pointing down
  g.drainEvents();
  g.hardDrop();
  const clear = g.drainEvents().find(e => e.type === 'clear');
  assert(clear && clear.tspin && clear.n === 2, JSON.stringify(clear));
  assert.strictEqual(g.score, 1200);
});

test('hold swaps once per piece', () => {
  const g = newGame(3);
  const a = g.piece.type, next = g.queue[0];
  assert(g.holdPiece());
  assert.strictEqual(g.hold, a);
  assert.strictEqual(g.piece.type, next);
  assert(!g.holdPiece());
  g.hardDrop();
  g.tick(T.CLEAR_MS + 1);
  const b = g.piece.type;
  assert(g.holdPiece());
  assert.strictEqual(g.piece.type, a);
  assert.strictEqual(g.hold, b);
});

test('level goes up every 10 lines', () => {
  const g = newGame(1);
  g.lines = 8;
  for (let r = H - 2; r < H; r++) fillRow(g, r, [0]);
  setPiece(g, 'I', 3, H - 4, -1);
  g.lock();
  g.tick(T.CLEAR_MS + 1);
  assert.strictEqual(g.lines, 10);
  assert.strictEqual(g.level, 2);
});

test('game over when a new piece cannot spawn', () => {
  const g = newGame(1);
  for (let r = 0; r < H; r++) fillRow(g, r, [r % W]);
  assert.strictEqual(g.spawn(), false);
  assert.strictEqual(g.status, 'over');
  assert(g.drainEvents().some(e => e.type === 'over'));
  assert.strictEqual(g.move(1), false);
});

test('serialize / deserialize keeps the game', () => {
  const g = newGame(5);
  g.move(-1); g.hardDrop(); g.holdPiece();
  const s = g.serialize();
  const h = T.Tetris.deserialize(s, L.mulberry32(9));
  assert.deepStrictEqual(h.cells, g.cells);
  assert.deepStrictEqual(h.piece, g.piece);
  assert.strictEqual(h.hold, g.hold);
  assert.deepStrictEqual(h.queue.slice(0, 5), g.queue.slice(0, 5));
  assert.strictEqual(h.score, g.score);
  assert(h.hardDrop() >= 0);
  assert.strictEqual(T.Tetris.deserialize('{bad'), null);
});

test('random play: never overlaps, always ends', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = L.mulberry32(seed * 31);
    const g = new T.Tetris({ rng: L.mulberry32(seed) });
    let steps = 0;
    while (g.status === 'playing' && steps++ < 20000) {
      const x = rng();
      if (x < 0.3) g.move(rng() < 0.5 ? -1 : 1);
      else if (x < 0.45) g.rotate(rng() < 0.5 ? -1 : 1);
      else if (x < 0.5) g.holdPiece();
      else if (x < 0.56) g.hardDrop();
      g.tick(50);
      g.drainEvents();
      if (g.piece && g.status === 'playing') g.pieceCells().forEach(([r, c]) => assert(!g.cells[at(r, c)], 'overlap'));
    }
    assert.strictEqual(g.status, 'over', 'seed ' + seed);
  }
});

console.log(`\n${passed} tests passed`);
