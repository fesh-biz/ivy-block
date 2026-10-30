/*
 * Ivy Block — "Tetris" mode logic (no DOM).
 * Guideline-style rules: 10×20 well (+2 hidden rows), 7-bag, SRS rotation with wall kicks,
 * hold, 5-piece preview, lock delay with move resets, T-spins, back-to-back and combos.
 * Works in the browser (window.IvyTetris) and in Node (module.exports) for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IvyTetris = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 10, VISIBLE = 20, HIDDEN = 2, H = VISIBLE + HIDDEN;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']; // board value = index + 1
  const LOCK_MS = 500;      // time a grounded piece waits before locking
  const MAX_RESETS = 15;    // moves/rotations that may restart the lock timer
  const SOFT_MS = 35;       // soft drop: one row per this many ms (at most)
  const CLEAR_MS = 320;     // pause while full rows flash
  const PREVIEW = 5;
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const TSPIN_SCORE = [400, 800, 1200, 1600];

  // ---------- pieces ----------
  const BASE = {
    I: { n: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]] },
    O: { n: 4, cells: [[0, 1], [0, 2], [1, 1], [1, 2]] },
    T: { n: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
    S: { n: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    Z: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
    J: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
    L: { n: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },
  };
  // ROT[type][state] = [[dr, dc], ...]; states 0, R, 2, L (clockwise).
  const ROT = {};
  TYPES.forEach(t => {
    const b = BASE[t];
    const states = [b.cells];
    for (let i = 1; i < 4; i++) {
      states.push(t === 'O' ? b.cells : states[i - 1].map(([r, c]) => [c, b.n - 1 - r]));
    }
    ROT[t] = states;
  });

  // SRS wall kicks as [dx, dy] with y pointing UP (tetris.wiki notation).
  const KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  /** Milliseconds per row at a given level (Tetris Guideline curve). */
  function gravityMs(level) {
    const l = Math.max(1, Math.min(level, 20));
    return Math.max(0.5, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
  }

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- game ----------
  function Tetris(opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;
    this.cells = new Array(W * H).fill(0);
    this.queue = [];
    this.bag = [];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.startLevel = opts.level || 1;
    this.level = this.startLevel;
    this.combo = -1;
    this.b2b = false;
    this.status = 'playing'; // playing | over
    this.piece = null;       // { type, rot, r, c }
    this.clearing = null;    // { rows, left } while full rows flash
    this.soft = false;
    this.fallAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowest = 0;
    this.lastRotate = false;
    this.events = [];
    this.fillQueue();
    this.spawn();
  }
  const P = Tetris.prototype;

  P.fillQueue = function () {
    while (this.queue.length < PREVIEW + 2) {
      if (!this.bag.length) this.bag = shuffle(TYPES.slice(), this.rng);
      this.queue.push(this.bag.pop());
    }
  };

  P.fits = function (type, rot, r, c) {
    for (const [dr, dc] of ROT[type][rot]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) return false;
      if (this.cells[rr * W + cc]) return false;
    }
    return true;
  };

  P.pieceCells = function (p, r) {
    p = p || this.piece;
    const row = r === undefined ? p.r : r;
    return ROT[p.type][p.rot].map(([dr, dc]) => [row + dr, p.c + dc]);
  };

  P.active = function () {
    return this.status === 'playing' && !!this.piece && !this.clearing;
  };

  P.grounded = function () {
    const p = this.piece;
    return !this.fits(p.type, p.rot, p.r + 1, p.c);
  };

  P.ghostRow = function () {
    const p = this.piece;
    if (!p) return 0;
    let r = p.r;
    while (this.fits(p.type, p.rot, r + 1, p.c)) r++;
    return r;
  };

  P.spawn = function (type) {
    if (!type) { type = this.queue.shift(); this.fillQueue(); }
    const p = { type, rot: 0, r: type === 'I' ? -1 : 0, c: 3 };
    this.piece = p;
    if (!this.fits(p.type, p.rot, p.r, p.c)) { this.gameOver('block'); return false; }
    if (this.fits(p.type, p.rot, p.r + 1, p.c)) p.r++; // drop into view right away
    this.fallAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowest = p.r;
    this.lastRotate = false;
    this.events.push({ type: 'spawn', piece: type });
    return true;
  };

  // A successful move or rotation restarts the lock timer, a limited number of times.
  P.afterShift = function () {
    if (this.lockResets < MAX_RESETS) {
      if (this.lockTimer > 0 || this.grounded()) this.lockResets++;
      this.lockTimer = 0;
    }
    this.trackLowest();
  };

  P.trackLowest = function () {
    if (this.piece.r > this.lowest) {
      this.lowest = this.piece.r;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
  };

  P.move = function (dx) {
    if (!this.active()) return false;
    const p = this.piece;
    if (!this.fits(p.type, p.rot, p.r, p.c + dx)) return false;
    p.c += dx;
    this.lastRotate = false;
    this.afterShift();
    return true;
  };

  P.rotate = function (dir) {
    if (!this.active()) return false;
    const p = this.piece;
    if (p.type === 'O') return false;
    const to = (p.rot + (dir < 0 ? 3 : 1)) % 4;
    const kicks = (p.type === 'I' ? KICKS_I : KICKS)[p.rot + '>' + to];
    for (const [x, y] of kicks) {
      if (this.fits(p.type, to, p.r - y, p.c + x)) {
        p.rot = to; p.r -= y; p.c += x;
        this.lastRotate = true;
        this.afterShift();
        return true;
      }
    }
    return false;
  };

  P.stepDown = function () {
    const p = this.piece;
    if (!this.fits(p.type, p.rot, p.r + 1, p.c)) return false;
    p.r++;
    this.lastRotate = false;
    this.trackLowest();
    return true;
  };

  /** One row of soft drop triggered by a gesture (1 point per row). */
  P.softStep = function () {
    if (!this.active() || !this.stepDown()) return false;
    this.score += 1;
    this.fallAcc = 0;
    return true;
  };

  P.hardDrop = function () {
    if (!this.active()) return -1;
    const from = this.pieceCells();
    let n = 0;
    while (this.stepDown()) n++;
    this.score += 2 * n;
    this.events.push({ type: 'hard', rows: n, from, to: this.pieceCells() });
    this.lock();
    return n;
  };

  P.holdPiece = function () {
    if (!this.active() || !this.canHold) return false;
    const cur = this.piece.type;
    const prev = this.hold;
    this.hold = cur;
    this.canHold = false;
    this.events.push({ type: 'hold', piece: cur });
    this.spawn(prev || undefined);
    return true;
  };

  P.tick = function (ms) {
    if (this.status !== 'playing') return;
    if (this.clearing) {
      this.clearing.left -= ms;
      if (this.clearing.left <= 0) this.finishClear();
      return;
    }
    if (!this.piece) return;
    const g = gravityMs(this.level);
    const interval = this.soft ? Math.min(g, SOFT_MS) : g;
    this.fallAcc += ms;
    while (this.fallAcc >= interval) {
      this.fallAcc -= interval;
      if (this.stepDown()) { if (this.soft) this.score += 1; }
      else { this.fallAcc = 0; break; }
    }
    if (this.grounded()) {
      this.lockTimer += ms;
      if (this.lockTimer >= LOCK_MS || this.lockResets >= MAX_RESETS) this.lock();
    } else {
      this.lockTimer = 0;
    }
  };

  // Corners around the T's centre that are walls or blocks (3+ after a rotation = T-spin).
  P.tCorners = function (p) {
    let n = 0;
    const cr = p.r + 1, cc = p.c + 1;
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const r = cr + a, c = cc + b;
      if (r < 0 || r >= H || c < 0 || c >= W || this.cells[r * W + c]) n++;
    }
    return n;
  };

  P.lock = function () {
    const p = this.piece;
    const cells = this.pieceCells(p);
    const color = TYPES.indexOf(p.type) + 1;
    const tspin = p.type === 'T' && this.lastRotate && this.tCorners(p) >= 3;
    cells.forEach(([r, c]) => { this.cells[r * W + c] = color; });
    this.piece = null;
    this.canHold = true;
    this.events.push({ type: 'lock', piece: p.type, cells });
    if (cells.every(([r]) => r < HIDDEN)) { this.gameOver('lock'); return; }

    const rows = [];
    for (let r = 0; r < H; r++) {
      let full = true;
      for (let c = 0; c < W; c++) if (!this.cells[r * W + c]) { full = false; break; }
      if (full) rows.push(r);
    }
    const n = rows.length;
    let base = tspin ? TSPIN_SCORE[n] : LINE_SCORE[n];
    let b2b = false;
    if (n > 0) {
      const difficult = n === 4 || tspin;
      if (difficult && this.b2b) { base = Math.floor(base * 1.5); b2b = true; }
      this.b2b = difficult;
      this.combo++;
    } else {
      this.combo = -1;
    }
    let points = base * this.level;
    if (n > 0 && this.combo > 0) points += 50 * this.combo * this.level;
    this.score += points;
    if (n > 0 || tspin) {
      this.events.push({ type: 'clear', rows, n, tspin, b2b, combo: n > 0 ? this.combo : 0, points });
    }
    if (n > 0) this.clearing = { rows, left: CLEAR_MS };
    else this.spawn();
  };

  P.finishClear = function () {
    const rows = this.clearing.rows;
    this.clearing = null;
    const out = new Array(rows.length * W).fill(0);
    for (let r = 0; r < H; r++) {
      if (rows.indexOf(r) < 0) for (let c = 0; c < W; c++) out.push(this.cells[r * W + c]);
    }
    this.cells = out;
    const before = this.level;
    this.lines += rows.length;
    this.level = this.startLevel + Math.floor(this.lines / 10);
    if (this.level > before) this.events.push({ type: 'level', level: this.level });
    this.spawn();
  };

  P.gameOver = function (reason) {
    this.status = 'over';
    this.overReason = reason;
    this.events.push({ type: 'over', reason });
  };

  P.drainEvents = function () {
    const e = this.events;
    this.events = [];
    return e;
  };

  const SAVED_KEYS = ['cells', 'queue', 'bag', 'hold', 'canHold', 'score', 'lines', 'startLevel', 'level',
    'combo', 'b2b', 'status', 'piece', 'clearing', 'lockResets', 'lowest', 'lastRotate'];

  P.serialize = function () {
    const d = { v: 1 };
    SAVED_KEYS.forEach(k => { d[k] = this[k]; });
    return JSON.stringify(d);
  };

  Tetris.deserialize = function (json, rng) {
    let d;
    try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return null; }
    if (!d || d.v !== 1 || !Array.isArray(d.cells) || d.cells.length !== W * H) return null;
    const g = Object.create(P);
    SAVED_KEYS.forEach(k => { g[k] = d[k]; });
    g.rng = rng || Math.random;
    g.soft = false;
    g.fallAcc = 0;
    g.lockTimer = 0;
    g.events = [];
    g.fillQueue();
    if (g.status === 'playing' && !g.piece && !g.clearing) g.spawn();
    return g;
  };

  return {
    W, H, VISIBLE, HIDDEN, TYPES, ROT, LOCK_MS, CLEAR_MS, MAX_RESETS, PREVIEW,
    gravityMs, Tetris,
  };
});
