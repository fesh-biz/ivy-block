// Greedy bot used to tune and sanity-check challenge levels.
const L = require('../app/src/main/assets/www/logic.js');
const { SIZE, idx } = L;

function evaluate(game, shape, r, c) {
  const cells = game.board.cells.slice();
  const leaves = game.board.leaves;
  let contact = 0;
  for (const [dr, dc] of shape.cells) cells[idx(r + dr, c + dc)] = 9;
  for (const [dr, dc] of shape.cells) {
    const rr = r + dr, cc = c + dc;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
      const nr = rr + a, nc = cc + b;
      if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) contact++;
      else if (cells[idx(nr, nc)] && cells[idx(nr, nc)] !== 9) contact++;
    });
  }
  const { rows, cols } = L.fullLines(cells);
  let leafHits = 0;
  const clear = {};
  rows.forEach(rr => { for (let cc = 0; cc < SIZE; cc++) clear[idx(rr, cc)] = 1; });
  cols.forEach(cc => { for (let rr = 0; rr < SIZE; rr++) clear[idx(rr, cc)] = 1; });
  Object.keys(clear).forEach(k => { if (leaves[k]) leafHits++; cells[k] = 0; });
  // isolated holes after the move
  let holes = 0;
  for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) {
    if (cells[idx(rr, cc)]) continue;
    let blocked = 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
      const nr = rr + a, nc = cc + b;
      if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE || cells[idx(nr, nc)]) blocked++;
    });
    if (blocked === 4) holes++;
  }
  const n = rows.length + cols.length;
  return n * 100 + leafHits * 400 + contact * 3 - holes * 40;
}

function botMove(game) {
  let best = null;
  for (let i = 0; i < 3; i++) {
    const s = game.shapeAt(i);
    if (!s) continue;
    for (let r = 0; r <= SIZE - s.h; r++) for (let c = 0; c <= SIZE - s.w; c++) {
      if (!L.canPlace(game.board, s, r, c)) continue;
      const v = evaluate(game, s, r, c) + Math.random() * 0.5;
      if (!best || v > best.v) best = { i, r, c, v };
    }
  }
  return best;
}

function play(game, maxMoves) {
  maxMoves = maxMoves || 5000;
  while (game.status === 'playing' && game.moves < maxMoves) {
    const m = botMove(game);
    if (!m) break;
    const res = game.place(m.i, m.r, m.c);
    if (!res) throw new Error('bot produced invalid move');
  }
  return game;
}

module.exports = { botMove, play };
