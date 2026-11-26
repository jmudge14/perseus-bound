// Perseus Bound rules engine.
//
// The whole game is one plain JSON-serialisable state object. `act(state, action)`
// returns a new state (the old one is never mutated), so React can treat it like a
// reducer and the game can be saved to localStorage as-is.
//
// Turn flow (phase values):
//   roll -> travel -> scan -> enemies -> battle -> contact -> trade -> maintenance -> (next turn) roll
// Steps that need no player decision (e.g. a hostile planet spawning an enemy, reducing
// planet value) are resolved automatically and written to the log.

import {
  BOARD_SIZE,
  MAX_ELEMENT,
  MAX_DEBT,
  DICE_POOL,
  ELEMENTS,
  ELEMENT_INFO,
  SHIP_INFO,
  DIFFICULTY,
  START_CARGO,
  LOOT_TABLE,
  ENGINE_PARTS,
  MAINTENANCE,
} from './constants.js';

export const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const d6 = () => 1 + Math.floor(Math.random() * 6);

const inBoard = (x, y) => x >= 1 && x <= BOARD_SIZE && y >= 1 && y <= BOARD_SIZE;

export const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const planetAt = (s, x, y) => s.planets.find((p) => p.x === x && p.y === y);
export const enemiesAt = (s, x, y) => s.enemies.filter((e) => e.x === x && e.y === y);
export const currentPlanet = (s) => planetAt(s, s.player.x, s.player.y);
const isPlayerAt = (s, x, y) => s.player.x === x && s.player.y === y;
const occupied = (s, x, y) => isPlayerAt(s, x, y) || !!planetAt(s, x, y) || enemiesAt(s, x, y).length > 0;

/** Dice of a given planet colour still in the pool (not on the board). */
export const poolCount = (s, type) =>
  DICE_POOL[type] - s.planets.filter((p) => p.type === type).length;

const el = (k) => ELEMENT_INFO[k].label;
const ship = (k) => SHIP_INFO[k].name;
const sumValues = (obj) => Object.values(obj || {}).reduce((a, b) => a + (b || 0), 0);

