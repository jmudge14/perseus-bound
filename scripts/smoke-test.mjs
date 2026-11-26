// Smoke test: plays N games with a bot that picks random legal moves, and checks that
// nothing crashes, no chosen action is rejected, resources stay in bounds, and share
// links round-trip. Exits with code 1 on any failure (CI-friendly).
//
//   node scripts/smoke-test.mjs           # 10 games (default)
//   node scripts/smoke-test.mjs 500       # more thorough
//   npm test                              # same as the default

import { act, newGame, travelOptions, fleeOptions, canScan, maxBorrow, canAfford } from '../src/game/engine.js';
import { ELEMENTS, MAINTENANCE, ENGINE_PARTS, SHIP_KEYS, MAX_ELEMENT } from '../src/game/constants.js';
import { encodeState, decodeState, SHARE_VERSION } from '../src/game/share.js';

const GAMES = Math.max(1, parseInt(process.argv[2] || process.env.SMOKE_GAMES || '10', 10) || 10);
const MAX_STEPS_PER_GAME = 5000;

const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Pick n Elements from cargo to give away (optionally excluding Uranium), or null if impossible. */
function give(s, n, noU) {
  const g = {};
  let left = n;
  for (const k of ELEMENTS) {
    if (noU && k === 'U') continue;
    const take = Math.min(s.cargo[k], left);
    if (take) {
      g[k] = take;
      left -= take;
    }
  }
  return left === 0 ? g : null;
}

function chooseAction(s) {
  switch (s.phase) {
    case 'roll':
      return { type: 'ROLL_TURN' };
    case 'travel': {
      const opts = travelOptions(s, s.t.maxTravel).filter((o) => o.affordable);
      const o = opts.find((x) => x.planet) || pick(opts);
      return { type: 'TRAVEL', x: o.x, y: o.y };
    }
    case 'scan':
      return canScan(s) && Math.random() < 0.5 ? { type: 'SCAN' } : { type: 'SKIP_SCAN' };
    case 'enemies':
      return { type: 'MOVE_ENEMIES' };
    case 'battle': {
      const B = s.battle;
      if (B.stage === 'choose') {
        return s.res.fuel >= 3 && Math.random() < 0.3
          ? { type: 'BATTLE_FLEE' }
          : { type: 'BATTLE_FIGHT', shields: Math.floor(Math.random() * (Math.min(5, s.res.power) + 1)) };
      }
      if (B.stage === 'fleeDir') {
        const o = pick(fleeOptions(s));
        return { type: 'BATTLE_FLEE_MOVE', x: o.x, y: o.y };
      }
      if (B.stage === 'loot') return { type: 'BATTLE_LOOT' };
      if (B.stage === 'lootChoice') {
        return Math.random() < 0.5
          ? { type: 'BATTLE_LOOT_CHOOSE', kind: 'element' }
          : { type: 'BATTLE_LOOT_CHOOSE', kind: 'ship', key: pick(SHIP_KEYS) };
      }
      break;
    }
    case 'contact':
      return { type: 'CONTACT' };
    case 'trade': {
      const T = s.trade;
      if (T.stage === 'gather7') return { type: 'TRADE_GATHER7', picks: { C: 1, O2: 1, H2: 1 } };
      if (T.stage === 'cuti') {
        if (T.success && !T.resolved) {
          const g = give(s, 2, false);
          return g ? { type: 'TRADE_CUTI_ACCEPT', give: g, get: pick(['Cu', 'Ti']) } : { type: 'TRADE_CUTI_DECLINE' };
        }
        return T.attempt < 2 ? { type: 'TRADE_CUTI_ROLL' } : { type: 'TRADE_FINISH' };
      }
      if (T.stage === 'uranium') {
        if (T.success && !T.resolved) {
          const g = give(s, 4, true);
          return g ? { type: 'TRADE_U_ACCEPT', give: g } : { type: 'TRADE_FINISH' };
        }
        return { type: 'TRADE_FINISH' };
      }
      const r = Math.random();
      if (s.debt === 0 && r < 0.15) {
        const g = give(s, 2, false);
        if (g) return { type: 'TRADE_CHO', give: g, get: { O2: 2 } };
      }
      if (s.debt === 0 && r < 0.3) return { type: 'TRADE_CUTI_ROLL' };
      if (s.debt === 0 && r < 0.4) return { type: 'TRADE_U_ROLL' };
      if (r < 0.5 && maxBorrow(s, 'O2') > 0) return { type: 'TRADE_BORROW', element: 'O2', n: 1 };
      return { type: 'TRADE_GATHER' };
    }
    case 'maintenance': {
      const part = ENGINE_PARTS.find((p) => !s.engine[p.id] && canAfford(s, p.cost));
      if (part) return { type: 'REPAIR', id: part.id };
      const ops = MAINTENANCE.filter((m) => canAfford(s, m.cost));
      return ops.length && Math.random() < 0.7 ? { type: 'MAINTAIN', id: pick(ops).id } : { type: 'END_TURN' };
    }
    default:
      break;
  }
  throw new Error(`No action available in phase "${s.phase}"`);
}

