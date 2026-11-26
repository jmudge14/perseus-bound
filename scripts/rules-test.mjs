// Rules regression tests: one scenario per rule from the Perseus Bound rulebook that is easy
// to get subtly wrong. Run with `npm run test:rules` (the build scripts run it automatically).
// Dice are forced by replacing Math.random during each action.
import { act, newGame, travelOptions, maxBorrow } from '../src/game/engine.js';
import { scoreGame } from '../src/game/score.js';
import { encodeState, decodeState } from '../src/game/share.js';
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const base = (diff = 'standard') => { const s = newGame(diff); s.planets = []; s.enemies = []; s.player = { x: 3, y: 3 }; s.log = []; return s; };
const withRandom = (seq, fn) => { const orig = Math.random; let i = 0; Math.random = () => (seq[i++ % seq.length] - 0.5) / 6; try { return fn(); } finally { Math.random = orig; } };
// d6 = 1 + floor(r*6); r=(v-0.5)/6 -> v

// --- Consume & travel ---
{ const s = base(); s.res.air = 0; s.phase = 'roll'; const n = withRandom([3, 4], () => act(s, { type: 'ROLL_TURN' }));
  check('Black 3 with 0 Air loses (asphyxiated)', n.status === 'lost'); }
{ const s = base(); s.res.air = 1; s.phase = 'roll'; const n = withRandom([3, 4], () => act(s, { type: 'ROLL_TURN' }));
  check('Black 3 with 1 Air survives at 0', n.status === 'playing' && n.res.air === 0); }
{ const s = base(); s.phase = 'roll'; const n = withRandom([2, 6], () => act(s, { type: 'ROLL_TURN' }));
  check('White 6 -> travel up to 3', n.t.maxTravel === 3); }
{ const s = base(); s.t.maxTravel = 3; s.planets = [{ id: 90, x: 3, y: 1, type: 'unknown', value: 3 }];
  const o = travelOptions(s, 3); const up = o.filter((q) => q.dir === 'up'); const right3 = o.find((q) => q.dir === 'right' && q.d === 3);
  check('Travel stops on a planet', up.length === 2 && up[1].planet);
  check('Planet landing costs 1 Fuel/square', up[1].fuel === 2);
  check('Open space costs +1 Fuel (table)', right3.fuel === 4 && right3.power === 1, `3 squares: ${right3.fuel} fuel, ${right3.power} power`); }
{ const s = base('challenge'); const o = travelOptions(s, 3);
  check('Challenge: 2 squares = 1 Power, 3 squares = 3 Power', o.find((q) => q.d === 2).power === 1 && o.find((q) => q.d === 3).power === 3); }
{ const s = base(); s.res.fuel = 1; s.phase = 'roll'; const n = withRandom([2, 2], () => act(s, { type: 'ROLL_TURN' }));
  check('Too little fuel for any move -> adrift (lost)', n.status === 'lost'); }
{ const s = base(); s.phase = 'travel'; s.t.maxTravel = 1; s.planets = [{ id: 90, x: 3, y: 2, type: 'unknown', value: 3 }]; s.res.power = 4;
  const n = act(s, { type: 'TRAVEL', x: 3, y: 2 }); check('Solar +2 Power on landing at a planet', n.res.power === 6); }

// --- Spawn rule ---
{ let bad = 0; for (let k = 0; k < 500; k++) { const s = base(); s.phase = 'roll'; const n = withRandom([1, 2, ...Array.from({ length: 40 }, () => 1 + Math.floor(Math.random() * 6))], () => act(s, { type: 'ROLL_TURN' }));
    for (const e of n.enemies) { const dx = Math.abs(e.x - 3), dy = Math.abs(e.y - 3); if ((dx === 0 && dy <= 3) || (dy === 0 && dx <= 3) || (dx === dy && dx <= 3)) bad++; } }
  check('Enemies never spawn within 3 squares in a straight line', bad === 0, `${bad} violations / 500`); }