function log(s, text, tone = 'info') {
  s.log.push({ id: s.nextId++, turn: s.turn, text, tone });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

/**
 * Record a group of dice for the dice tray. dice: [[kind, value], ...]
 * result (optional): [{ text, c }] where c is a colour key — a ship resource (fuel, air,
 * food, hull, power), an element (C, O2, H2, Cu, Ti, U), or enemy / good / bad / neutral /
 * hostile / friendly / unknown. Returns the group so the result can be filled in later.
 */
function addRoll(s, label, dice, result) {
  const group = { label, dice: dice.map(([kind, v]) => ({ kind, v })), result: result || [] };
  s.pending.push(group);
  return group;
}

const CONSUME_OUTCOME = {
  1: { text: 'Enemy spotted!', c: 'enemy' },
  2: { text: 'Nap — nothing used', c: 'neutral' },
  3: { text: '−1 Air', c: 'air' },
  4: { text: '−1 Air', c: 'air' },
  5: { text: '−1 Power', c: 'power' },
  6: { text: '−1 Food', c: 'food' },
};

function lose(s, reason) {
  s.status = 'lost';
  s.endReason = reason;
  s.phase = 'over';
  log(s, `GAME OVER — ${reason}`, 'bad');
}

function win(s) {
  s.status = 'won';
  s.phase = 'over';
  s.endReason = `All engine components repaired on turn ${s.turn}. Setting course for Earth!`;
  log(s, `VICTORY — ${s.endReason}`, 'good');
}

const freshTurn = () => ({ maxTravel: 0, collided: false, instigator: null, steps: {} });

/**
 * Record what happened to a turn step this turn, for the turn tracker:
 * status 'done' (it happened) or 'skipped' (it didn't apply / player declined), with a short note.
 * Step ids match PHASE_STEPS in constants.js.
 */
function markStep(s, id, status, note = '') {
  if (!s.t.steps) s.t.steps = {};
  s.t.steps[id] = { status, note };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function canAfford(s, cost) {
  return Object.entries(cost).every(([k, n]) => (s.cargo[k] || 0) >= n);
}

function spend(s, cost) {
  for (const [k, n] of Object.entries(cost)) s.cargo[k] -= n;
}

export const costText = (cost) =>
  Object.entries(cost)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${el(k)}`)
    .join(', ');

/** Gain a ship resource up to its limit. Returns amount actually gained. */
function gainShip(s, key, n) {
  const before = s.res[key];
  s.res[key] = Math.min(s.limits[key], before + n);
  return s.res[key] - before;
}

/**
 * Gain elements from the supply. Debt is paid off first (1 element = 1 debt).
 * Only 6 of each element exist, so gains beyond that are forfeit.
 */
function gainElement(s, k, n) {
  const r = { kept: 0, paid: 0, forfeit: 0 };
  for (let i = 0; i < n; i++) {
    if (s.cargo[k] >= MAX_ELEMENT) r.forfeit++;
    else if (s.debt > 0) {
      s.debt--;
      r.paid++;
    } else {
      s.cargo[k]++;
      r.kept++;
    }
  }
  return r;
}

function gainText(k, r) {
  const bits = [];
  if (r.kept) bits.push(`+${r.kept} ${el(k)}`);
  if (r.paid) bits.push(`${r.paid} ${el(k)} paid toward debt`);
  if (r.forfeit) bits.push(`${r.forfeit} ${el(k)} forfeit (supply exhausted)`);
  return bits.join(', ') || `no ${el(k)}`;
}

function gainMany(s, gains) {
  const parts = [];
  for (const [k, n] of Object.entries(gains)) {
    if (n > 0) parts.push(gainText(k, gainElement(s, k, n)));
  }
  return parts.join('; ');
}

/** Consume 1 of a ship resource; having none when you need it is fatal. */
function consume(s, key, deathText) {
  if (s.res[key] <= 0) {
    lose(s, `No ${ship(key)} left. ${deathText}`);
    return false;
  }
  s.res[key]--;
  return true;
}

// ---------------------------------------------------------------------------
// Coordinates, planets, enemies
// ---------------------------------------------------------------------------

/** "3 squares or nearer along a straight line (including diagonals)" */
function nearPlayerLine(s, x, y) {
  const dx = Math.abs(x - s.player.x);
  const dy = Math.abs(y - s.player.y);
  return (dx === 0 && dy <= 3) || (dy === 0 && dx <= 3) || (dx === dy && dx <= 3);
}

/** Roll coordinates, re-rolling until the square is free (and, for enemies, not too close). */
function rollCoord(s, { enemy = false } = {}) {
  for (let i = 0; i < 1000; i++) {
    const x = d6();
    const y = d6();
    if (occupied(s, x, y)) continue;
    if (enemy && nearPlayerLine(s, x, y)) continue;
    return { x, y };
  }
  return null;
}

function spawnEnemy(s, reason) {
  const c = rollCoord(s, { enemy: true });
  if (!c) {
    log(s, `${reason} …but there is no room on the map for another enemy vessel.`, 'info');
    return;
  }
  s.enemies.push({ id: s.nextId++, x: c.x, y: c.y });
  addRoll(s, 'Enemy coordinates', [['black', c.x], ['white', c.y]], [{ text: `Enemy vessel at (${c.x},${c.y})`, c: 'enemy' }]);
  log(s, `${reason} An enemy vessel appears at (${c.x},${c.y}).`, 'bad');
}

/**
 * Place an unknown (yellow) planet at rolled coordinates. Per "Rolling Coordinates" in the
 * rulebook, occupied coordinates are re-rolled, so this only fails if the map is full.
 */
function placeUnknown(s) {
  const c = rollCoord(s);
  if (!c) return null;
  const rolled = d6();
  // Challenge: planets are one value lower (1 stays 1). As with the physical dice, the die is lowered
  // before it's placed, so the board always shows the real value.
  const value = s.difficulty === 'challenge' ? Math.max(1, rolled - 1) : rolled;
  const p = { id: s.nextId++, x: c.x, y: c.y, type: 'unknown', value };
  s.planets.push(p);
  const lowered = value !== rolled ? ` (rolled ${rolled}, −1 for Challenge)` : '';
  addRoll(s, 'Planet', [['black', c.x], ['white', c.y], ['yellow', rolled]], [
    { text: `Unexplored planet at (${c.x},${c.y}), value ${value}${lowered}`, c: 'unknown' },
  ]);
  return p;
}

function removePlanet(s, p) {
  s.planets = s.planets.filter((q) => q.id !== p.id);
}

function reducePlanet(s, p) {
  markStep(s, 'reduce', 'done', p.value <= 1 ? 'Planet removed' : `Planet value ${p.value} → ${p.value - 1}`);
  if (p.value <= 1) {
    removePlanet(s, p);
    if (p.type === 'friendly') {
      log(s, `You overstayed your welcome at (${p.x},${p.y}); the planet stops responding.`, 'info');
      spawnEnemy(s, 'They send a sentry to scare you off!');
    } else {
      log(s, `The hostile planet at (${p.x},${p.y}) has exhausted its sentinels and goes quiet.`, 'good');
    }
  } else {
    p.value--;
    log(s, `Planet at (${p.x},${p.y}) drops to value ${p.value}.`, 'info');
  }
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

export function travelPowerCost(s, d) {
  if (s.difficulty === 'challenge') return d >= 3 ? 3 : d === 2 ? 1 : 0;
  return d >= 3 ? 1 : 0;
}

/**
 * Every square reachable this turn: straight lines up to `max` squares, stopping on
 * any planet or enemy vessel, and at the board edge.
 */
export function travelOptions(s, max) {
  const opts = [];
  for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
    let x = s.player.x;
    let y = s.player.y;
    for (let d = 1; d <= max; d++) {
      x += dx;
      y += dy;
      if (!inBoard(x, y)) break;
      const planet = !!planetAt(s, x, y);
      const enemy = enemiesAt(s, x, y).length > 0;
      const fuel = planet ? d : d + 1;
      const power = travelPowerCost(s, d);
      const affordable = s.res.fuel >= fuel && s.res.power >= power;
      opts.push({ dir, d, x, y, planet, enemy, fuel, power, affordable });
      if (planet || enemy) break;
    }
  }
  return opts;
}

/** Fleeing: 3 squares in a chosen direction (same stopping rules), flat 3 Rocket Fuel. */
export function fleeOptions(s) {
  const all = travelOptions(s, 3);
  const best = {};
  for (const o of all) if (!best[o.dir] || o.d > best[o.dir].d) best[o.dir] = o;
  return Object.values(best).map((o) => ({ ...o, fuel: 3, power: 0, affordable: s.res.fuel >= 3 }));
}

function arrive(s, x, y) {
  s.player = { x, y };
  if (planetAt(s, x, y)) {
    const g = gainShip(s, 'power', 2);
    if (g > 0) log(s, `Solar panels charged in orbit: +${g} Power.`, 'good');
    else log(s, 'Solar panels: Power is already full.', 'info');
  }
}

export const canScan = (s) => s.res.power >= 2 && poolCount(s, 'unknown') > 0;

// ---------------------------------------------------------------------------
// Phase transitions (automatic steps happen here)
// ---------------------------------------------------------------------------

function goto(s, phase) {
  if (s.status !== 'playing') return;
  s.phase = phase;
  const { x, y } = s.player;

  switch (phase) {
    case 'scan':
      if (!canScan(s)) {
        markStep(s, 'scan', 'skipped', s.res.power < 2 ? 'Not enough Power (needs 2)' : 'All unexplored planets are already on the map');
        goto(s, 'enemies');
      }
      return;

    case 'enemies': {
      const mobile = s.enemies.filter((e) => !(e.x === x && e.y === y));
      if (mobile.length === 0) {
        markStep(s, 'enemies', 'skipped', s.enemies.length === 0 ? 'No enemy vessels on the map' : 'Every enemy vessel is already on your square');
        goto(s, 'battle');
      }
      return;
    }

    case 'battle': {
      const here = enemiesAt(s, x, y);
      if (here.length === 0) {
        s.battle = null;
        if (!s.t.steps?.battle) markStep(s, 'battle', 'skipped', 'No enemy vessel on your square');
        goto(s, 'contact');
        return;
      }
      markStep(s, 'battle', 'done', here.length > 1 ? `${here.length} enemy vessels engaged` : 'Enemy vessel engaged');
      if (!s.t.instigator) s.t.instigator = s.t.collided ? 'player' : 'enemy';
      s.battle = { enemyId: here[0].id, stage: 'choose', count: here.length };
      log(
        s,
        `Battle! ${here.length > 1 ? `${here.length} enemy vessels share` : 'An enemy vessel shares'} your square. ` +
          `${s.t.instigator === 'player' ? 'You are' : 'The enemy is'} the instigator (wins ties).`,
        'bad'
      );
      return;
    }

    case 'contact': {
      const p = currentPlanet(s);
      if (!p || p.type !== 'unknown') {
        if (!s.t.steps?.contact) {
          markStep(s, 'contact', 'skipped', !p ? 'Not on a planet' : `Planet already known (${p.type})`);
        }
        goto(s, 'resolve');
      }
      return;
    }

    case 'resolve': {
      const p = currentPlanet(s);
      if (!p) {
        markStep(s, 'resolve', 'skipped', 'Not on a planet');
        markStep(s, 'reduce', 'skipped', 'Not on a planet');
        goto(s, 'maintenance');
        return;
      }
      if (p.type === 'hostile') {
        markStep(s, 'resolve', 'done', 'Hostile planet: an enemy vessel spawned');
        spawnEnemy(s, 'The hostile planet raises the alarm!');
        if (s.status !== 'playing') return;
        reducePlanet(s, p);
        goto(s, 'maintenance');
      } else if (p.type === 'friendly') {
        s.phase = 'trade';
        s.trade = { stage: 'choose' };
      } else {
        goto(s, 'maintenance');
      }
      return;
    }

    default:
      return;
  }
}

function endTurn(s) {
  s.turn++;
  s.t = freshTurn();
  s.battle = null;
  s.trade = null;
  s.phase = 'roll';
}

function finishTrade(s) {
  if (!s.t.steps?.resolve) markStep(s, 'resolve', 'done', 'Friendly planet');
  s.trade = null;
  const p = currentPlanet(s);
  if (p) reducePlanet(s, p);
  if (s.status === 'playing') goto(s, 'maintenance');
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export function newGame(difficulty = 'standard') {
  const cfg = DIFFICULTY[difficulty];
  const s = {
    v: SAVE_VERSION,
    difficulty,
    limits: { ...cfg.limits },
    res: { ...cfg.start },
    cargo: { ...START_CARGO },
    debt: 0,
    engine: Object.fromEntries(ENGINE_PARTS.map((p) => [p.id, false])),
    player: { x: 0, y: 0 },
    planets: [],
    enemies: [],
    nextId: 1,
    turn: 1,
    phase: 'roll',
    status: 'playing',
    endReason: null,
    t: freshTurn(),
    battle: null,
    trade: null,
    rolls: [],
    rollSeq: 0,
    pending: [],
    log: [],
    logMark: 0, // first log id of the most recent action (see act)
  };

  if (difficulty === 'challenge') {
    // Scan planets first, then re-roll the start until a planet is within Manhattan distance 6.
    for (let i = 0; i < 3; i++) placeUnknown(s);
    for (let i = 0; i < 2000; i++) {
      const x = d6();
      const y = d6();
      if (occupied(s, x, y)) continue;
      if (s.planets.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 6)) {
        s.player = { x, y };
        break;
      }
    }
  } else {
    const c = rollCoord(s);
    s.player = c;
    for (let i = 0; i < 3; i++) placeUnknown(s);
  }

  log(s, `New ${cfg.name} game. Your crippled ship drifts at (${s.player.x},${s.player.y}).`, 'info');
  log(s, 'Three unexplored planets have been detected nearby.', 'info');
  s.rolls = s.pending;
  s.pending = [];
  return s;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const handlers = {
  // ----- 1. Consume resources & travel -----
  ROLL_TURN(s) {
    if (s.phase !== 'roll') return false;
    const b = d6();
    const w = d6();
    addRoll(s, 'Consume (black) / Travel (white)', [['black', b], ['white', w]], [
      CONSUME_OUTCOME[b],
      { text: `Travel up to ${Math.ceil(w / 2)}`, c: 'fuel' },
    ]);
    log(s, `Turn ${s.turn}: rolled black ${b}, white ${w}.`, 'roll');

    switch (b) {
      case 1:
        spawnEnemy(s, 'You were spotted by enemy sentinels!');
        break;
      case 2:
        log(s, 'You took a nap — no resources consumed.', 'good');
        break;
      case 3:
      case 4:
        if (consume(s, 'air', 'You asphyxiated.')) log(s, '−1 Air.', 'info');
        break;
      case 5:
        if (consume(s, 'power', 'Your ship is adrift.')) log(s, '−1 Power.', 'info');
        break;
      case 6:
        if (consume(s, 'food', 'You starved.')) log(s, '−1 Food.', 'info');
        break;
      default:
        break;
    }
    if (s.status !== 'playing') return;

    s.t.maxTravel = Math.ceil(w / 2);
    const opts = travelOptions(s, s.t.maxTravel).filter((o) => o.affordable);
    if (opts.length === 0) {
      lose(s, 'Not enough Rocket Fuel (or Power) to travel anywhere — you are adrift.');
      return;
    }
    s.phase = 'travel';
  },

  TRAVEL(s, { x, y }) {
    if (s.phase !== 'travel') return false;
    const o = travelOptions(s, s.t.maxTravel).find((q) => q.x === x && q.y === y);
    if (!o || !o.affordable) return false;
    s.res.fuel -= o.fuel;
    s.res.power -= o.power;
    log(
      s,
      `Travelled ${o.d} square${o.d > 1 ? 's' : ''} ${o.dir} to (${x},${y}): −${o.fuel} Fuel` +
        `${o.power ? `, −${o.power} Power` : ''}${o.planet ? '' : ' (open space)'}.`,
      'info'
    );
    if (o.enemy) {
      s.t.collided = true;
      log(s, `You flew straight into an enemy vessel at (${x},${y})!`, 'bad');
    }
    arrive(s, x, y);
    markStep(s, 'travel', 'done', `Moved ${o.d} square${o.d > 1 ? 's' : ''} ${o.dir}`);
    goto(s, 'scan');
  },

  // ----- 2. Scan -----
  SCAN(s) {
    if (s.phase !== 'scan' || !canScan(s)) return false;
    s.res.power -= 2;
    const n = poolCount(s, 'unknown');
    let found = 0;
    for (let i = 0; i < n; i++) if (placeUnknown(s)) found++;
    log(s, `Scanner fired (−2 Power): ${found} unknown planet${found === 1 ? '' : 's'} located.`, found ? 'good' : 'info');
    markStep(s, 'scan', 'done', `${found} planet${found === 1 ? '' : 's'} found`);
    goto(s, 'enemies');
  },

  SKIP_SCAN(s) {
    if (s.phase !== 'scan') return false;
    markStep(s, 'scan', 'skipped', 'You chose not to scan');
    goto(s, 'enemies');
  },

  // ----- 3. Move enemy vessels -----
  MOVE_ENEMIES(s) {
    if (s.phase !== 'enemies') return false;
    const b = d6();
    const w = d6();
    const hx = Math.floor(b / 2);
    const vy = Math.floor(w / 2);
    addRoll(s, 'Enemy movement ↔ / ↕', [['black', b], ['white', w]], [{ text: `↔ ${hx}   ↕ ${vy}`, c: 'enemy' }]);

    const P = s.player;
    const engaged = new Set(s.enemies.filter((e) => e.x === P.x && e.y === P.y).map((e) => e.id));
    const alreadyHere = new Set(engaged); // e.g. one you flew into: it didn't "reach" you
    const dist = (e) => Math.abs(e.x - P.x) + Math.abs(e.y - P.y);
    const order = [...s.enemies].sort((a, c) => dist(a) - dist(c)); // closest first

    const step = (e, axis, n) => {
      if (engaged.has(e.id)) return;
      const target = axis === 'x' ? P.x : P.y;
      if (e[axis] === target) return;
      const dir = Math.sign(target - e[axis]);
      for (let i = 0; i < n; i++) {
        const nx = axis === 'x' ? e.x + dir : e.x;
        const ny = axis === 'y' ? e.y + dir : e.y;
        if (!inBoard(nx, ny)) break;
        if (nx === P.x && ny === P.y) {
          e.x = nx;
          e.y = ny;
          engaged.add(e.id);
          break;
        }
        if (s.enemies.some((o) => o !== e && o.x === nx && o.y === ny)) break;
        e.x = nx;
        e.y = ny;
      }
    };

    order.forEach((e) => step(e, 'x', hx));
    order.forEach((e) => step(e, 'y', vy));

    const hits = s.enemies.filter((e) => e.x === P.x && e.y === P.y && !alreadyHere.has(e.id)).length;
    log(s, `Enemy vessels move up to ${hx} horizontally and ${vy} vertically.`, 'roll');
    if (hits) log(s, `${hits} enemy vessel${hits > 1 ? 's have' : ' has'} reached you!`, 'bad');
    markStep(s, 'enemies', 'done', `Moved up to ${hx} across, ${vy} down/up`);
    goto(s, 'battle');
  },

  // ----- 4. Battle -----
  BATTLE_FLEE(s) {
    const B = s.battle;
    if (s.phase !== 'battle' || !B || B.stage !== 'choose' || s.res.fuel < 3) return false;
    const r = d6();
    addRoll(s, 'Flee attempt', [['d6', r]], [r <= 3 ? { text: 'Failed to flee', c: 'bad' } : { text: 'Escaped!', c: 'good' }]);
    if (r <= 3) {
      const a = d6();
      const b = d6();
      const dmg = Math.abs(a - b);
      addRoll(s, 'Damage (difference)', [['d6', a], ['d6', b]], [{ text: `−${dmg} Hull`, c: 'hull' }]);
      log(s, `Flee failed (rolled ${r}). You lose the battle and take ${dmg} Hull damage.`, 'bad');
      applyHullDamage(s, dmg);
      if (s.status !== 'playing') return;
      B.stage = 'loot';
      B.playerWon = false;
    } else {
      log(s, `Flee succeeded (rolled ${r})! Choose a direction to burn 3 squares (−3 Fuel).`, 'good');
      B.stage = 'fleeDir';
    }
  },

  BATTLE_FLEE_MOVE(s, { x, y }) {
    const B = s.battle;
    if (s.phase !== 'battle' || !B || B.stage !== 'fleeDir') return false;
    const o = fleeOptions(s).find((q) => q.x === x && q.y === y);
    if (!o || !o.affordable) return false;
    s.res.fuel -= 3;
    log(s, `Fled ${o.d} square${o.d > 1 ? 's' : ''} ${o.dir} to (${x},${y}): −3 Fuel.`, 'info');
    arrive(s, x, y);
    s.battle = null;
    goto(s, 'battle'); // may trigger another battle if you fled onto an enemy
  },

  BATTLE_FIGHT(s, { shields = 0 }) {
    const B = s.battle;
    if (s.phase !== 'battle' || !B || B.stage !== 'choose') return false;
    const sh = Math.max(0, Math.min(5, s.res.power, Math.floor(shields)));
    s.res.power -= sh;
    const b = d6();
    const w = d6();
    const battleRoll = addRoll(s, 'Battle: you (black) vs enemy (white)', [['black', b], ['white', w]]);
    const won = b > w || (b === w && s.t.instigator === 'player');
    const dmgIfLost = Math.max(0, Math.abs(b - w) - sh);
    battleRoll.result = won
      ? [{ text: b === w ? 'Victory (tie, you instigated)' : 'Victory', c: 'good' }]
      : [{ text: `Defeat: −${dmgIfLost} Hull`, c: 'hull' }];
    if (won) {
      log(s, `Battle won! You rolled ${b} vs ${w}${b === w ? ' (tie goes to you as instigator)' : ''}.`, 'good');
    } else {
      const raw = Math.abs(b - w);
      const dmg = Math.max(0, raw - sh);
      log(
        s,
        `Battle lost: ${b} vs ${w}${b === w ? ' (tie goes to the enemy)' : ''}. ` +
          (raw === 0
            ? 'No damage.'
            : `${raw} damage${sh ? `, ${Math.min(sh, raw)} blocked by shields` : ''} → ${dmg} Hull damage.`),
        'bad'
      );
      applyHullDamage(s, dmg);
      if (s.status !== 'playing') return;
    }
    B.stage = 'loot';
    B.playerWon = won;
    B.shields = sh;
  },

  BATTLE_LOOT(s) {
    const B = s.battle;
    if (s.phase !== 'battle' || !B || B.stage !== 'loot') return false;
    const r = d6();
    const k = LOOT_TABLE[r];
    addRoll(s, B.playerWon ? 'Loot' : 'Ransom', [['d6', r]], [
      { text: `${B.playerWon ? 'Loot' : 'Ransom'}: ${ELEMENT_INFO[k].name}`, c: k },
    ]);
    if (B.playerWon) {
      B.stage = 'lootChoice';
      B.lootEl = k;
      log(s, `Loot roll ${r}: take 1 ${el(k)} or +2 of any ship resource.`, 'good');
      return;
    }
    if (s.cargo[k] > 0) {
      s.cargo[k]--;
      log(s, `The enemy seizes 1 ${el(k)} as ransom and departs.`, 'bad');
    } else {
      const add = k === 'U' ? 4 : 2;
      s.debt += add;
      log(s, `You have no ${el(k)} to pay the ransom: +${add} Debt.`, 'bad');
      if (s.debt > MAX_DEBT) {
        lose(s, 'Debt exceeded 6 — the enemy vessel seizes your ship.');
        return;
      }
    }
    removeEnemy(s, B.enemyId);
    s.battle = null;
    goto(s, 'battle');
  },

  BATTLE_LOOT_CHOOSE(s, { kind, key }) {
    const B = s.battle;
    if (s.phase !== 'battle' || !B || B.stage !== 'lootChoice') return false;
    if (kind === 'element') {
      log(s, `Looted: ${gainText(B.lootEl, gainElement(s, B.lootEl, 1))}.`, 'good');
    } else if (SHIP_INFO[key]) {
      const g = gainShip(s, key, 2);
      log(s, `Looted: +${g} ${ship(key)}.`, 'good');
    } else return false;
    removeEnemy(s, B.enemyId);
    s.battle = null;
    goto(s, 'battle');
  },

  // ----- 5. Contact -----
  CONTACT(s) {
    if (s.phase !== 'contact') return false;
    const p = currentPlanet(s);
    if (!p || p.type !== 'unknown') return false;
    const r = d6();
    markStep(s, 'contact', 'done', r <= 2 ? 'Hostile' : 'Friendly');
    addRoll(s, 'First contact', [['d6', r]], [r <= 2 ? { text: 'Hostile', c: 'hostile' } : { text: 'Friendly', c: 'friendly' }]);
    const value = p.value; // Challenge's -1 was already applied when the planet was placed
    const hostile = r <= 2;
    const type = hostile ? 'hostile' : 'friendly';

    if (poolCount(s, type) <= 0) {
      removePlanet(s, p);
      if (hostile) {
        log(s, `Contact roll ${r}: hostile! (No red dice left — the planet is not placed.)`, 'bad');
        spawnEnemy(s, 'The hostile inhabitants launch a vessel immediately!');
      } else {
        log(s, `Contact roll ${r}: friendly, but no green dice remain — no planet is placed.`, 'info');
      }
      markStep(s, 'resolve', 'skipped', 'No planet was placed');
      markStep(s, 'reduce', 'skipped', 'No planet was placed');
      if (s.status === 'playing') goto(s, 'maintenance');
      return;
    }

    p.type = type;
    p.value = value;
    log(
      s,
      `Contact roll ${r}: the planet is ${hostile ? 'HOSTILE' : 'friendly'} (value ${value}).`,
      hostile ? 'bad' : 'good'
    );
    goto(s, 'resolve');
  },

  // ----- 6. Friendly planet: gather or trade (choose ONE) -----
  TRADE_GATHER(s) {
    if (s.phase !== 'trade' || s.trade?.stage !== 'choose') return false;
    const b = d6();
    const w = d6();
    const sum = b + w;
    const GATHER_OUTCOME =
      sum === 2 || sum === 12 ? { text: 'Struck out', c: 'neutral' }
      : sum <= 4 ? { text: '+1 Copper', c: 'Cu' }
      : sum <= 6 ? { text: '+2 Oxygen', c: 'O2' }
      : sum === 7 ? { text: 'Any 3 of C / O₂ / H₂', c: 'good' }
      : sum <= 9 ? { text: '+2 Hydrogen', c: 'H2' }
      : { text: '+1 Titanium', c: 'Ti' };
    addRoll(s, `Gather (sum ${sum})`, [['black', b], ['white', w]], [GATHER_OUTCOME]);
    let text;
    if (sum === 2 || sum === 12) text = 'You struck out!';
    else if (sum <= 4) text = `Mined an asteroid: ${gainMany(s, { Cu: 1 })}.`;
    else if (sum <= 6) text = `Skimmed the atmosphere: ${gainMany(s, { O2: 2 })}.`;
    else if (sum === 7) {
      s.trade = { stage: 'gather7' };
      log(s, 'Gather roll 7: Good Samaritans! Choose any 3 of Carbon, Oxygen or Hydrogen.', 'good');
      return;
    } else if (sum <= 9) text = `Buzzed the star's corona: ${gainMany(s, { H2: 2 })}.`;
    else text = `Found a surface deposit: ${gainMany(s, { Ti: 1 })}.`;
    log(s, `Gather roll ${sum}: ${text}`, sum === 2 || sum === 12 ? 'info' : 'good');
    finishTrade(s);
  },

  TRADE_GATHER7(s, { picks }) {
    if (s.phase !== 'trade' || s.trade?.stage !== 'gather7') return false;
    const clean = { C: picks?.C || 0, O2: picks?.O2 || 0, H2: picks?.H2 || 0 };
    if (sumValues(clean) !== 3 || Object.values(clean).some((n) => n < 0)) return false;
    log(s, `Good Samaritans: ${gainMany(s, clean)}.`, 'good');
    finishTrade(s);
  },

  TRADE_CHO(s, { give, get }) {
    if (s.phase !== 'trade' || s.trade?.stage !== 'choose' || s.debt > 0) return false;
    const n = sumValues(give);
    const getClean = { C: get?.C || 0, O2: get?.O2 || 0, H2: get?.H2 || 0 };
    if (n < 1 || n > 3 || sumValues(getClean) !== n || !canAfford(s, give)) return false;
    spend(s, give);
    log(s, `Traded ${costText(give)} for ${gainMany(s, getClean)}.`, 'good');
    finishTrade(s);
  },

  TRADE_CUTI_ROLL(s) {
    const T = s.trade;
    if (s.phase !== 'trade' || !T || s.debt > 0) return false;
    const fresh = T.stage === 'choose';
    const again = T.stage === 'cuti' && T.resolved && T.attempt < 2;
    if (!fresh && !again) return false;
    const r = d6();
    addRoll(s, 'Negotiate for Cu / Ti', [['d6', r]], [r >= 3 ? { text: 'Deal offered', c: 'good' } : { text: 'No deal', c: 'neutral' }]);
    const attempt = fresh ? 1 : T.attempt + 1;
    const success = r >= 3;
    s.trade = { stage: 'cuti', attempt, roll: r, success, resolved: !success };
    log(
      s,
      `Negotiation ${attempt} (rolled ${r}): ${success ? 'they will trade 2 Elements for 1 Cu or Ti.' : 'no deal.'}`,
      success ? 'good' : 'info'
    );
  },

  TRADE_CUTI_ACCEPT(s, { give, get }) {
    const T = s.trade;
    if (s.phase !== 'trade' || T?.stage !== 'cuti' || !T.success || T.resolved) return false;
    if (sumValues(give) !== 2 || !canAfford(s, give) || !['Cu', 'Ti'].includes(get)) return false;
    spend(s, give);
    log(s, `Traded ${costText(give)} for ${gainMany(s, { [get]: 1 })}.`, 'good');
    T.resolved = true;
    if (T.attempt >= 2) finishTrade(s);
  },

  TRADE_CUTI_DECLINE(s) {
    const T = s.trade;
    if (s.phase !== 'trade' || T?.stage !== 'cuti' || T.resolved) return false;
    T.resolved = true;
    log(s, 'You decline the offer.', 'info');
    if (T.attempt >= 2) finishTrade(s);
  },

  TRADE_U_ROLL(s) {
    if (s.phase !== 'trade' || s.trade?.stage !== 'choose' || s.debt > 0) return false;
    const r = d6();
    addRoll(s, 'Negotiate for Uranium', [['d6', r]], [r >= 4 ? { text: 'Uranium offered', c: 'U' } : { text: 'Refused', c: 'neutral' }]);
    const success = r >= 4;
    s.trade = { stage: 'uranium', roll: r, success, resolved: !success };
    log(
      s,
      `Uranium negotiation (rolled ${r}): ${success ? 'they will trade 4 Elements for 1 U.' : 'they refuse.'}`,
      success ? 'good' : 'info'
    );
  },

  TRADE_U_ACCEPT(s, { give }) {
    const T = s.trade;
    if (s.phase !== 'trade' || T?.stage !== 'uranium' || !T.success || T.resolved) return false;
    if (sumValues(give) !== 4 || !canAfford(s, give) || (give.U || 0) > 0) return false;
    spend(s, give);
    log(s, `Traded ${costText(give)} for ${gainMany(s, { U: 1 })}.`, 'good');
    finishTrade(s);
  },

  TRADE_BORROW(s, { element, n }) {
    if (s.phase !== 'trade' || s.trade?.stage !== 'choose') return false;
    if (element === 'U' || !ELEMENTS.includes(element)) return false;
    const max = maxBorrow(s, element);
    if (n < 1 || n > max) return false;
    s.cargo[element] += n;
    s.debt += 2 * n;
    log(s, `Borrowed ${n} ${el(element)} (+${2 * n} Debt).`, 'info');
    finishTrade(s);
  },

  TRADE_FINISH(s) {
    const T = s.trade;
    if (s.phase !== 'trade' || !T) return false;
    if (T.stage === 'choose') {
      log(s, 'You leave the friendly planet without trading.', 'info');
      markStep(s, 'resolve', 'done', 'Friendly planet: left without trading');
    }
    else if (!T.resolved) log(s, 'You decline the offer.', 'info'); // finishing with an open offer = declining it
    finishTrade(s);
  },

  // ----- 8. Maintenance & repair (choose ONE) -----
  MAINTAIN(s, { id }) {
    if (s.phase !== 'maintenance') return false;
    const op = MAINTENANCE.find((m) => m.id === id);
    if (!op || !canAfford(s, op.cost)) return false;
    spend(s, op.cost);
    const gains = Object.entries(op.gain).map(([k, n]) => `+${gainShip(s, k, n)} ${ship(k)}`);
    log(s, `${op.label}: spent ${costText(op.cost)} → ${gains.join(', ')}.`, 'good');
    endTurn(s);
  },

  REPAIR(s, { id }) {
    if (s.phase !== 'maintenance') return false;
    const part = ENGINE_PARTS.find((p) => p.id === id);
    if (!part || s.engine[id] || !canAfford(s, part.cost)) return false;
    spend(s, part.cost);
    s.engine[id] = true;
    log(s, `Engine repair: ${part.name} restored (spent ${costText(part.cost)}).`, 'good');
    if (ENGINE_PARTS.every((p) => s.engine[p.id])) {
      win(s);
      return;
    }
    endTurn(s);
  },

  END_TURN(s) {
    if (s.phase !== 'maintenance') return false;
    endTurn(s);
  },
};