function checkInvariants(s) {
  for (const k of SHIP_KEYS) {
    if (s.res[k] < 0 || s.res[k] > s.limits[k]) throw new Error(`${k} out of range: ${s.res[k]}`);
  }
  for (const k of ELEMENTS) {
    if (s.cargo[k] < 0 || s.cargo[k] > MAX_ELEMENT) throw new Error(`cargo ${k} out of range: ${s.cargo[k]}`);
  }
  if (s.debt < 0 || (s.status === 'playing' && s.debt > 6)) throw new Error(`debt out of range: ${s.debt}`);
}

const results = { won: 0, lost: 0, unfinished: 0 };
let actions = 0;
let shareChecks = 0;
let failures = 0;
const started = Date.now();

for (let g = 1; g <= GAMES; g++) {
  const difficulty = g % 2 ? 'standard' : 'challenge';
  let s = newGame(difficulty);
  try {
    for (let i = 0; i < MAX_STEPS_PER_GAME && s.status === 'playing'; i++) {
      const a = chooseAction(s);
      const next = act(s, a);
      if (next === s) {
        const sub = s.battle?.stage || s.trade?.stage || '';
        throw new Error(`Action rejected: ${JSON.stringify(a)} in phase ${s.phase}${sub ? '/' + sub : ''}`);
      }
      s = next;
      actions++;
      checkInvariants(s);
      if (s.status === 'playing' && i % 7 === 0) {
        const d = decodeState(encodeState(s));
        if (d.error) throw new Error(`Share round-trip failed in phase ${s.phase}: ${d.error}`);
        if (JSON.stringify(d.state.t.steps) !== JSON.stringify(s.t.steps || {})) {
          throw new Error(`Share round-trip lost the turn steps in phase ${s.phase}`);
        }
        const tail = s.log.filter((e) => e.turn >= s.turn - 4).slice(-80).map((e) => e.text);
        const back = d.state.log.slice(0, -1).map((e) => e.text); // last entry is the "resumed" note
        if (JSON.stringify(tail) !== JSON.stringify(back)) throw new Error('Share round-trip lost log entries');
        shareChecks++;
      }
    }
    if (s.status !== 'playing') {
      // Finished games must share and load back with the same result.
      const d = decodeState(encodeState(s));
      if (d.error) throw new Error(`Finished-game share failed (${s.status}): ${d.error}`);
      if (d.state.status !== s.status || d.state.endReason !== s.endReason || d.state.turn !== s.turn) {
        throw new Error('Finished-game share did not keep the result');
      }
      shareChecks++;
    }
    results[s.status === 'playing' ? 'unfinished' : s.status]++;
    if (GAMES <= 20) {
      console.log(`  game ${String(g).padStart(2)} (${difficulty.padEnd(9)}): ${s.status.padEnd(7)} turn ${s.turn}`);
    }
  } catch (e) {
    failures++;
    console.error(`  game ${g} (${difficulty}) FAILED on turn ${s.turn}: ${e.stack || e}`);
  }
}

// Share-link version gate and damage detection.
const code = encodeState(newGame('standard'));
const older = code.replace(/^\d+\./, `${SHARE_VERSION - 1}.`);
const damaged = code.slice(0, -3);
if (!decodeState(older).error) {
  failures++;
  console.error('  FAILED: an older-version share link was accepted');
}
if (!decodeState(damaged).error) {
  failures++;
  console.error('  FAILED: a damaged share link was accepted');
}

console.log(
  `\nSmoke test: ${GAMES} games, ${actions} actions, ${shareChecks} share round-trips in ${Date.now() - started} ms` +
    ` — won ${results.won}, lost ${results.lost}, unfinished ${results.unfinished}.`
);
if (failures) {
  console.error(`${failures} failure(s).`);
  process.exit(1);
}
console.log('All checks passed.');