// --- Enemy movement ---
{ const s = base(); s.player = { x: 1, y: 1 }; s.enemies = [{ id: 1, x: 5, y: 1 }]; s.phase = 'enemies';
  const n = withRandom([6, 6], () => act(s, { type: 'MOVE_ENEMIES' }));
  check('Enemy moving onto you stops there', n.enemies[0].x === 2 || (n.enemies[0].x === 1 && n.enemies[0].y === 1), JSON.stringify(n.enemies[0])); }
{ const s = base(); s.player = { x: 3, y: 3 }; s.enemies = [{ id: 1, x: 2, y: 6 }]; s.phase = 'enemies';
  const n = withRandom([6, 6], () => act(s, { type: 'MOVE_ENEMIES' }));
  check('Enemy overshoots your column (moves full distance)', n.enemies[0].x === 5 && n.enemies[0].y === 3, JSON.stringify(n.enemies[0])); }
{ const s = base(); s.player = { x: 1, y: 3 }; s.enemies = [{ id: 1, x: 3, y: 3 }, { id: 2, x: 5, y: 3 }]; s.phase = 'enemies';
  const n = withRandom([6, 1], () => act(s, { type: 'MOVE_ENEMIES' }));
  const e2 = n.enemies.find((e) => e.id === 2);
  check("Enemies can't pass each other", e2.x !== 1, `enemy 2 at ${e2.x},${e2.y}; enemy 1 at ${n.enemies[0].x},${n.enemies[0].y}`); }

{ const s = base(); s.enemies = [{ id: 1, x: 3, y: 2 }, { id: 2, x: 6, y: 6 }]; s.phase = 'travel'; s.t.maxTravel = 1;
  let n = act(s, { type: 'TRAVEL', x: 3, y: 2 });
  if (n.phase === 'scan') n = act(n, { type: 'SKIP_SCAN' });
  n = withRandom([1, 1], () => act(n, { type: 'MOVE_ENEMIES' }));
  const texts = n.log.map((e) => e.text).join(' | ');
  check('Flying into an enemy is logged as a collision, not "reached you"', /flew straight into/.test(texts) && !/reached you/.test(texts) && n.t.instigator === 'player'); }

// --- Battle ---
{ const s = base(); s.enemies = [{ id: 1, x: 3, y: 3 }]; s.t.collided = true; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([4, 4], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 }));
  check('Tie goes to the instigator (you collided)', n.battle.playerWon === true); }
{ const s = base(); s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; s.t.collided = false; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([4, 4], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 }));
  check('Tie goes to the instigator (enemy moved onto you)', n.battle.playerWon === false && n.res.hull === 10); }
{ const s = base(); s.res.hull = 3; s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([1, 4], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 }));
  check('Hull exactly 0 survives (game ends only below zero)', n.status === 'playing' && n.res.hull === 0); }
{ const s = base(); s.res.hull = 3; s.res.power = 5; s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([1, 6], () => act(n, { type: 'BATTLE_FIGHT', shields: 2 }));
  check('Shields absorb damage, Power spent', n.res.hull === 0 && n.res.power === 3); }
{ const s = base(); s.res.power = 5; s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([2, 1, 6], () => act(n, { type: 'BATTLE_FLEE' }));
  check('Failed flee: 2D6 difference as damage, no shields', n.res.hull === 5 && n.battle.stage === 'loot' && n.res.power === 5); }
{ const s = base(); s.cargo.U = 0; s.debt = 2; s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([1, 2], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 })); n = withRandom([6], () => act(n, { type: 'BATTLE_LOOT' }));
  check('Ransom of Uranium you lack = +4 Debt', n.debt === 6 && n.status === 'playing'); }
{ const s = base(); s.cargo.U = 0; s.debt = 3; s.enemies = [{ id: 1, x: 3, y: 3 }]; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([1, 2], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 })); n = withRandom([6], () => act(n, { type: 'BATTLE_LOOT' }));
  check('Debt above 6 -> ship seized', n.status === 'lost'); }
{ const s = base(); s.enemies = [{ id: 1, x: 3, y: 3 }, { id: 2, x: 3, y: 3 }]; s.t.collided = true; s.phase = 'enemies'; let n = act(s, { type: 'MOVE_ENEMIES' });
  n = withRandom([5, 2], () => act(n, { type: 'BATTLE_FIGHT', shields: 0 })); n = withRandom([1], () => act(n, { type: 'BATTLE_LOOT' }));
  n = act(n, { type: 'BATTLE_LOOT_CHOOSE', kind: 'element' });
  check('Second enemy on your square -> second battle, same instigator', n.phase === 'battle' && n.t.instigator === 'player' && n.enemies.length === 1); }

