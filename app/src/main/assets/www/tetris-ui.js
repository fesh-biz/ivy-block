/* Ivy Block — "Tetris" screen: rendering and input.
 * Depends on tetris.js (window.IvyTetris) and game.js (window.IvyKit). */
(function () {
  'use strict';
  const T = window.IvyTetris;
  const K = window.IvyKit;
  const { W, H, HIDDEN, VISIBLE } = T;
  const { store, SFX, vibrate, ICON, ease, clamp01 } = K;
  const $ = id => document.getElementById(id);

  const KEY_SAVE = 'ivy.tetris', KEY_BEST = 'ivy.tetrisBest', KEY_HELP = 'ivy.tetrisHelp';
  const DAS = 170, ARR = 50;   // button auto-repeat: delay, then interval (ms)
  const NEXT_SHOWN = 3;

  // Board values 1..7 = I O T S Z J L.
  const ORANGE = { base: '#ff8a3d', light: '#ffb57a', dark: '#b5561c' };
  const COL = [null, K.PAL[4], K.PAL[2], K.PAL[6], K.PAL[3], K.PAL[1], K.PAL[5], ORANGE];
  const colorOf = type => T.TYPES.indexOf(type) + 1;

  const svg = body => `<svg class="icon" viewBox="0 0 24 24">${body}</svg>`;
  const ROT_PATH = '<path d="M18.6 12.4a6.6 6.6 0 11-1.9-5.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M17.6 2.8l.3 5-5 .3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const CTRL = {
    left: svg('<path d="M15 5L7.5 12 15 19z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'),
    right: svg('<path d="M9 5l7.5 7L9 19z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'),
    soft: svg('<path d="M12 4.5v13M6.5 12l5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    drop: svg('<path d="M12 3v11M7 9l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 19.5h13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    cw: svg(ROT_PATH),
    ccw: svg(`<g transform="translate(24 0) scale(-1 1)">${ROT_PATH}</g>`),
    tap: svg('<circle cx="12" cy="12" r="4.2" fill="currentColor"/><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55"/>'),
    swipe: svg('<path d="M3.5 12h17M7.5 8l-4 4 4 4M16.5 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    up: svg('<path d="M12 19.5v-13M6.5 12L12 6.5l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  };

  // ---------------------------------------------------------------- state
  const canvas = $('tcanvas');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  let game = null;
  let active = false;
  let best = store.get(KEY_BEST, 0) | 0;
  let bestAtStart = 0;
  let vw = 0, vh = 0, DPR = 1;
  let cell = 28, bx = 0, by = 0, pad = 6, lblH = 16;
  let holdBox = { x: 0, y: 0, w: 0, h: 0 };
  let nextBoxes = [];
  let particles = [], floaters = [], trails = [];
  let lockFx = null, overT = 0, holdFx = 0;
  let shownScore = 0;
  let endTimer = null;
  let last = 0;
  const holds = new Map(); // pointerId -> { k, next, el }
  let touch = null;

  const canPlay = () => active && !!game && game.status === 'playing' && !K.modalOpen();

  // ---------------------------------------------------------------- sprites & text
  const sprites = new Map();
  function sprite(color, size) {
    size = Math.max(4, Math.round(size));
    const key = color + ':' + size;
    let s = sprites.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * DPR);
    const g = s.getContext('2d');
    g.scale(DPR, DPR);
    K.paintBlock(g, COL[color] || COL[1], size, false);
    sprites.set(key, s);
    return s;
  }
  function drawBlock(x, y, size, color, alpha, scale) {
    const s = sprite(color, size);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (scale != null && scale !== 1) {
      const s2 = size * scale;
      ctx.drawImage(s, x + (size - s2) / 2, y + (size - s2) / 2, s2, s2);
    } else ctx.drawImage(s, x, y, size, size);
    ctx.globalAlpha = 1;
  }
  function rr(g, x, y, w, h, r) { K.rrPath(g, x, y, w, h, r); }
  function text(str, x, y, size, color, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y);
    if (scale) ctx.scale(scale, scale);
    ctx.font = `900 ${size}px Nunito, Roboto, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(6,20,12,.85)';
    ctx.strokeText(str, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------- layout
  function layout() {
    if (!active) return;
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    if (!vw || !vh) return;
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = bg.width = Math.round(vw * DPR);
    canvas.height = bg.height = Math.round(vh * DPR);
    const hud = $('thud'), ctrl = $('tcontrols');
    const top = hud.offsetTop + hud.offsetHeight + 6;
    const bottom = ctrl.offsetTop - 14;
    const availH = bottom - top, availW = vw - 24;
    const UNITS_H = VISIBLE + 3.05; // well + the hold/next strip above it
    cell = Math.max(8, Math.floor(Math.min(availW / 10.5, availH / UNITS_H, 46)));
    pad = Math.max(4, Math.round(cell * 0.22));
    const bw = cell * W;
    const extra = Math.max(0, availH - UNITS_H * cell);
    bx = Math.round((vw - bw) / 2);
    lblH = cell * 0.62;
    const boxH = cell * 1.7;
    const boxY = top + extra * 0.3 + lblH;
    by = Math.round(boxY + boxH + pad + cell * 0.25);
    holdBox = { x: bx - pad, y: boxY, w: cell * 2.4, h: boxH };
    const nw = cell * 2.25, gap = cell * 0.18, right = bx + bw + pad;
    nextBoxes = [];
    for (let i = 0; i < NEXT_SHOWN; i++) {
      nextBoxes.push({ x: right - (NEXT_SHOWN - i) * nw - (NEXT_SHOWN - 1 - i) * gap, y: boxY, w: nw, h: boxH });
    }
    sprites.clear();
    buildBackground();
  }
  window.addEventListener('resize', () => { if (active) layout(); });

  /** Static parts (well frame, grid, preview boxes) rendered once per layout. */
  function buildBackground() {
    const g = bg.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, vw, vh);
    const bw = cell * W, bh = cell * VISIBLE;
    g.fillStyle = 'rgba(0,0,0,.25)';
    rr(g, bx - pad, by - pad + 5, bw + 2 * pad, bh + 2 * pad, pad * 1.6); g.fill();
    g.fillStyle = '#0a1c12';
    rr(g, bx - pad, by - pad, bw + 2 * pad, bh + 2 * pad, pad * 1.6); g.fill();
    g.strokeStyle = 'rgba(126,217,87,.14)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.04)';
    for (let r = 0; r < VISIBLE; r++) {
      for (let c = 0; c < W; c++) {
        rr(g, bx + c * cell + 1, by + r * cell + 1, cell - 2, cell - 2, cell * 0.16); g.fill();
      }
    }
    const box = (b, strong) => {
      g.fillStyle = strong ? 'rgba(255,255,255,.085)' : 'rgba(255,255,255,.05)';
      rr(g, b.x, b.y, b.w, b.h, cell * 0.35); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 1;
      g.stroke();
    };
    box(holdBox, false);
    nextBoxes.forEach((b, i) => box(b, i === 0));
    g.font = `800 ${Math.round(cell * 0.4)}px Nunito, Roboto, system-ui, sans-serif`;
    g.fillStyle = '#9fb8a5';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('ЗАПАС', holdBox.x + 2, holdBox.y - lblH * 0.5);
    g.fillText('ДАЛІ', nextBoxes[0].x + 2, holdBox.y - lblH * 0.5);
  }

  // ---------------------------------------------------------------- drawing
  function drawMini(type, b, size, alpha) {
    const cells = T.ROT[type][0];
    let r0 = 9, r1 = -1, c0 = 9, c1 = -1;
    cells.forEach(([r, c]) => { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); });
    const x0 = b.x + (b.w - (c1 - c0 + 1) * size) / 2;
    const y0 = b.y + (b.h - (r1 - r0 + 1) * size) / 2;
    cells.forEach(([r, c]) => drawBlock(x0 + (c - c0) * size, y0 + (r - r0) * size, size, colorOf(type), alpha));
  }

  function drawPanels(now) {
    if (game.hold) {
      const t = clamp01((now - holdFx) / 220);
      const sc = 0.44 * cell * (holdFx ? 0.75 + 0.25 * ease.outBack(t) : 1);
      drawMini(game.hold, holdBox, sc, game.canHold ? 1 : 0.32);
    }
    for (let i = 0; i < NEXT_SHOWN; i++) {
      const type = game.queue[i];
      if (type) drawMini(type, nextBoxes[i], cell * (i === 0 ? 0.5 : 0.42), i === 0 ? 1 : 0.75);
    }
  }

  function drawWell(now) {
    const clr = game.clearing;
    const crows = clr ? new Set(clr.rows) : null;
    const ct = clr ? clamp01(1 - clr.left / T.CLEAR_MS) : 0;
    for (let r = HIDDEN; r < H; r++) {
      const y = by + (r - HIDDEN) * cell;
      const clearing = crows && crows.has(r);
      for (let c = 0; c < W; c++) {
        const v = game.cells[r * W + c];
        if (!v) continue;
        const x = bx + c * cell;
        if (clearing) {
          drawBlock(x, y, cell, v, 1 - ct * 0.5, 1 - ease.inCubic(ct) + 0.12 * Math.sin(Math.PI * Math.min(1, ct * 2)));
        } else drawBlock(x, y, cell, v, 1);
      }
      if (clearing && ct < 0.6) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - ct / 0.6)})`;
        rr(ctx, bx + 1, y + 2, cell * W - 2, cell - 4, cell * 0.2); ctx.fill();
      }
    }
    // hard-drop trails
    trails = trails.filter(t => {
      const k = (now - t.t0) / 220;
      if (k >= 1) return false;
      const p = COL[t.color] || COL[1];
      t.cols.forEach(([c, rTop, rBot]) => {
        const y0 = by + (Math.max(rTop, HIDDEN) - HIDDEN) * cell, y1 = by + (rBot - HIDDEN) * cell;
        if (y1 <= y0) return;
        const grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, p.light);
        ctx.globalAlpha = 0.35 * (1 - k);
        ctx.fillStyle = grad;
        ctx.fillRect(bx + c * cell + cell * 0.18, y0, cell * 0.64, y1 - y0);
        ctx.globalAlpha = 1;
      });
      return true;
    });
    const p = game.piece;
    if (p && game.status === 'playing' && !clr) {
      const color = colorOf(p.type);
      const gr = game.ghostRow();
      if (gr !== p.r) {
        const pal = COL[color];
        for (const [r, c] of game.pieceCells(p, gr)) {
          if (r < HIDDEN) continue;
          const x = bx + c * cell, y = by + (r - HIDDEN) * cell;
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          rr(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.2); ctx.fill();
          ctx.strokeStyle = pal.light;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1.5, cell * 0.07);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      // fade a little while the lock timer runs
      const lockK = game.lockTimer > 0 ? clamp01(game.lockTimer / T.LOCK_MS) : 0;
      for (const [r, c] of game.pieceCells(p)) {
        if (r < HIDDEN) continue;
        drawBlock(bx + c * cell, by + (r - HIDDEN) * cell, cell, color, 1 - 0.3 * lockK);
      }
    }
    if (lockFx) {
      const k = (now - lockFx.t0) / 170;
      if (k >= 1) lockFx = null;
      else {
        ctx.fillStyle = `rgba(255,255,255,${0.42 * (1 - k)})`;
        lockFx.cells.forEach(([r, c]) => {
          if (r < HIDDEN) return;
          rr(ctx, bx + c * cell + 2, by + (r - HIDDEN) * cell + 2, cell - 4, cell - 4, cell * 0.2); ctx.fill();
        });
      }
    }
    if (game.status === 'over') {
      const k = clamp01((now - overT) / 700);
      ctx.fillStyle = `rgba(6,18,11,${0.55 * k})`;
      rr(ctx, bx - pad, by - pad, cell * W + 2 * pad, cell * VISIBLE + 2 * pad, pad * 1.6); ctx.fill();
    }
  }

  function drawFx(now, dt) {
    particles = particles.filter(p => {
      p.life += dt;
      if (p.life >= p.max) return false;
      p.vy += cell * 22 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      ctx.globalAlpha = 1;
      return true;
    });
    floaters = floaters.filter(f => {
      const t = (now - f.t0) / f.dur;
      if (t < 0) return true;
      if (t >= 1) return false;
      const sc = f.big ? ease.outBack(clamp01(t * 4)) : 1;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      text(f.text, f.x, f.y - (f.big ? cell * 0.6 : cell * 1.2) * ease.outCubic(t), f.size, f.color, alpha, sc);
      return true;
    });
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(50, now - (last || now));
    last = now;
    if (!active || !game || !vw) return;
    if (canPlay()) {
      holds.forEach(h => {
        if ((h.k === 'left' || h.k === 'right') && now >= h.next) {
          game.move(h.k === 'left' ? -1 : 1);
          h.next = now + ARR;
        }
      });
      game.tick(dt);
    }
    handleEvents(game.drainEvents(), now);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.drawImage(bg, 0, 0, vw, vh);
    drawPanels(now);
    drawWell(now);
    drawFx(now, dt / 1000);
    if (shownScore !== game.score) {
      const diff = game.score - shownScore;
      shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.15));
      renderHud();
    }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- HUD
  let hudKey = '';
  function renderHud(bump) {
    if (!game) return;
    const label = `${ICON.crown}<span>${Math.max(best, game.score)}</span>`;
    const value = `<span>${shownScore}</span>`;
    const right = `<div class="k">рівень</div><div class="v">${game.level}</div><div class="k">лінії</div><div class="v sm">${game.lines}</div>`;
    const key = label + value + right;
    if (key !== hudKey) {
      hudKey = key;
      $('thud-label').innerHTML = label;
      $('thud-value').innerHTML = value;
      $('thud-right').innerHTML = right;
    }
    if (bump) {
      const el = $('thud-right');
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }

  // ---------------------------------------------------------------- game events
  function handleEvents(events, now) {
    for (const e of events) {
      if (e.type === 'hard') {
        if (e.rows > 0) {
          const cols = {};
          e.from.forEach(([r, c]) => { cols[c] = Math.min(cols[c] === undefined ? 99 : cols[c], r); });
          const bottoms = {};
          e.to.forEach(([r, c]) => { bottoms[c] = Math.min(bottoms[c] === undefined ? 99 : bottoms[c], r); });
          trails.push({ t0: now, color: game.cells[e.to[0][0] * W + e.to[0][1]] || 1, cols: Object.keys(cols).map(c => [+c, cols[c], bottoms[c]]) });
        }
        vibrate(14);
      } else if (e.type === 'lock') {
        SFX.place();
        vibrate(10);
        lockFx = { cells: e.cells, t0: now };
        persist();
        renderHud();
      } else if (e.type === 'clear') {
        onClear(e, now);
      } else if (e.type === 'level') {
        const mid = bx + (cell * W) / 2;
        floaters.push({ text: `Рівень ${e.level}`, x: mid, y: by + cell * VISIBLE * 0.3, size: cell * 0.95, color: '#7ed957', t0: now + 150, dur: 1300, big: true });
        SFX.win();
        vibrate(40);
        renderHud(true);
      } else if (e.type === 'hold') {
        holdFx = now;
        SFX.back();
      } else if (e.type === 'over') {
        onOver(now);
      } else if (e.type === 'spawn') {
        renderHud();
      }
    }
  }

  function onClear(e, now) {
    const mid = bx + (cell * W) / 2;
    const rowsY = e.rows.length
      ? by + ((e.rows[0] + e.rows[e.rows.length - 1]) / 2 - HIDDEN + 0.5) * cell
      : by + cell * VISIBLE * 0.5;
    if (e.n > 0) {
      SFX.clear(e.n, e.combo + 1);
      vibrate(20 + 10 * e.n);
      e.rows.forEach(r => {
        if (r < HIDDEN) return;
        for (let c = 0; c < W; c++) {
          const pc = COL[game.cells[r * W + c]] || COL[1];
          const x = bx + (c + 0.5) * cell, y = by + (r - HIDDEN + 0.5) * cell;
          for (let j = 0; j < 2; j++) {
            particles.push({
              x, y, vx: (Math.random() - 0.5) * cell * 7, vy: -Math.random() * cell * 6 - cell,
              s: cell * (0.12 + Math.random() * 0.12), c: j ? pc.base : pc.light, life: 0, max: 0.5 + Math.random() * 0.3,
            });
          }
        }
      });
    } else {
      SFX.pick();
    }
    const praise = e.tspin ? (e.n ? `T-спін ×${e.n}` : 'T-спін')
      : e.n === 4 ? 'Тетріс!' : e.n === 3 ? 'Чудово!' : e.n === 2 ? 'Добре!' : null;
    let y = rowsY - cell * 0.9;
    if (praise) { floaters.push({ text: praise, x: mid, y, size: cell * (e.n === 4 ? 1.15 : 0.95), color: '#ffffff', t0: now + 40, dur: 1100, big: true }); y += cell * 1.0; }
    if (e.b2b) { floaters.push({ text: 'B2B ×1.5', x: mid, y, size: cell * 0.7, color: '#7ed957', t0: now + 100, dur: 1100, big: true }); y += cell * 0.85; }
    if (e.combo >= 1) floaters.push({ text: `Комбо ×${e.combo + 1}`, x: mid, y, size: cell * 0.75, color: '#ffcf4a', t0: now + 140, dur: 1100, big: true });
    floaters.push({ text: '+' + e.points, x: mid, y: rowsY + cell * 0.2, size: cell * 0.62, color: '#ffcf4a', t0: now + 60, dur: 900 });
  }

  function onOver(now) {
    overT = now;
    releaseAll();
    SFX.over();
    vibrate(70);
    persist();
    clearTimeout(endTimer);
    endTimer = setTimeout(showOver, 1000);
  }

  // ---------------------------------------------------------------- actions
  function tryRotate(dir) { if (game.rotate(dir)) SFX.pick(); }
  function tryHold() { if (!game.holdPiece()) vibrate(6); }
  function hardDrop() { game.hardDrop(); }

  function press(k, now) {
    if (k === 'left' || k === 'right') { game.move(k === 'left' ? -1 : 1); return { k, next: now + DAS }; }
    if (k === 'soft') { game.softStep(); game.soft = true; return { k }; }
    if (k === 'drop') hardDrop();
    else if (k === 'cw') tryRotate(1);
    else if (k === 'ccw') tryRotate(-1);
    return null;
  }

  function releaseAll() {
    holds.forEach(h => h.el && h.el.classList.remove('down'));
    holds.clear();
    touch = null;
    if (game) game.soft = false;
  }

  // ---------------------------------------------------------------- persistence
  function persist() {
    if (!game) return;
    if (game.status === 'playing') store.set(KEY_SAVE, game.serialize());
    else store.del(KEY_SAVE);
    if (game.score > best) { best = game.score; store.set(KEY_BEST, best); }
  }

  // ---------------------------------------------------------------- screens & modals
  function toMenu() { K.closeModal(); K.show('menu'); }

  function start(fresh) {
    clearTimeout(endTimer);
    K.closeModal();
    let g = null;
    if (!fresh) {
      const saved = store.get(KEY_SAVE, null);
      if (saved) g = T.Tetris.deserialize(saved);
      if (g && g.status !== 'playing') g = null;
    }
    const resumed = !!g;
    if (!g) { g = new T.Tetris(); store.del(KEY_SAVE); }
    game = g;
    releaseAll();
    bestAtStart = best;
    particles = []; floaters = []; trails = [];
    lockFx = null; overT = 0; holdFx = 0;
    shownScore = g.score;
    hudKey = '';
    renderHud();
    K.show('tetris');
    if (resumed) showPause();
    else if (!store.get(KEY_HELP, false)) { store.set(KEY_HELP, true); showHelp(null, true); }
  }

  function showPause() {
    if (!game || game.status !== 'playing') return;
    releaseAll();
    persist();
    K.openModal(`
      <h3>Пауза</h3>
      <p>Рахунок: ${game.score} · Рівень ${game.level}</p>
      <div class="toggles">
        <button class="icon-btn" id="m-sound" data-act="sound" aria-label="Звук"></button>
        <button class="icon-btn" id="m-vibro" data-act="vibro" aria-label="Вібрація"></button>
        <button class="icon-btn" data-act="help" aria-label="Як грати">${ICON.help}</button>
      </div>
      <div class="modal-actions">
        ${K.btn('resume', 'Продовжити', true)}
        ${K.btn('restart', 'Почати заново')}
        ${K.btn('exit', 'У меню')}
      </div>`,
    {
      actions: {
        resume: K.closeModal,
        restart: () => start(true),
        exit: toMenu,
        sound: K.toggleSound,
        vibro: K.toggleVibro,
        help: () => showHelp(showPause),
      },
      onBack: K.closeModal,
    });
  }

  function showHelp(after, first) {
    const done = after || K.closeModal;
    K.openModal(`
      <h3>Тетріс</h3>
      <ul class="help-list">
        <li>${ICON.tetro}<span>Фігури падають згори. Заповни рядок повністю, і він зникне.</span></li>
        <li>${CTRL.tap}<span>Торкнись поля, щоб повернути фігуру.</span></li>
        <li>${CTRL.swipe}<span>Веди пальцем ліворуч або праворуч, щоб рухати її.</span></li>
        <li>${CTRL.soft}<span>Веди вниз, щоб прискорити. Різко змахни вниз, щоб скинути.</span></li>
        <li>${CTRL.up}<span>Змахни вгору або торкнись «Запас», щоб відкласти фігуру на потім.</span></li>
        <li>${ICON.gem}<span>4 рядки за раз це Тетріс. Кожні 10 ліній фігури падають швидше.</span></li>
      </ul>
      <p style="margin-top:12px">Кнопки внизу дублюють усі рухи.</p>
      <div class="modal-actions">${K.btn('ok', first ? 'Грати' : 'Зрозуміло', true)}</div>`,
    { actions: { ok: done }, onBack: done });
  }

  function showOver() {
    if (!game || !active) return;
    const rec = game.score > bestAtStart && game.score > 0;
    K.openModal(`
      <h3>Стакан заповнено</h3>
      <p>Твій рахунок</p>
      <div class="big-num">${game.score}</div>
      ${rec ? '<span class="badge">Новий рекорд!</span>' : `<p>Рекорд: ${best}</p>`}
      <p>Рівень ${game.level} · ${game.lines} ${K.plural(game.lines, 'лінія', 'лінії', 'ліній')}</p>
      <div class="modal-actions">${K.btn('again', 'Ще раз', true)}${K.btn('menu', 'У меню')}</div>`,
    { actions: { again: () => start(true), menu: toMenu }, onBack: toMenu });
  }

  // ---------------------------------------------------------------- touch gestures on the well
  function pt(e) {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  const inBox = (b, p, m) => p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m - lblH && p.y <= b.y + b.h + m;

  canvas.addEventListener('pointerdown', e => {
    if (!canPlay() || touch) return;
    const p = pt(e), now = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    touch = { id: e.pointerId, x0: p.x, y0: p.y, lx: p.x, ly: p.y, t0: now, axis: null, moved: false, hist: [{ x: p.x, y: p.y, t: now }] };
  });

  canvas.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id) return;
    const p = pt(e), now = performance.now();
    touch.hist.push({ x: p.x, y: p.y, t: now });
    while (touch.hist.length > 2 && now - touch.hist[0].t > 150) touch.hist.shift();
    if (!canPlay()) return;
    const step = cell * 0.9;
    if (!touch.axis) {
      const dx = p.x - touch.x0, dy = p.y - touch.y0;
      if (Math.hypot(dx, dy) < cell * 0.45) return;
      touch.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
      touch.lx = touch.x0; touch.ly = touch.y0;
    }
    if (touch.axis === 'h') {
      while (p.x - touch.lx >= step) { touch.lx += step; if (game.move(1)) touch.moved = true; }
      while (touch.lx - p.x >= step) { touch.lx -= step; if (game.move(-1)) touch.moved = true; }
      touch.ly = Math.min(touch.ly, p.y);
      if (p.y - touch.ly > cell * 1.5) { touch.axis = 'v'; touch.ly = p.y; }
    } else {
      while (p.y - touch.ly >= step) { touch.ly += step; if (game.softStep()) touch.moved = true; }
      if (Math.abs(p.x - touch.lx) > cell * 1.5) { touch.axis = 'h'; touch.lx = p.x; }
    }
  });

  function endTouch(e) {
    if (!touch || e.pointerId !== touch.id) return;
    const t = touch;
    touch = null;
    if (e.type !== 'pointerup' || !canPlay()) return;
    const p = pt(e), now = performance.now();
    t.hist.push({ x: p.x, y: p.y, t: now });
    const dy = p.y - t.y0;
    // Flick speed: the fastest recent segment in the swipe's direction (px per ms).
    let vy = 0;
    for (let i = 1; i < t.hist.length; i++) {
      const a = t.hist[i - 1], b = t.hist[i];
      if (now - b.t > 150) continue;
      const v = (b.y - a.y) / Math.max(8, b.t - a.t);
      if (Math.sign(v) === Math.sign(dy) && Math.abs(v) > Math.abs(vy)) vy = v;
    }
    if (!t.axis) {
      if (now - t.t0 < 350) {
        if (inBox(holdBox, p, cell * 0.3)) tryHold();
        else tryRotate(1);
      }
      return;
    }
    if (t.axis === 'v') {
      if (vy > 0.75 && dy > cell * 1.2) hardDrop();
      else if (vy < -0.6 && -dy > cell * 1.5) tryHold();
    }
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  // ---------------------------------------------------------------- on-screen buttons
  const pad6 = $('tcontrols');
  pad6.querySelectorAll('[data-k]').forEach(b => { b.innerHTML = CTRL[b.dataset.k]; });
  pad6.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    e.preventDefault();
    if (!canPlay()) return;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    b.classList.add('down');
    vibrate(5);
    const h = press(b.dataset.k, performance.now());
    holds.set(e.pointerId, Object.assign({ el: b }, h || { k: b.dataset.k }));
  });
  function releaseButton(e) {
    const h = holds.get(e.pointerId);
    if (!h) return;
    holds.delete(e.pointerId);
    h.el.classList.remove('down');
    if (h.k === 'soft' && game && ![...holds.values()].some(x => x.k === 'soft')) game.soft = false;
  }
  pad6.addEventListener('pointerup', releaseButton);
  pad6.addEventListener('pointercancel', releaseButton);
  pad6.addEventListener('lostpointercapture', releaseButton);

  // ---------------------------------------------------------------- keyboard (browser testing, Chromebooks)
  document.addEventListener('keydown', e => {
    if (!active || !game) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (!K.modalOpen()) { showPause(); e.preventDefault(); }
      return;
    }
    if (!canPlay()) return;
    const repeatable = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (e.repeat && !repeatable) { e.preventDefault(); return; }
    switch (e.key) {
      case 'ArrowLeft': game.move(-1); break;
      case 'ArrowRight': game.move(1); break;
      case 'ArrowDown': game.soft = true; break;
      case 'ArrowUp': case 'x': case 'X': tryRotate(1); break;
      case 'z': case 'Z': case 'Control': tryRotate(-1); break;
      case ' ': hardDrop(); break;
      case 'c': case 'C': case 'Shift': tryHold(); break;
      default: return;
    }
    e.preventDefault();
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'ArrowDown' && game) game.soft = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !active || !game) return;
    if (game.status === 'playing' && !K.modalOpen()) showPause();
    else persist();
  });

  setIcon($('tbtn-pause'), ICON.pause);
  function setIcon(el, s) { el.innerHTML = s; }
  $('tbtn-pause').addEventListener('click', () => {
    if (canPlay()) { SFX.tap(); showPause(); }
  });

  // ---------------------------------------------------------------- public
  window.IvyTetrisUI = {
    start,
    setActive(on) {
      if (on && !active) { active = true; last = 0; }
      else if (!on && active) {
        active = false;
        releaseAll();
        clearTimeout(endTimer);
        if (game && game.status === 'playing') persist();
      }
      if (on) requestAnimationFrame(layout);
    },
    onBack() {
      if (game && game.status === 'playing') showPause();
      else if (game && game.status === 'over') { clearTimeout(endTimer); showOver(); }
    },
  };
  window.__ivyTetris = {
    get game() { return game; },
    get geom() { return { cell, bx, by, pad, holdBox, nextBoxes }; },
    start, showPause,
  };
})();
