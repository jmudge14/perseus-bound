// Personal best scores, kept in this browser (localStorage). Only your own wins are recorded;
// shared games you view are compared against this list but never added to it.

import { scoreGame, scoreFromParts } from './score.js';

const KEY = 'perseus-bound-scores-v1';

/** Today's date in the player's own time zone, as YYYY-MM-DD. */
function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const KEEP = 10;

export function loadHighScores() {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(list)) return [];
    // Re-score from the stored parts, so saved entries always use the current weights.
    return list
      .map((e) => ({ ...e, score: scoreFromParts(e.turns, e.cargo, e.resources) }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/** Record a won game; returns { list, rank } (rank is 1-based, or null if it didn't make the list). */
export function recordWin(state) {
  const sc = scoreGame(state);
  if (!sc) return { list: loadHighScores(), rank: null };
  const entry = {
    score: sc.total,
    turns: sc.turns,
    cargo: sc.cargo,
    resources: sc.resources,
    difficulty: state.difficulty,
    date: localDate(),
  };
  const list = [...loadHighScores(), entry].sort((a, b) => b.score - a.score).slice(0, KEEP);
  const idx = list.indexOf(entry);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return { list, rank: idx >= 0 ? idx + 1 : null };
}

/** Best score for a difficulty (or overall), or null. */
export function bestScore(difficulty) {
  const list = loadHighScores().filter((e) => !difficulty || e.difficulty === difficulty);
  return list.length ? list[0] : null;
}
