// Tunes / reports challenge levels using the greedy bot.
// Usage: node tests/simulate.js [runs] [--tune]
const L = require('../app/src/main/assets/www/logic.js');
const { play } = require('./bot');

const runs = +process.argv[2] || 40;
const tune = process.argv.includes('--tune');

function pct(arr, p) {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function measure(n, variant) {
  const level = Object.assign({}, L.getLevel(n, variant), { moves: 1e9 });
  const need = [];
  let stuck = 0;
  for (let i = 0; i < runs; i++) {
    const g = play(new L.Game({ mode: 'challenge', level: n, levelData: level }));
    if (g.status === 'won') need.push(g.moves); else stuck++;
  }
  return { variant, need, stuck, rate: stuck / runs };
}

const table = [], variants = [];
for (let n = 1; n <= L.LEVEL_COUNT; n++) {
  const base = L.getLevel(n);
  if (tune) {
    // Unlimited pieces: how many does the bot need? Pick a layout variant that is not a dead end.
    const cap = n <= 10 ? 0.08 : n <= 30 ? 0.18 : 0.28;
    let best = null;
    for (let v = 0; v < 8; v++) {
      const m = measure(n, v);
      if (!best || m.rate < best.rate) best = m;
      if (m.rate <= cap) { best = m; break; }
    }
    const d = n - 1;
    const slack = Math.max(1.2, 1.7 - d * 0.012);
    const moves = best.need.length ? Math.ceil(pct(best.need, 0.6) * slack) : 99;
    table.push(moves);
    variants.push(best.variant);
    console.log(`L${n} ${base.goal.type.padEnd(6)} target=${String(base.goal.target).padEnd(4)} variant=${best.variant} median=${best.need.length ? pct(best.need, 0.5) : '-'} stuck=${best.stuck}/${runs} -> moves=${moves}`);
  } else {
    let won = 0; const stars = [0, 0, 0, 0]; const reasons = {};
    for (let i = 0; i < runs; i++) {
      const g = play(new L.Game({ mode: 'challenge', level: n }));
      if (g.status === 'won') { won++; stars[g.stars]++; } else reasons[g.failReason] = (reasons[g.failReason] || 0) + 1;
    }
    console.log(`L${n} ${base.goal.type.padEnd(6)} target=${String(base.goal.target).padEnd(4)} moves=${String(base.moves).padEnd(3)} win=${Math.round(100 * won / runs)}% stars(1/2/3)=${stars.slice(1).join('/')} fails=${JSON.stringify(reasons)}`);
  }
}
if (tune) {
  console.log('\nmoves:    ' + JSON.stringify(table));
  console.log('variants: ' + JSON.stringify(variants));
}
