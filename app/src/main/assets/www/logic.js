/*
 * Ivy Block — core game logic (no DOM).
 * Works in the browser (window.IvyLogic) and in Node (module.exports) for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IvyLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 8;
  const COLORS = 7;   // piece colors 1..7
  const STONE = 8;    // pre-placed "overgrown" block in challenge levels
  const COMBO_GRACE = 3; // placements without a clear before the combo resets
  const BOARD_CLEAR_BONUS = 300;

  // ---------- random ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- shapes ----------
  function parseShape(rows) {
    const cells = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') cells.push([r, c]);
    });
    return { cells, h: rows.length, w: Math.max.apply(null, rows.map(x => x.length)) };
  }

  // [id, weight, rows]
  const SHAPE_TABLE = [
    ['dot', 2.5, ['#']],
    ['i2h', 4, ['##']], ['i2v', 4, ['#', '#']],
    ['i3h', 4, ['###']], ['i3v', 4, ['#', '#', '#']],
    ['i4h', 3, ['####']], ['i4v', 3, ['#', '#', '#', '#']],
    ['i5h', 2, ['#####']], ['i5v', 2, ['#', '#', '#', '#', '#']],
    ['o2', 5, ['##', '##']],
    ['o3', 2, ['###', '###', '###']],
    ['r23', 2, ['###', '###']], ['r32', 2, ['##', '##', '##']],
    ['v3a', 3, ['#.', '##']], ['v3b', 3, ['.#', '##']], ['v3c', 3, ['##', '#.']], ['v3d', 3, ['##', '.#']],
    ['v5a', 1.5, ['#..', '#..', '###']], ['v5b', 1.5, ['..#', '..#', '###']],
    ['v5c', 1.5, ['###', '#..', '#..']], ['v5d', 1.5, ['###', '..#', '..#']],
    ['l4a', 1.5, ['#.', '#.', '##']], ['l4b', 1.5, ['.#', '.#', '##']],
    ['l4c', 1.5, ['##', '#.', '#.']], ['l4d', 1.5, ['##', '.#', '.#']],
    ['l4e', 1.5, ['###', '#..']], ['l4f', 1.5, ['###', '..#']],
    ['l4g', 1.5, ['#..', '###']], ['l4h', 1.5, ['..#', '###']],
    ['t4a', 2, ['###', '.#.']], ['t4b', 2, ['.#.', '###']],
    ['t4c', 2, ['#.', '##', '#.']], ['t4d', 2, ['.#', '##', '.#']],
    ['s4a', 1.5, ['.##', '##.']], ['s4b', 1.5, ['##.', '.##']],
    ['s4c', 1.5, ['#.', '##', '.#']], ['s4d', 1.5, ['.#', '##', '#.']],
  ];
  const SHAPES = SHAPE_TABLE.map(([id, weight, rows]) => Object.assign({ id, weight }, parseShape(rows)));
  const SHAPE_BY_ID = {};
  SHAPES.forEach(s => { SHAPE_BY_ID[s.id] = s; });
  const TOTAL_WEIGHT = SHAPES.reduce((a, s) => a + s.weight, 0);
  const SMALL_SHAPES = ['dot', 'i2h', 'i2v', 'v3a', 'v3b', 'v3c', 'v3d', 'i3h', 'i3v'];

  function randomShape(rng) {
    let x = rng() * TOTAL_WEIGHT;
    for (const s of SHAPES) { x -= s.weight; if (x <= 0) return s; }
    return SHAPES[SHAPES.length - 1];
  }

  // ---------- board ----------
  const idx = (r, c) => r * SIZE + c;

  function emptyBoard() {
    return { cells: new Array(SIZE * SIZE).fill(0), leaves: new Array(SIZE * SIZE).fill(0) };
  }
  function cloneBoard(b) {
    return { cells: b.cells.slice(), leaves: b.leaves.slice() };
  }

  function canPlace(board, shape, r, c) {
    if (r < 0 || c < 0 || r + shape.h > SIZE || c + shape.w > SIZE) return false;
    for (const [dr, dc] of shape.cells) if (board.cells[idx(r + dr, c + dc)]) return false;
    return true;
  }

  function fitsAnywhere(board, shape) {
    for (let r = 0; r <= SIZE - shape.h; r++)
      for (let c = 0; c <= SIZE - shape.w; c++)
        if (canPlace(board, shape, r, c)) return true;
    return false;
  }

  function fullLines(cells) {
    const rows = [], cols = [];
    for (let r = 0; r < SIZE; r++) {
      let full = true;
      for (let c = 0; c < SIZE; c++) if (!cells[idx(r, c)]) { full = false; break; }
      if (full) rows.push(r);
    }
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) if (!cells[idx(r, c)]) { full = false; break; }
      if (full) cols.push(c);
    }
    return { rows, cols };
  }

  /** Lines that would be completed if `shape` were dropped at (r, c). */
  function previewLines(board, shape, r, c) {
    const cells = board.cells.slice();
    for (const [dr, dc] of shape.cells) cells[idx(r + dr, c + dc)] = 1;
    return fullLines(cells);
  }

  function lineScore(n) { return 10 * n * (n + 1) / 2; }

  // ---------- piece generation ----------
  function generateTrio(board, rng, attempts) {
    attempts = attempts || 15;
    let best = null, bestFit = -1;
    for (let a = 0; a < attempts; a++) {
      const trio = [randomShape(rng), randomShape(rng), randomShape(rng)];
      const fit = trio.filter(s => fitsAnywhere(board, s)).length;
      if (fit === 3) return trio;
      if (fit > bestFit) { best = trio; bestFit = fit; }
    }
    if (bestFit === 0) {
      // Never hand out a set where nothing can be played.
      const small = SMALL_SHAPES.map(id => SHAPE_BY_ID[id]).filter(s => fitsAnywhere(board, s));
      best[0] = small.length ? small[Math.floor(rng() * small.length)] : SHAPE_BY_ID.dot;
    }
    return best;
  }

  // ---------- challenge levels ----------
  const LEVEL_COUNT = 50;
  // Piece limits per level (index = level - 1), tuned with tests/simulate.js.
  let MOVES_TABLE = [];
  let VARIANT_TABLE = [];

  function levelType(n) {
    if (n === 1) return 'leaves';
    if (n === 2) return 'lines';
    if (n === 3) return 'score';
    return ['leaves', 'lines', 'leaves', 'score'][n % 4];
  }

  const BLOB_SHAPES = ['dot', 'i2h', 'i2v', 'i3h', 'i3v', 'o2', 'v3a', 'v3b', 'v3c', 'v3d', 'i4h', 'i4v', 't4a', 't4c', 'l4a', 'l4e'];

  /** Symmetric layout of "overgrown" blocks built from small piece shapes. */
  function makeLayout(rng, blobs, leafCount) {
    const b = emptyBoard();
    const sym = rng() < 0.6 ? 'h' : rng() < 0.6 ? 'v' : 'hv';
    const set = (r, c, v) => {
      b.cells[idx(r, c)] = v;
      if (sym === 'h' || sym === 'hv') b.cells[idx(r, SIZE - 1 - c)] = v;
      if (sym === 'v' || sym === 'hv') b.cells[idx(SIZE - 1 - r, c)] = v;
      if (sym === 'hv') b.cells[idx(SIZE - 1 - r, SIZE - 1 - c)] = v;
    };
    const stones = () => b.cells.reduce((acc, v, k) => (v ? acc.concat(k) : acc), []);
    let guard = 0, placedBlobs = 0;
    while ((placedBlobs < blobs || stones().length < leafCount) && guard++ < 300) {
      const s = SHAPE_BY_ID[BLOB_SHAPES[Math.floor(rng() * BLOB_SHAPES.length)]];
      const r = Math.floor(rng() * (SIZE - s.h + 1));
      const c = Math.floor(rng() * (SIZE - s.w + 1));
      if (!canPlace(b, s, r, c)) continue;
      for (const [dr, dc] of s.cells) set(r + dr, c + dc, STONE);
      placedBlobs++;
    }
    // No line may start out complete.
    for (let pass = 0; pass < 30; pass++) {
      const { rows, cols } = fullLines(b.cells);
      if (!rows.length && !cols.length) break;
      rows.forEach(r => set(r, Math.floor(rng() * SIZE), 0));
      cols.forEach(c => set(Math.floor(rng() * SIZE), c, 0));
    }
    // Leaves: spread over different rows/columns where possible.
    const pool = stones();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const usedR = {}, usedC = {};
    const picked = [];
    for (const k of pool) {
      if (picked.length >= leafCount) break;
      const r = Math.floor(k / SIZE), c = k % SIZE;
      if (usedR[r] && usedC[c]) continue;
      picked.push(k); usedR[r] = 1; usedC[c] = 1;
    }
    for (const k of pool) {
      if (picked.length >= leafCount) break;
      if (picked.indexOf(k) < 0) picked.push(k);
    }
    picked.forEach(k => { b.leaves[k] = 1; });
    return b;
  }

  function getLevel(n, variant) {
    n = Math.max(1, Math.min(LEVEL_COUNT, n | 0));
    if (variant === undefined) variant = VARIANT_TABLE[n - 1] || 0;
    const rng = mulberry32(0x1ee7 + n * 7919 + variant * 104729);
    const d = n - 1;
    const type = levelType(n);
    let blobs, target, leafCount = 0;
    if (type === 'leaves') {
      leafCount = Math.min(3 + Math.floor(d / 3), 12);
      blobs = Math.min(1 + Math.floor(d / 8), 4);
      target = leafCount;
    } else if (type === 'lines') {
      blobs = Math.min(1 + Math.floor(d / 10), 4);
      target = 4 + Math.floor(d * 0.45);
    } else {
      blobs = Math.min(Math.floor(d / 10), 3);
      target = Math.round((250 + d * 40) / 50) * 50;
    }
    const board = makeLayout(rng, blobs, leafCount);
    const moves = MOVES_TABLE[n - 1] || defaultMoves(type, target, d);
    return { n, variant, goal: { type, target }, moves, board };
  }

  function defaultMoves(type, target, d) {
    const slack = Math.max(1.15, 1.6 - d * 0.01);
    const est = type === 'leaves' ? target * 2.2 + 4 : type === 'lines' ? target * 2.4 + 2 : target / 10;
    return Math.ceil(est * slack);
  }

  function starsFor(level, movesUsed) {
    const left = level.moves - movesUsed;
    const frac = left / level.moves;
    if (frac >= 0.3) return 3;
    if (frac >= 0.12) return 2;
    return 1;
  }

  // ---------- game ----------
  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'classic';
    this.rng = opts.rng || Math.random;
    this.board = emptyBoard();
    this.tray = [null, null, null];
    this.score = 0;
    this.combo = 0;
    this.sinceClear = 0;
    this.moves = 0;
    this.lines = 0;
    this.leavesCollected = 0;
    this.leavesTotal = 0;
    this.status = 'playing'; // playing | over | won | failed
    this.failReason = null;
    this.stars = 0;
    this.level = null;
    this.levelN = 0;
    if (this.mode === 'challenge') {
      this.levelN = opts.level || 1;
      this.level = opts.levelData || getLevel(this.levelN);
      this.board = cloneBoard(this.level.board);
      this.leavesTotal = this.board.leaves.reduce((a, v) => a + v, 0);
    }
    this.refill();
  }

  Game.prototype.trioAttempts = function () {
    if (this.mode === 'challenge') return 15;
    return Math.max(3, 15 - Math.floor(this.score / 400));
  };

  Game.prototype.refill = function () {
    const trio = generateTrio(this.board, this.rng, this.trioAttempts());
    this.tray = trio.map(s => ({ shape: s.id, color: 1 + Math.floor(this.rng() * COLORS) }));
  };

  Game.prototype.shapeAt = function (i) {
    return this.tray[i] ? SHAPE_BY_ID[this.tray[i].shape] : null;
  };

  Game.prototype.canPlace = function (i, r, c) {
    const s = this.shapeAt(i);
    return !!s && this.status === 'playing' && canPlace(this.board, s, r, c);
  };

  Game.prototype.fits = function (i) {
    const s = this.shapeAt(i);
    return !!s && fitsAnywhere(this.board, s);
  };

  Game.prototype.goalProgress = function () {
    if (!this.level) return 0;
    const t = this.level.goal.type;
    return t === 'leaves' ? this.leavesCollected : t === 'lines' ? this.lines : this.score;
  };

  Game.prototype.movesLeft = function () {
    return this.level ? Math.max(0, this.level.moves - this.moves) : Infinity;
  };

  Game.prototype.place = function (i, r, c) {
    if (this.status !== 'playing') return null;
    const p = this.tray[i];
    if (!p) return null;
    const shape = SHAPE_BY_ID[p.shape];
    if (!canPlace(this.board, shape, r, c)) return null;

    const placed = [];
    for (const [dr, dc] of shape.cells) {
      const k = idx(r + dr, c + dc);
      this.board.cells[k] = p.color;
      placed.push(k);
    }
    this.tray[i] = null;
    this.moves++;

    const { rows, cols } = fullLines(this.board.cells);
    const clearSet = {};
    rows.forEach(rr => { for (let cc = 0; cc < SIZE; cc++) clearSet[idx(rr, cc)] = 1; });
    cols.forEach(cc => { for (let rr = 0; rr < SIZE; rr++) clearSet[idx(rr, cc)] = 1; });
    const cleared = [], leaves = [];
    Object.keys(clearSet).forEach(key => {
      const k = +key;
      cleared.push({ k, color: this.board.cells[k] });
      if (this.board.leaves[k]) { leaves.push(k); this.board.leaves[k] = 0; }
      this.board.cells[k] = 0;
    });

    const nLines = rows.length + cols.length;
    let points = shape.cells.length;
    let combo = 0;
    if (nLines > 0) {
      this.combo++;
      this.sinceClear = 0;
      combo = this.combo;
      points += lineScore(nLines) * this.combo;
    } else {
      this.sinceClear++;
      if (this.sinceClear >= COMBO_GRACE) this.combo = 0;
    }
    let boardCleared = false;
    if (nLines > 0 && this.board.cells.every(v => !v)) {
      boardCleared = true;
      points += BOARD_CLEAR_BONUS;
    }
    this.score += points;
    this.lines += nLines;
    this.leavesCollected += leaves.length;

    let refilled = false;
    if (this.tray.every(t => !t)) { this.refill(); refilled = true; }
    this.checkEnd();

    return {
      placed, color: p.color, shape: shape.id, r, c,
      rows, cols, cleared, leaves, nLines, points, combo, boardCleared, refilled,
      status: this.status,
    };
  };

  Game.prototype.checkEnd = function () {
    if (this.mode === 'challenge') {
      if (this.goalProgress() >= this.level.goal.target) {
        this.status = 'won';
        this.stars = starsFor(this.level, this.moves);
        return;
      }
      if (this.moves >= this.level.moves) {
        this.status = 'failed';
        this.failReason = 'moves';
        return;
      }
    }
    const anyFits = this.tray.some(t => t && fitsAnywhere(this.board, SHAPE_BY_ID[t.shape]));
    if (!anyFits) {
      if (this.mode === 'challenge') { this.status = 'failed'; this.failReason = 'stuck'; }
      else this.status = 'over';
    }
  };

  Game.prototype.serialize = function () {
    return JSON.stringify({
      v: 1, mode: this.mode, levelN: this.levelN, board: this.board, tray: this.tray,
      score: this.score, combo: this.combo, sinceClear: this.sinceClear, moves: this.moves,
      lines: this.lines, leavesCollected: this.leavesCollected, leavesTotal: this.leavesTotal,
      status: this.status, failReason: this.failReason, stars: this.stars,
    });
  };

  Game.deserialize = function (json, rng) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || d.v !== 1) return null;
    const g = Object.create(Game.prototype);
    Object.assign(g, d);
    delete g.v;
    g.rng = rng || Math.random;
    g.level = g.mode === 'challenge' ? getLevel(g.levelN) : null;
    if (!g.board || !g.board.cells || g.board.cells.length !== SIZE * SIZE) return null;
    return g;
  };

  function setLevelTables(moves, variants) {
    MOVES_TABLE = (moves || []).slice();
    VARIANT_TABLE = (variants || []).slice();
  }

  // Tuned with `node tests/simulate.js 60 --tune`. Index = level - 1.
  setLevelTables(
    /* moves    */ [29,22,44,35,27,10,54,26,31,31,56,40,35,44,69,29,40,38,73,37,44,37,77,39,44,28,85,35,50,34,82,34,52,29,91,29,56,32,89,37,55,36,102,27,58,30,99,27,64,30],
    /* variants */ [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,2,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0]
  );

  return {
    SIZE, COLORS, STONE, LEVEL_COUNT, SHAPES, SHAPE_BY_ID,
    mulberry32, emptyBoard, cloneBoard, canPlace, fitsAnywhere, fullLines, previewLines,
    lineScore, generateTrio, getLevel, starsFor, setLevelTables, Game, idx,
  };
});