// --- Contact / resolve / reduce ---
{ const s = base(); s.planets = [{ id: 90, x: 3, y: 3, type: 'unknown', value: 4 }, ...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, x: 6, y: i + 1, type: 'hostile', value: 2 }))]; s.phase = 'contact';
  const n = withRandom([1, ...Array.from({ length: 40 }, () => 1 + Math.floor(Math.random() * 6))], () => act(s, { type: 'CONTACT' }));
  check('Hostile contact with no red dice: no planet, exactly 1 enemy, no reduce', !n.planets.find((p) => p.id === 90) && n.enemies.length === 1 && n.phase === 'maintenance'); }
{ const s = base(); s.planets = [{ id: 90, x: 3, y: 3, type: 'unknown', value: 6 }]; s.phase = 'contact';
  const n = withRandom([5], () => act(s, { type: 'CONTACT' }));
  check('Friendly contact keeps the die value', n.planets[0].type === 'friendly' && n.planets[0].value === 6 && n.phase === 'trade'); }
{ const s = base('challenge'); s.planets = [{ id: 90, x: 3, y: 3, type: 'unknown', value: 6 }]; s.phase = 'contact';
  const n = withRandom([5], () => act(s, { type: 'CONTACT' }));
  check('Challenge: contacted planet is one value lower', n.planets[0].value === 5); }
{ const s = base(); s.planets = [{ id: 90, x: 3, y: 3, type: 'hostile', value: 3 }]; s.phase = 'scan';
  const n = withRandom(Array.from({ length: 40 }, () => 1 + Math.floor(Math.random() * 6)), () => act(s, { type: 'SKIP_SCAN' }));
  check('Landing on a known hostile planet spawns an enemy and reduces it', n.enemies.length === 1 && n.planets[0].value === 2); }
{ const s = base(); s.planets = [{ id: 90, x: 3, y: 3, type: 'friendly', value: 1 }]; s.phase = 'trade'; s.trade = { stage: 'choose' };
  const n = withRandom(Array.from({ length: 40 }, () => 1 + Math.floor(Math.random() * 6)), () => act(s, { type: 'TRADE_FINISH' }));
  check('Removing a friendly planet spawns an enemy', n.planets.length === 0 && n.enemies.length === 1); }

// --- Gather / trade / debt ---
{ const s = base(); s.debt = 2; s.cargo.O2 = 6; s.planets = [{ id: 90, x: 3, y: 3, type: 'friendly', value: 3 }]; s.phase = 'trade'; s.trade = { stage: 'choose' };
  const n = withRandom([2, 3], () => act(s, { type: 'TRADE_GATHER' }));
  check('Gather with no supply left forfeits (debt unchanged)', n.debt === 2 && n.cargo.O2 === 6); }
{ const s = base(); s.debt = 1; s.cargo.O2 = 2; s.planets = [{ id: 90, x: 3, y: 3, type: 'friendly', value: 3 }]; s.phase = 'trade'; s.trade = { stage: 'choose' };
  const n = withRandom([2, 3], () => act(s, { type: 'TRADE_GATHER' }));
  check('Gathered Elements pay debt first', n.debt === 0 && n.cargo.O2 === 3); }
{ const s = base(); s.debt = 4; check('Borrow limit keeps debt ≤ 6', maxBorrow(s, 'O2') === 1); s.debt = 5; check("Can't borrow at 5+ debt", maxBorrow(s, 'O2') === 0); }
{ const s = base(); s.debt = 1; s.planets = [{ id: 90, x: 3, y: 3, type: 'friendly', value: 3 }]; s.phase = 'trade'; s.trade = { stage: 'choose' };
  check("Can't trade while in debt", act(s, { type: 'TRADE_CHO', give: { Cu: 1 }, get: { C: 1 } }) === s); }

