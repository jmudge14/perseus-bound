// High score for a WON game (not part of the board-game rules; a digital-edition extra).
//
// Ranked, in order of importance:
//   1. Fewer turns             — 250,000 ÷ turns (diminishing returns, no upper bound needed)
//   2. More cargo left over    — 10 points per Element in the Cargo Bay (Debt counts against it)
//   3. More ship resources     — 1 point per point of Fuel, Air, Food, Hull and Power left
//
// Around 70 turns (a typical win) one turn is worth ~50 points = 5 Elements = 50 resource points.
// Shorter games are rewarded more steeply (at 30 turns a turn is worth ~280); longer games keep
// losing points ever more gently but never reach zero.
// Tune the weights here; everything that shows a score reads from this file.

export const SCORE_WEIGHTS = {
  turnNumerator: 250000, // turn points = turnNumerator ÷ turns (rounded)
  perElement: 10,
  perResource: 1,
};

const turnPointsFor = (turns) => Math.round(SCORE_WEIGHTS.turnNumerator / Math.max(1, turns));

const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + (b || 0), 0);

/** Score from the numbers stored in a high-score entry (so old entries follow weight changes). */
export function scoreFromParts(turns, cargo, resources) {
  const W = SCORE_WEIGHTS;
  return Math.max(0, turnPointsFor(turns) + W.perElement * cargo + W.perResource * resources);
}

/**
 * Score breakdown for a won game, or null if the game wasn't won.
 * { total, turns, turnPoints, cargo, cargoPoints, resources, resourcePoints }
 */
export function scoreGame(s) {
  if (!s || s.status !== 'won') return null;
  const W = SCORE_WEIGHTS;
  const turns = s.turn;
  const turnPoints = turnPointsFor(turns);
  const cargo = sum(s.cargo) - (s.debt || 0);
  const cargoPoints = W.perElement * cargo;
  const resources = sum(s.res);
  const resourcePoints = W.perResource * resources;
  return {
    total: Math.max(0, turnPoints + cargoPoints + resourcePoints),
    turns,
    turnPoints,
    cargo,
    cargoPoints,
    resources,
    resourcePoints,
  };
}

export const formatScore = (n) => n.toLocaleString('en-US');