function applyHullDamage(s, dmg) {
  if (dmg > s.res.hull) {
    s.res.hull = 0;
    lose(s, 'Your hull was breached and your air vented into space.');
  } else {
    s.res.hull -= dmg;
  }
}

function removeEnemy(s, id) {
  s.enemies = s.enemies.filter((e) => e.id !== id);
}

/**
 * What a ship-resource gain would actually do, for previews and waste warnings.
 * Returns [{ k, n, gained, wasted }] — `wasted` is the part above the resource's maximum.
 */
export function gainPreview(s, gain = {}) {
  return Object.entries(gain).map(([k, n]) => {
    const room = Math.max(0, s.limits[k] - s.res[k]);
    const gained = Math.min(room, n);
    return { k, n, gained, wasted: n - gained };
  });
}

/** How many of an element can be borrowed right now (max 3, ≤6 debt total, cargo room). */
export function maxBorrow(s, element) {
  if (element === 'U' || s.debt >= 5) return 0;
  return Math.max(0, Math.min(3, Math.floor((MAX_DEBT - s.debt) / 2), MAX_ELEMENT - s.cargo[element]));
}

/** Apply an action. Returns the same state object if the action was not legal. */
export function act(prev, action) {
  if (action.type === 'NEW_GAME') return newGame(action.difficulty);
  if (!prev || prev.status !== 'playing') return prev;
  const h = handlers[action.type];
  if (!h) return prev;
  const s = structuredClone(prev);
  s.pending = [];
  const mark = s.nextId;
  const result = h(s, action);
  if (result === false) return prev;
  // Log entries created by this action (ids >= mark) are shown as "most recent" in the log.
  if (s.log.some((e) => e.id >= mark)) s.logMark = mark;
  if (s.pending.length) {
    s.rolls = s.pending;
    s.rollSeq++;
  }
  s.pending = [];
  return s;
}