// --- Scan ---
{ const s = base(); s.planets = [{ id: 90, x: 1, y: 1, type: 'unknown', value: 3 }]; s.phase = 'scan'; s.res.power = 2;
  const n = act(s, { type: 'SCAN' }); check('Scan places every yellow die in the pool', n.planets.filter((p) => p.type === 'unknown').length === 3 && n.res.power === 0); }

// --- Maintenance / win ---
{ const s = base(); s.phase = 'maintenance'; s.cargo = { C: 0, O2: 0, H2: 0, Cu: 1, Ti: 3, U: 0 }; s.engine = { ionizer: true, combustor: true, nuclear: true, chamber: false };
  const n = act(s, { type: 'REPAIR', id: 'chamber' }); check('Repairing the last part wins', n.status === 'won'); }
{ const s = base(); s.phase = 'maintenance'; s.res.hull = 5; s.cargo.Ti = 2; const n = act(s, { type: 'MAINTAIN', id: 'hull' });
  check('2 Ti -> +2 Hull (rulebook value)', n.res.hull === 7); }

// --- High score (digital extra) and sharing finished games ---
{ const won = (turn, cargo, res, debt = 0) => ({ ...base(), status: 'won', phase: 'over', turn, debt,
    cargo: { C: cargo, O2: 0, H2: 0, Cu: 0, Ti: 0, U: 0 }, res: { fuel: res, air: 0, food: 0, hull: 0, power: 0 } });
  check('Score: 70 turns, 3 cargo, 10 resources = 3571 + 30 + 10', scoreGame(won(70, 3, 10)).total === 3611);
  check('Score: odd totals are possible', scoreGame(won(20, 0, 7)).total % 2 === 1);
  check('Score: at ~70 turns, one turn faster beats 4 extra cargo', scoreGame(won(69, 0, 0)).total > scoreGame(won(70, 4, 0)).total);
  check('Score: very long games still lose points per turn (never zero)', scoreGame(won(300, 0, 0)).total > scoreGame(won(301, 0, 0)).total && scoreGame(won(1000, 0, 0)).total > 0);
  check('Score: one extra cargo beats 9 extra resources', scoreGame(won(20, 1, 0)).total > scoreGame(won(20, 0, 9)).total);
  check('Score: debt counts against cargo', scoreGame(won(20, 3, 0, 2)).cargo === 1);
  check('Score: lost games have no score', scoreGame({ ...base(), status: 'lost' }) === null); }
{ const s = newGame('standard'); Object.assign(s, { status: 'won', phase: 'over', endReason: 'Done', engine: { ionizer: true, combustor: true, nuclear: true, chamber: true } });
  const d = decodeState(encodeState(s));
  check('A won game shares and loads as won', !d.error && d.state.status === 'won');
  const fake = newGame('standard'); Object.assign(fake, { status: 'won', phase: 'over', endReason: 'Done' });
  check("A 'won' link without all engine parts repaired is rejected", !!decodeState(encodeState(fake)).error); }

console.log(results.join('\n'));
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\nRules test: ${passed}/${results.length} passed.`);
if (passed !== results.length) process.exit(1);
