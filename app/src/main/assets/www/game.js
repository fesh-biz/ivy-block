/* Ivy Block — UI, rendering and input. Depends on logic.js (window.IvyLogic). */
(function () {
  'use strict';
  const L = window.IvyLogic;
  const SIZE = L.SIZE;
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, def) {
      try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const settings = Object.assign({ sound: true, vibro: true }, store.get('ivy.settings', {}));
  const saveSettings = () => store.set('ivy.settings', settings);
  let best = store.get('ivy.best', 0) | 0;
  const progress = Object.assign({ stars: {} }, store.get('ivy.progress', {}));
  const saveProgress = () => store.set('ivy.progress', progress);

  function unlockedLevel() {
    let n = 1;
    while (progress.stars[n] && n < L.LEVEL_COUNT) n++;
    return n;
  }
  function totalStars() {
    return Object.keys(progress.stars).reduce((a, k) => a + (progress.stars[k] | 0), 0);
  }

  // ---------------------------------------------------------------- icons
  const ICON = {
    pause: '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    soundOn: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    soundOff: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    vibro: '<svg class="icon" viewBox="0 0 24 24"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 8v8M19.5 8v8M2 10v4M22 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    help: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 9.2a3 3 0 115.2 2c-.9.8-2.2 1.4-2.2 2.9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.5" fill="currentColor"/></svg>',
    star: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="#ffcf4a" stroke="#c98d12" stroke-width="1" stroke-linejoin="round"/></svg>',
    starEmpty: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="rgba(255,255,255,.14)"/></svg>',
    leaf: '<svg class="icon" viewBox="-1 -1 2 2"><g transform="rotate(-30)"><path d="M0 -.85 Q.66 -.12 0 .85 Q-.66 -.12 0 -.85Z" fill="#7ed957"/><path d="M0 -.6 L0 .75" stroke="#2f7a37" stroke-width=".1" stroke-linecap="round"/></g></svg>',
    lines: '<svg class="icon" viewBox="0 0 24 24"><rect x="2.5" y="9" width="19" height="6" rx="2" fill="#4d8df7"/><rect x="9" y="2.5" width="6" height="19" rx="2" fill="#2ec4b6" opacity=".9"/></svg>',
    gem: '<svg class="icon" viewBox="0 0 24 24"><path d="M7 4h10l4.5 5.5L12 21 2.5 9.5z" fill="#ffb627"/><path d="M2.5 9.5h19M12 21L8.5 9.5 12 4l3.5 5.5z" fill="none" stroke="#c98012" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    crown: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 8l4.6 4.2L12 5l4.4 7.2L21 8l-2 11H5z" fill="#ffcf4a"/></svg>',
    lock: '<svg class="icon" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
    blocks: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2" fill="#ff6b57"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#ffb627"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#2ec4b6"/></svg>',
    piece: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="8.5" height="8.5" rx="2" fill="currentColor"/><rect x="3" y="12.5" width="8.5" height="8.5" rx="2" fill="currentColor"/><rect x="12.5" y="12.5" width="8.5" height="8.5" rx="2" fill="currentColor"/></svg>',
  };
  const GOAL_ICON = { leaves: ICON.leaf, lines: ICON.lines, score: ICON.gem };

  function goalText(goal, moves) {
    const t = goal.target;
    if (goal.type === 'leaves') return { title: `Збери ${t} ${plural(t, 'листочок', 'листочки', 'листочків')}`, sub: `за ${moves} ${plural(moves, 'фігуру', 'фігури', 'фігур')}` };
    if (goal.type === 'lines') return { title: `Очисти ${t} ${plural(t, 'лінію', 'лінії', 'ліній')}`, sub: `за ${moves} ${plural(moves, 'фігуру', 'фігури', 'фігур')}` };
    return { title: `Набери ${t} ${plural(t, 'очко', 'очки', 'очок')}`, sub: `за ${moves} ${plural(moves, 'фігуру', 'фігури', 'фігур')}` };
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------------------------------------------------------------- audio & haptics
  let actx = null;
  function audio() {
    if (!settings.sound) return null;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type, vol, slideTo) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const SFX = {
    pick() { tone(520, 0, 0.06, 'sine', 0.07, 680); },
    place() { tone(190, 0, 0.09, 'triangle', 0.22, 110); },
    back() { tone(300, 0, 0.08, 'sine', 0.05, 200); },
    clear(n, combo) {
      const base = 392 * Math.pow(2, Math.min(Math.max(combo, 1) - 1, 9) / 12);
      const steps = [0, 4, 7, 12, 16, 19];
      for (let i = 0; i < Math.min(2 + n, 6); i++) tone(base * Math.pow(2, steps[i] / 12), i * 0.055, 0.2, 'triangle', 0.13);
    },
    leaf() { tone(1318, 0, 0.12, 'sine', 0.09); tone(1760, 0.07, 0.16, 'sine', 0.07); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.32, 'triangle', 0.13)); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.26, 'triangle', 0.12)); },
    tap() { tone(660, 0, 0.04, 'sine', 0.05); },
  };
  function vibrate(ms) {
    if (!settings.vibro) return;
    try {
      if (window.AndroidBridge && window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- screens
  let screen = 'menu';
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    screen = name;
    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevels();
    if (name === 'game') requestAnimationFrame(layout);
  }

  function setIcon(el, svg) { el.innerHTML = svg; }
  function renderToggles() {
    ['btn-sound', 'm-sound'].forEach(id => { const el = $(id); if (el) { setIcon(el, settings.sound ? ICON.soundOn : ICON.soundOff); el.classList.toggle('off', !settings.sound); } });
    ['btn-vibro', 'm-vibro'].forEach(id => { const el = $(id); if (el) { setIcon(el, ICON.vibro); el.classList.toggle('off', !settings.vibro); } });
  }
  function toggleSound() { settings.sound = !settings.sound; saveSettings(); renderToggles(); SFX.tap(); }
  function toggleVibro() { settings.vibro = !settings.vibro; saveSettings(); renderToggles(); vibrate(30); }

  function renderMenu() {
    const saved = store.get('ivy.classic', null);
    $('classic-sub').textContent = (saved ? 'Продовжити · ' : '') + 'Рекорд: ' + best;
    const u = unlockedLevel();
    const done = Object.keys(progress.stars).length;
    $('challenges-sub').textContent = done >= L.LEVEL_COUNT
      ? `Усі ${L.LEVEL_COUNT} пройдено · ★ ${totalStars()}`
      : `Рівень ${u} з ${L.LEVEL_COUNT} · ★ ${totalStars()}`;
    renderToggles();
  }

  function renderLevels() {
    $('stars-total').innerHTML = ICON.star + `<span>${totalStars()} / ${L.LEVEL_COUNT * 3}</span>`;
    const u = unlockedLevel();
    const grid = $('level-grid');
    let html = '';
    for (let n = 1; n <= L.LEVEL_COUNT; n++) {
      const st = progress.stars[n] | 0;
      const locked = n > u;
      const current = n === u && !st;
      const type = L.getLevel(n).goal.type;
      let inner = `<span>${n}</span>`;
      if (locked) inner = ICON.lock;
      else inner += `<span class="mini-stars">${[1, 2, 3].map(i => (i <= st ? ICON.star : ICON.starEmpty)).join('')}</span>`;
      const kind = locked ? '' : `<span class="kind">${GOAL_ICON[type]}</span>`;
      html += `<button class="level-btn${locked ? ' locked' : ''}${current ? ' current' : ''}" data-level="${n}" ${locked ? 'disabled' : ''} aria-label="Рівень ${n}">${kind}${inner}</button>`;
    }
    grid.innerHTML = html;
    const cur = grid.querySelector(`[data-level="${u}"]`);
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 30);
  }

  // ---------------------------------------------------------------- modal
  let modal = null; // { actions, onBack }
  function btn(act, title, primary, sub) {
    return `<button class="big-btn${primary ? ' primary' : ''}" data-act="${act}"><span class="btn-title">${title}</span>${sub ? `<span class="btn-sub">${sub}</span>` : ''}</button>`;
  }
  function openModal(html, opts) {
    $('modal-card').innerHTML = html;
    $('modal').classList.remove('hidden');
    modal = opts || {};
    renderToggles();
  }
  function closeModal() {
    $('modal').classList.add('hidden');
    modal = null;
  }
  $('modal-card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || !modal || !modal.actions) return;
    const fn = modal.actions[b.dataset.act];
    if (fn) { SFX.tap(); fn(); }
  });

  function showHelp() {
    openModal(`
      <h3>Як грати</h3>
      <ul class="help-list">
        <li>${ICON.blocks}<span>Перетягуй фігури на поле 8×8.</span></li>
        <li>${ICON.lines}<span>Заповни рядок або стовпець, і він зникне.</span></li>
        <li>${ICON.gem}<span>Кілька ліній одразу або кілька ходів поспіль із лініями дають комбо й більше очок.</span></li>
        <li>${ICON.leaf}<span>У челенджах виконай мету за обмежену кількість фігур. Листочок плюща збирається, коли зникає його рядок або стовпець.</span></li>
      </ul>
      <p style="margin-top:14px">Гра закінчується, коли жодна фігура не влазить на поле.</p>
      <div class="modal-actions">${btn('ok', 'Зрозуміло', true)}</div>`,
    { actions: { ok: closeModal }, onBack: closeModal });
  }

  // ---------------------------------------------------------------- game state
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  let game = null;
  let bestAtStart = 0;
  let W = 0, H = 0, DPR = 1;
  let cell = 40, boardX = 0, boardY = 0, boardPad = 8;
  let trayX0 = 0, trayY = 0, trayH = 0, slotW = 0, trayScale = 0.5;
  const LIFT = 1.0; // dragged piece floats this many cells above the finger
  let drag = null, returning = null;
  let anims = [], particles = [], floaters = [], leafFlights = [];
  let placedFx = null;
  let trayAppearT = 0;
  let trayFit = [true, true, true];
  let shownScore = 0;
  let inputLocked = false;
  let endTimer = null;
  let lastFrame = 0;

  const PAL = {
    1: { base: '#ff6b57', light: '#ff9c80', dark: '#b8402f' },
    2: { base: '#ffb627', light: '#ffd56e', dark: '#b97b0c' },
    3: { base: '#8fcf3c', light: '#bdee78', dark: '#5a8f1c' },
    4: { base: '#22b8aa', light: '#6fe3d6', dark: '#127a70' },
    5: { base: '#4d8df7', light: '#8ab5ff', dark: '#2a5bb3' },
    6: { base: '#9b6bf2', light: '#c3a3ff', dark: '#6440b0' },
    7: { base: '#f064b4', light: '#ff9fd2', dark: '#a8357a' },
    8: { base: '#4f6a5a', light: '#6f8c7a', dark: '#2f4438' },
  };

  function startClassic(fresh) {
    clearTimeout(endTimer);
    closeModal();
    let g = null;
    if (!fresh) {
      const saved = store.get('ivy.classic', null);
      if (saved) g = L.Game.deserialize(saved);
      if (g && g.status !== 'playing') g = null;
    }
    if (!g) { g = new L.Game({ mode: 'classic' }); store.del('ivy.classic'); }
    setGame(g);
    show('game');
  }

  function startLevel(n, opts) {
    opts = opts || {};
    clearTimeout(endTimer);
    closeModal();
    let g = null;
    if (opts.resume) {
      const saved = store.get('ivy.challenge', null);
      const sg = saved && L.Game.deserialize(saved);
      if (sg && sg.levelN === n && sg.status === 'playing' && sg.moves > 0) g = sg;
    }
    const resumed = !!g;
    if (!g) { g = new L.Game({ mode: 'challenge', level: n }); store.del('ivy.challenge'); }
    setGame(g);
    show('game');
    if (!resumed) showIntro();
  }

  function setGame(g) {
    game = g;
    bestAtStart = best;
    drag = null; returning = null;
    anims = []; particles = []; floaters = []; leafFlights = [];
    placedFx = null;
    inputLocked = false;
    shownScore = g.score;
    trayAppearT = performance.now();
    updateTrayFit();
    renderHud();
  }

  function showIntro() {
    const lv = game.level;
    const gt = goalText(lv.goal, lv.moves);
    inputLocked = true;
    const hint = lv.goal.type === 'leaves'
      ? 'Листочок збирається, коли зникає його рядок або стовпець.'
      : lv.goal.type === 'lines' ? 'Рядки й стовпці рахуються окремо.' : 'Комбо дають найбільше очок.';
    openModal(`
      <h3>Рівень ${lv.n}</h3>
      <div class="goal-box">${GOAL_ICON[lv.goal.type]}<div><b>${gt.title}</b><span>${gt.sub}</span></div></div>
      <p>${hint}</p>
      <div class="modal-actions">${btn('play', 'Грати', true)}</div>`,
    {
      actions: { play: () => { closeModal(); inputLocked = false; } },
      onBack: () => { closeModal(); show('levels'); },
    });
  }

  function showPause() {
    if (!game) return;
    const isClassic = game.mode === 'classic';
    openModal(`
      <h3>Пауза</h3>
      ${isClassic ? `<p>Рахунок: ${game.score}</p>` : `<p>Рівень ${game.levelN}</p>`}
      <div class="toggles">
        <button class="icon-btn" id="m-sound" data-act="sound" aria-label="Звук"></button>
        <button class="icon-btn" id="m-vibro" data-act="vibro" aria-label="Вібрація"></button>
        <button class="icon-btn" data-act="help" aria-label="Як грати">${ICON.help}</button>
      </div>
      <div class="modal-actions">
        ${btn('resume', 'Продовжити', true)}
        ${btn('restart', 'Почати заново')}
        ${btn('exit', isClassic ? 'У меню' : 'До рівнів')}
      </div>`,
    {
      actions: {
        resume: closeModal,
        restart: () => (isClassic ? startClassic(true) : startLevel(game.levelN)),
        exit: () => { closeModal(); show(isClassic ? 'menu' : 'levels'); },
        sound: toggleSound,
        vibro: toggleVibro,
        help: () => { showHelp(); modal.onBack = showPause; modal.actions.ok = showPause; },
      },
      onBack: closeModal,
    });
  }

  function persist() {
    if (!game) return;
    const key = game.mode === 'classic' ? 'ivy.classic' : 'ivy.challenge';
    if (game.status === 'playing') store.set(key, game.serialize());
    else store.del(key);
    if (game.mode === 'classic' && game.score > best) { best = game.score; store.set('ivy.best', best); }
  }

  function onGameEnd() {
    if (!game) return;
    if (game.mode === 'classic') {
      SFX.over(); vibrate(70);
      const rec = game.score > bestAtStart && game.score > 0;
      openModal(`
        <h3>Місця немає</h3>
        <p>Твій рахунок</p>
        <div class="big-num">${game.score}</div>
        ${rec ? '<span class="badge">Новий рекорд!</span>' : `<p>Рекорд: ${best}</p>`}
        <div class="modal-actions">${btn('again', 'Ще раз', true)}${btn('menu', 'У меню')}</div>`,
      { actions: { again: () => startClassic(true), menu: () => { closeModal(); show('menu'); } }, onBack: () => { closeModal(); show('menu'); } });
      return;
    }
    const n = game.levelN;
    if (game.status === 'won') {
      SFX.win(); vibrate(40);
      const prev = progress.stars[n] | 0;
      progress.stars[n] = Math.max(prev, game.stars);
      saveProgress();
      const stars = [1, 2, 3].map(i => (i <= game.stars ? ICON.star.replace('class="icon"', `class="icon pop" style="animation-delay:${0.15 + i * 0.18}s"`) : ICON.starEmpty)).join('');
      const last = n >= L.LEVEL_COUNT;
      const left = game.movesLeft();
      openModal(`
        <h3>${last ? 'Усі челенджі пройдено!' : `Рівень ${n} пройдено!`}</h3>
        <div class="stars-row">${stars}</div>
        <p>Залишилось ${left} ${plural(left, 'фігура', 'фігури', 'фігур')}</p>
        <div class="modal-actions">
          ${last ? '' : btn('next', 'Далі', true, `Рівень ${n + 1}`)}
          ${btn('retry', 'Ще раз', last)}
          ${btn('levels', 'До рівнів')}
        </div>`,
      {
        actions: {
          next: () => startLevel(n + 1),
          retry: () => startLevel(n),
          levels: () => { closeModal(); show('levels'); },
        },
        onBack: () => { closeModal(); show('levels'); },
      });
    } else {
      SFX.over(); vibrate(70);
      const reason = game.failReason === 'moves' ? 'Фігури закінчились.' : 'Жодна фігура не влазить на поле.';
      const goal = game.level.goal;
      openModal(`
        <h3>Майже!</h3>
        <p>${reason}</p>
        <div class="goal-box">${GOAL_ICON[goal.type]}<div><b>${Math.min(game.goalProgress(), goal.target)} / ${goal.target}</b><span>${goalText(goal, game.level.moves).title}</span></div></div>
        <div class="modal-actions">${btn('retry', 'Спробувати ще', true)}${btn('levels', 'До рівнів')}</div>`,
      {
        actions: { retry: () => startLevel(n), levels: () => { closeModal(); show('levels'); } },
        onBack: () => { closeModal(); show('levels'); },
      });
    }
  }

  // ---------------------------------------------------------------- HUD
  let hudCache = '';
  function renderHud(bump) {
    if (!game) return;
    let label, value, right = '';
    if (game.mode === 'classic') {
      label = `${ICON.crown}<span>${Math.max(best, game.score)}</span>`;
      value = `<span id="hud-target">${shownScore}</span>`;
    } else {
      const g = game.level.goal;
      const prog = g.type === 'score' ? Math.min(shownScore, g.target) : Math.min(game.goalProgress(), g.target);
      label = `<span>Рівень ${game.levelN}</span>`;
      value = `<span id="hud-target">${GOAL_ICON[g.type]}</span><span>${prog}<small style="opacity:.55;font-size:.6em">/${g.target}</small></span>`;
      const left = game.movesLeft();
      right = `<div class="k">${ICON.piece}<span>фігур</span></div><div class="v${left <= 3 ? ' low' : ''}">${left}</div>`;
    }
    const key = label + value + right;
    if (key !== hudCache) {
      hudCache = key;
      $('hud-label').innerHTML = label;
      $('hud-value').innerHTML = value;
      $('hud-right').innerHTML = right;
    }
    if (bump) {
      const el = $('hud-value');
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }

  // ---------------------------------------------------------------- layout
  function layout() {
    if (screen !== 'game') return;
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    const hud = $('hud').getBoundingClientRect();
    const top = hud.bottom - rect.top + 16;
    const bottom = 20;
    const availH = H - top - bottom;
    const availW = W - 28;
    const unitsH = 8.4 + 0.7 + 3.2;
    cell = Math.floor(Math.min(availW / 8.4, availH / unitsH, 72));
    boardPad = Math.max(5, Math.round(cell * 0.2));
    const boardSize = cell * SIZE;
    const extra = Math.max(0, availH - unitsH * cell);
    boardX = Math.round((W - boardSize) / 2);
    boardY = Math.round(top + boardPad + extra * 0.3);
    trayH = cell * 3.2;
    trayY = boardY + boardSize + boardPad + cell * 0.7 + extra * 0.25;
    const trayW = Math.min(W - 12, boardSize + boardPad * 2 + cell);
    slotW = trayW / 3;
    trayX0 = (W - trayW) / 2;
    trayScale = Math.min(0.56, (slotW * 0.86) / (5 * cell));
    spriteCache.clear();
  }
  window.addEventListener('resize', () => { if (screen === 'game') layout(); });

  // ---------------------------------------------------------------- drawing helpers
  function rrPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const spriteCache = new Map();
  function blockSprite(color, size) {
    size = Math.max(4, Math.round(size));
    const key = color + ':' + size;
    let spr = spriteCache.get(key);
    if (spr) return spr;
    spr = document.createElement('canvas');
    spr.width = spr.height = Math.ceil(size * DPR);
    const g = spr.getContext('2d');
    g.scale(DPR, DPR);
    const p = PAL[color] || PAL[1];
    const m = Math.max(1, size * 0.045), r = size * 0.2, s = size - 2 * m;
    g.fillStyle = p.dark;
    rrPath(g, m, m, s, s, r); g.fill();
    const grad = g.createLinearGradient(0, m, 0, m + s);
    grad.addColorStop(0, p.light); grad.addColorStop(1, p.base);
    g.fillStyle = grad;
    rrPath(g, m, m, s, s - size * 0.09, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,.30)';
    rrPath(g, m + size * 0.14, m + size * 0.09, s - size * 0.28, size * 0.11, size * 0.055); g.fill();
    if (color === 8) { // mossy speckles on overgrown blocks
      g.fillStyle = 'rgba(126,217,87,.22)';
      [[0.28, 0.62, 0.07], [0.7, 0.4, 0.05], [0.6, 0.72, 0.06]].forEach(([fx, fy, fr]) => {
        g.beginPath(); g.arc(size * fx, size * fy, size * fr, 0, Math.PI * 2); g.fill();
      });
    }
    spriteCache.set(key, spr);
    return spr;
  }
  function drawBlock(x, y, size, color, alpha, scale) {
    const spr = blockSprite(color, size);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (scale && scale !== 1) {
      const s2 = size * scale;
      ctx.drawImage(spr, x + (size - s2) / 2, y + (size - s2) / 2, s2, s2);
    } else ctx.drawImage(spr, x, y, size, size);
    ctx.globalAlpha = 1;
  }
  function drawLeaf(cx, cy, r, rot, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.8, -r * 0.14, 0, r);
    ctx.quadraticCurveTo(-r * 0.8, -r * 0.14, 0, -r);
    ctx.fillStyle = '#7ed957';
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.strokeStyle = 'rgba(20,60,25,.55)';
    ctx.stroke();
    ctx.strokeStyle = '#2f7a37';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, r * 0.11);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.88); ctx.stroke();
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.05); ctx.lineTo(r * 0.32, -r * 0.32);
    ctx.moveTo(0, r * 0.3); ctx.lineTo(-r * 0.32, r * 0.02);
    ctx.stroke();
    ctx.restore();
  }
  function drawShape(shape, color, x, y, s, alpha) {
    for (const [r, c] of shape.cells) drawBlock(x + c * s, y + r * s, s, color, alpha);
  }
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
  const ease = {
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
  };
  const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

  // ---------------------------------------------------------------- render
  function slotCenter(i) { return { x: trayX0 + slotW * (i + 0.5), y: trayY + trayH / 2 }; }
  function trayPiecePos(i) {
    const s = game.shapeAt(i), sz = cell * trayScale, c = slotCenter(i);
    return { x: c.x - (s.w * sz) / 2, y: c.y - (s.h * sz) / 2, s: sz };
  }
  function dragScale(now) { return trayScale + (1 - trayScale) * ease.outCubic(clamp01((now - drag.t0) / 110)); }
  function dragPiecePos(now) {
    const s = game.shapeAt(drag.i), sc = cell * dragScale(now);
    return { x: drag.x - (s.w * sc) / 2, y: drag.y - s.h * sc - cell * LIFT * (sc / cell), s: sc };
  }

  function drawBoard(now) {
    const size = cell * SIZE, pad = boardPad;
    // frame
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    rrPath(ctx, boardX - pad, boardY - pad + 5, size + 2 * pad, size + 2 * pad, pad * 1.6); ctx.fill();
    ctx.fillStyle = '#0a1c12';
    rrPath(ctx, boardX - pad, boardY - pad, size + 2 * pad, size + 2 * pad, pad * 1.6); ctx.fill();
    ctx.strokeStyle = 'rgba(126,217,87,.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const hover = drag && drag.hover;
    const hl = new Set();
    let hlColor = 0;
    if (hover) {
      hlColor = game.tray[drag.i].color;
      hover.rows.forEach(r => { for (let c = 0; c < SIZE; c++) hl.add(r * SIZE + c); });
      hover.cols.forEach(c => { for (let r = 0; r < SIZE; r++) hl.add(r * SIZE + c); });
    }
    const pop = placedFx ? clamp01((now - placedFx.t0) / 180) : 1;
    const popScale = 1 + 0.14 * Math.sin(Math.PI * pop);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const k = r * SIZE + c, x = boardX + c * cell, y = boardY + r * cell;
        const v = game.board.cells[k];
        ctx.fillStyle = hl.has(k) ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.045)';
        rrPath(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.17); ctx.fill();
        if (v) {
          const scale = placedFx && pop < 1 && placedFx.set.has(k) ? popScale : 1;
          drawBlock(x, y, cell, hl.has(k) ? hlColor : v, 1, scale);
        }
        if (game.board.leaves[k]) {
          const rot = -0.55 + 0.1 * Math.sin(now / 650 + k * 1.7);
          const glow = hl.has(k);
          if (glow) {
            ctx.fillStyle = 'rgba(190,255,150,.35)';
            ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2); ctx.fill();
          }
          drawLeaf(x + cell / 2, y + cell / 2, cell * 0.34 * (glow ? 1.12 : 1), rot);
        }
      }
    }
    // ghost of the dragged piece
    if (hover) {
      const s = game.shapeAt(drag.i);
      for (const [dr, dc] of s.cells) {
        const k = (hover.r + dr) * SIZE + hover.c + dc;
        drawBlock(boardX + (hover.c + dc) * cell, boardY + (hover.r + dr) * cell, cell, hlColor, hl.has(k) ? 0.95 : 0.38);
      }
    }
  }

  function drawTray(now) {
    for (let i = 0; i < 3; i++) {
      const p = game.tray[i];
      if (!p) continue;
      if (drag && drag.i === i) continue;
      const shape = game.shapeAt(i);
      const pos = trayPiecePos(i);
      if (returning && returning.i === i) {
        const t = ease.outCubic(clamp01((now - returning.t0) / 170));
        const s = returning.s0 + (pos.s - returning.s0) * t;
        const x = returning.x0 + (pos.x - returning.x0) * t;
        const y = returning.y0 + (pos.y - returning.y0) * t;
        drawShape(shape, p.color, x, y, s, 1);
        if (t >= 1) returning = null;
        continue;
      }
      const ap = clamp01((now - trayAppearT - i * 70) / 260);
      if (ap <= 0) continue;
      const sc = ease.outBack(ap);
      const c = slotCenter(i);
      const s = pos.s * sc;
      drawShape(shape, p.color, c.x - (shape.w * s) / 2, c.y - (shape.h * s) / 2, s, trayFit[i] ? 1 : 0.28);
    }
  }

  function drawDrag(now) {
    if (!drag) return;
    const p = game.tray[drag.i];
    if (!p) return;
    const pos = dragPiecePos(now);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    drawShape(game.shapeAt(drag.i), p.color, pos.x, pos.y, pos.s, 1);
    ctx.restore();
  }

  function hudTargetPoint() {
    const el = document.getElementById('hud-target') || $('hud-value');
    const a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }

  function drawFx(now, dt) {
    // clearing cells
    anims = anims.filter(a => {
      const t = (now - a.t0) / a.dur;
      const x = boardX + (a.k % SIZE) * cell, y = boardY + Math.floor(a.k / SIZE) * cell;
      if (t < 0) { drawBlock(x, y, cell, a.color, 1); if (a.leaf) drawLeaf(x + cell / 2, y + cell / 2, cell * 0.34, -0.55); return true; }
      if (!a.spawned) {
        a.spawned = true;
        const pc = PAL[a.color] || PAL[1];
        for (let j = 0; j < 3; j++) {
          particles.push({
            x: x + cell / 2, y: y + cell / 2,
            vx: (Math.random() - 0.5) * cell * 7, vy: -Math.random() * cell * 6 - cell,
            s: cell * (0.12 + Math.random() * 0.12), c: j ? pc.base : pc.light, life: 0, max: 0.55 + Math.random() * 0.3,
          });
        }
      }
      if (t >= 1) return false;
      const sc = 1 - ease.inCubic(t);
      drawBlock(x, y, cell, a.color, 1 - t * 0.6, sc * (1 + 0.15 * Math.sin(Math.PI * Math.min(1, t * 2))));
      if (t < 0.35) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - t / 0.35)})`;
        rrPath(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.18); ctx.fill();
      }
      return true;
    });
    // particles
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
    // leaves flying to the HUD
    if (leafFlights.length) {
      const tgt = hudTargetPoint();
      leafFlights = leafFlights.filter(f => {
        const t = (now - f.t0) / f.dur;
        if (t < 0) return true;
        if (t >= 1) { SFX.leaf(); vibrate(15); renderHud(true); return false; }
        const e = ease.inCubic(t) * 0.6 + ease.outCubic(t) * 0.4;
        const cx = f.x + (tgt.x - f.x) * e;
        const cy = f.y + (tgt.y - f.y) * e - Math.sin(Math.PI * t) * cell * 2.2;
        drawLeaf(cx, cy, cell * (0.38 + 0.18 * Math.sin(Math.PI * t)), -0.55 + t * 6);
        return true;
      });
    }
    // floating texts
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
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (screen !== 'game' || !game || !W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBoard(now);
    drawTray(now);
    drawFx(now, dt);
    drawDrag(now);
    if (game.status !== 'playing' && !anims.length) {
      ctx.fillStyle = 'rgba(6,18,11,.35)';
      ctx.fillRect(boardX - boardPad, boardY - boardPad, cell * SIZE + 2 * boardPad, cell * SIZE + 2 * boardPad);
    }
    if (shownScore !== game.score) {
      const diff = game.score - shownScore;
      shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.12));
      renderHud();
    }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- input
  function pt(e) {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  function updateHover() {
    const shape = game.shapeAt(drag.i);
    const left = drag.x - (shape.w * cell) / 2;
    const top = drag.y - shape.h * cell - cell * LIFT;
    const fc = (left - boardX) / cell, fr = (top - boardY) / cell;
    const cands = [];
    for (const r of [Math.floor(fr), Math.ceil(fr)])
      for (const c of [Math.floor(fc), Math.ceil(fc)])
        cands.push({ r, c, d: Math.hypot(r - fr, c - fc) });
    cands.sort((a, b) => a.d - b.d);
    let hover = null;
    for (const cand of cands) {
      if (cand.d > 0.8) break;
      if (game.canPlace(drag.i, cand.r, cand.c)) {
        const pl = L.previewLines(game.board, shape, cand.r, cand.c);
        hover = { r: cand.r, c: cand.c, rows: pl.rows, cols: pl.cols };
        break;
      }
    }
    const prev = drag.hover;
    drag.hover = hover;
    if (hover && (!prev || prev.r !== hover.r || prev.c !== hover.c) && (hover.rows.length || hover.cols.length)) vibrate(6);
  }

  canvas.addEventListener('pointerdown', e => {
    if (!game || game.status !== 'playing' || inputLocked || drag || modal) return;
    const p = pt(e);
    if (p.y < trayY - cell * 0.5) return;
    const i = Math.floor((p.x - trayX0) / slotW);
    if (i < 0 || i > 2 || !game.tray[i]) return;
    if (returning && returning.i === i) returning = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { i, x: p.x, y: p.y, t0: performance.now(), hover: null, pid: e.pointerId };
    SFX.pick();
    vibrate(8);
    updateHover();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const p = pt(e);
    drag.x = p.x; drag.y = p.y;
    updateHover();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    const now = performance.now();
    if (d.hover && e.type === 'pointerup') {
      drag = null;
      doPlace(d.i, d.hover.r, d.hover.c);
    } else {
      const pos = dragPiecePos(now);
      drag = null;
      returning = { i: d.i, x0: pos.x, y0: pos.y, s0: pos.s, t0: now };
      SFX.back();
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function updateTrayFit() {
    trayFit = [0, 1, 2].map(i => !game.tray[i] || game.fits(i));
  }

  function doPlace(i, r, c) {
    const shape = game.shapeAt(i);
    const res = game.place(i, r, c);
    if (!res) return null;
    const now = performance.now();
    placedFx = { set: new Set(res.placed), t0: now };
    SFX.place();
    vibrate(10);
    const pcx = c + shape.w / 2, pcy = r + shape.h / 2;
    const fx = boardX + pcx * cell, fy = boardY + pcy * cell;

    if (res.nLines) {
      const leafSet = new Set(res.leaves);
      res.cleared.forEach(({ k, color }) => {
        const rr = Math.floor(k / SIZE), cc = k % SIZE;
        const delay = (Math.abs(rr + 0.5 - pcy) + Math.abs(cc + 0.5 - pcx)) * 26;
        anims.push({ k, color, t0: now + delay, dur: 340, spawned: false, leaf: leafSet.has(k) });
      });
      res.leaves.forEach((k, j) => {
        const rr = Math.floor(k / SIZE), cc = k % SIZE;
        const delay = (Math.abs(rr + 0.5 - pcy) + Math.abs(cc + 0.5 - pcx)) * 26;
        leafFlights.push({ x: boardX + (cc + 0.5) * cell, y: boardY + (rr + 0.5) * cell, t0: now + delay + j * 60, dur: 700 });
      });
      SFX.clear(res.nLines, res.combo);
      vibrate(20 + 10 * res.nLines);
      const midX = boardX + (cell * SIZE) / 2, midY = boardY + (cell * SIZE) / 2;
      const praise = res.boardCleared ? 'Чисто! +300'
        : res.nLines >= 4 ? 'Неймовірно!' : res.nLines === 3 ? 'Чудово!' : res.nLines === 2 ? 'Добре!' : null;
      if (praise) floaters.push({ text: praise, x: midX, y: midY - cell * 0.6, size: cell * 0.85, color: '#ffffff', t0: now + 60, dur: 1100, big: true });
      if (res.combo >= 2) floaters.push({ text: `Комбо ×${res.combo}`, x: midX, y: midY + (praise ? cell * 0.6 : 0), size: cell * 0.7, color: '#ffcf4a', t0: now + 120, dur: 1100, big: true });
    }
    floaters.push({ text: '+' + res.points, x: fx, y: fy, size: cell * 0.55, color: res.nLines ? '#ffcf4a' : '#f4f0dc', t0: now, dur: 800 });
    if (res.refilled) trayAppearT = now + 80;
    updateTrayFit();
    persist();
    renderHud(game.mode === 'challenge' && game.level.goal.type === 'lines' && res.nLines > 0);
    if (game.status !== 'playing') {
      inputLocked = true;
      endTimer = setTimeout(onGameEnd, game.status === 'won' ? 1000 : 1200);
    }
    return res;
  }

  // ---------------------------------------------------------------- wiring
  setIcon($('btn-help'), ICON.help);
  setIcon($('btn-levels-back'), ICON.back);
  setIcon($('btn-pause'), ICON.pause);
  $('btn-classic').addEventListener('click', () => { SFX.tap(); startClassic(false); });
  $('btn-challenges').addEventListener('click', () => { SFX.tap(); show('levels'); });
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-vibro').addEventListener('click', toggleVibro);
  $('btn-help').addEventListener('click', () => { SFX.tap(); showHelp(); });
  $('btn-levels-back').addEventListener('click', () => { SFX.tap(); show('menu'); });
  $('btn-pause').addEventListener('click', () => { if (game && game.status === 'playing' && !modal) { SFX.tap(); showPause(); } });
  $('level-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-level]');
    if (!b || b.disabled) return;
    SFX.tap();
    startLevel(+b.dataset.level, { resume: true });
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) actx.suspend(); else if (settings.sound) actx.resume();
  });

  // Android back button (called from MainActivity). Return true if handled.
  window.onAndroidBack = function () {
    if (modal) {
      if (modal.onBack) modal.onBack(); else closeModal();
      return true;
    }
    if (screen === 'game') {
      if (game && game.status === 'playing' && !inputLocked) showPause();
      return true;
    }
    if (screen === 'levels') { show('menu'); return true; }
    return false;
  };

  // Debug / test hook
  window.__ivy = {
    get game() { return game; },
    get geom() { return { cell, boardX, boardY, trayX0, trayY, trayH, slotW, trayScale, LIFT }; },
    place: doPlace, startClassic, startLevel, show, onGameEnd,
  };

  show('menu');
})();
