// Shareable game links.
//
// A game state is packed into a compact array, JSON-encoded, base64url-encoded and put in
// the URL fragment:
//
//   https://example.com/perseus-bound.html#s=<version>.<payload>.<checksum>
//
// <version> is SHARE_VERSION, a plain integer read *before* anything else is decoded.
// Bump it whenever pack()/unpack() or the rules change in a way that would make an old
// link load incorrectly. Links with any other version are rejected with a clear message.
// It is covered by the checksum, so it can't be edited by hand without breaking the link.
//
// The fragment (#…) is never sent to a web server, so this works on any static host.
// Shared: the full game position, this turn's step status, the game result (so finished games
// can be shared too), and the last 5 turns of the Captain's Log. Not shared: the dice tray and internal ids (renumbered on load).
// The checksum catches truncated or mistyped links. It is not tamper-proof: a determined
// player could hand-edit a link, which seems an acceptable trade-off for a solo game.

import {
  BOARD_SIZE,
  DICE_POOL,
  DIFFICULTY,
  ELEMENTS,
  ENGINE_PARTS,
  MAX_DEBT,
  MAX_ELEMENT,
  SHIP_KEYS,
  PHASE_STEPS,
} from './constants.js';
import { SAVE_VERSION } from './engine.js';

/**
 * Share-link format version. Increment on any breaking change to the packed layout,
 * the enum lists below, or rules that change what a saved state means.
 * Non-breaking additions (e.g. a new UI feature) do not need a bump.
 */
export const SHARE_VERSION = 1;
const HASH_KEY = 's';
const DIFFS = ['standard', 'challenge'];
const PHASES = ['roll', 'travel', 'scan', 'enemies', 'battle', 'contact', 'trade', 'maintenance', 'over'];
const STATUSES = ['playing', 'won', 'lost'];
const PLANET_TYPES = ['unknown', 'hostile', 'friendly'];
const INSTIGATORS = [null, 'player', 'enemy'];
const BATTLE_STAGES = ['choose', 'fleeDir', 'loot', 'lootChoice'];
const TRADE_STAGES = ['choose', 'gather7', 'cuti', 'uranium'];
const STEP_STATUS = [null, 'done', 'skipped'];
const LOG_TONES = ['info', 'good', 'bad', 'roll'];
/** How much of the Captain's Log travels with a share link. */
const SHARE_LOG_TURNS = 5; // the current turn and the 4 before it
const SHARE_LOG_MAX = 80; // hard cap on entries, to keep links a sensible length

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash, as a short base36 string. */
function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// UTF-8 safe base64url (log text contains characters such as — → − ₂).
const toBase64Url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (b64) => {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

// ---------------------------------------------------------------------------
// Pack / unpack
// ---------------------------------------------------------------------------

function pack(s) {
  const enemyIndex = new Map(s.enemies.map((e, i) => [e.id, i]));
  let battle = 0;
  if (s.battle && s.status === 'playing') {
    const { enemyId, ...rest } = s.battle;
    battle = { ...rest, e: enemyIndex.get(enemyId) ?? 0 };
  }
  return [
    DIFFS.indexOf(s.difficulty),
    s.turn,
    PHASES.indexOf(s.phase),
    s.player.x,
    s.player.y,
    SHIP_KEYS.map((k) => s.res[k]),
    ELEMENTS.map((k) => s.cargo[k]),
    s.debt,
    ENGINE_PARTS.reduce((bits, p, i) => bits | (s.engine[p.id] ? 1 << i : 0), 0),
    s.planets.flatMap((p) => [p.x, p.y, PLANET_TYPES.indexOf(p.type), p.value]),
    s.enemies.flatMap((e) => [e.x, e.y]),
    [s.t.maxTravel, s.t.collided ? 1 : 0, INSTIGATORS.indexOf(s.t.instigator)],
    battle,
    (s.status === 'playing' && s.trade) || 0,
    // This turn's step status (turn tracker): per step, 0 or [statusIndex, note].
    PHASE_STEPS.map((st) => {
      const v = s.t.steps?.[st.id];
      return v ? [STEP_STATUS.indexOf(v.status), v.note || ''] : 0;
    }),
    packLog(s),
    // Game result, so finished games can be shared: [statusIndex, endReason].
    [STATUSES.indexOf(s.status), s.endReason || ''],
  ];
}

/** Last few turns of the log: [indexOfFirstRecentEntry | -1, [[turn, toneIndex, text], ...]] */
function packLog(s) {
  const fromTurn = s.turn - (SHARE_LOG_TURNS - 1);
  const tail = s.log.filter((e) => e.turn >= fromTurn).slice(-SHARE_LOG_MAX);
  const mark = s.logMark ?? Infinity;
  return [
    tail.findIndex((e) => e.id >= mark),
    tail.map((e) => [e.turn, Math.max(0, LOG_TONES.indexOf(e.tone)), e.text]),
  ];
}

class ShareError extends Error {}
const fail = (msg) => {
  throw new ShareError(msg);
};
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const need = (cond, msg) => cond || fail(msg);
const coord = (v) => isInt(v, 1, BOARD_SIZE);

function unpack(a) {
  need(Array.isArray(a) && a.length === 17, 'Unrecognised link format.');
  const [di, turn, phi, px, py, res, cargo, debt, engineBits, planetsFlat, enemiesFlat, t, battle, trade, stepsA, logA, result] = a;

  const difficulty = DIFFS[di];
  need(difficulty, 'Unknown difficulty.');
  const cfg = DIFFICULTY[difficulty];
  need(isInt(turn, 1, 100000), 'Invalid turn number.');
  const phase = PHASES[phi];
  need(phase, 'Invalid turn phase.');
  need(Array.isArray(result) && result.length === 2, 'Invalid game result.');
  const status = STATUSES[result[0]];
  const endReason = result[1];
  need(status && typeof endReason === 'string' && endReason.length <= 300, 'Invalid game result.');
  need((status === 'playing') === (phase !== 'over'), 'Game result does not match the turn phase.');
  need(coord(px) && coord(py), 'Invalid ship position.');

  need(Array.isArray(res) && res.length === SHIP_KEYS.length, 'Invalid ship resources.');
  const resObj = {};
  SHIP_KEYS.forEach((k, i) => {
    need(isInt(res[i], 0, cfg.limits[k]), `Invalid ${k} value.`);
    resObj[k] = res[i];
  });

  need(Array.isArray(cargo) && cargo.length === ELEMENTS.length, 'Invalid cargo.');
  const cargoObj = {};
  ELEMENTS.forEach((k, i) => {
    need(isInt(cargo[i], 0, MAX_ELEMENT), `Invalid ${k} count.`);
    cargoObj[k] = cargo[i];
  });
  // A game lost to debt ends above 6 (a Uranium ransom adds 4).
  need(isInt(debt, 0, status === 'lost' ? MAX_DEBT + 4 : MAX_DEBT), 'Invalid debt.');
  const allRepaired = (1 << ENGINE_PARTS.length) - 1;
  need(isInt(engineBits, 0, allRepaired), 'Invalid engine status.');
  // All parts repaired means the game was won (and only then).
  need((engineBits === allRepaired) === (status === 'won'), 'Engine status does not match the game result.');
  const engine = Object.fromEntries(ENGINE_PARTS.map((p, i) => [p.id, !!(engineBits & (1 << i))]));

  let nextId = 1;
  need(Array.isArray(planetsFlat) && planetsFlat.length % 4 === 0, 'Invalid planets.');
  const planets = [];
  const typeCount = { unknown: 0, hostile: 0, friendly: 0 };
  const planetSquares = new Set();
  for (let i = 0; i < planetsFlat.length; i += 4) {
    const [x, y, ti, value] = planetsFlat.slice(i, i + 4);
    const type = PLANET_TYPES[ti];
    need(coord(x) && coord(y) && type && isInt(value, 1, 6), 'Invalid planet.');
    need(!planetSquares.has(`${x},${y}`), 'Two planets share a square.');
    planetSquares.add(`${x},${y}`);
    typeCount[type]++;
    planets.push({ id: nextId++, x, y, type, value });
  }
  for (const k of PLANET_TYPES) need(typeCount[k] <= DICE_POOL[k], 'Too many planets of one kind.');

  need(Array.isArray(enemiesFlat) && enemiesFlat.length % 2 === 0, 'Invalid enemy vessels.');
  const enemies = [];
  for (let i = 0; i < enemiesFlat.length; i += 2) {
    const [x, y] = enemiesFlat.slice(i, i + 2);
    need(coord(x) && coord(y), 'Invalid enemy vessel.');
    enemies.push({ id: nextId++, x, y });
  }

  need(Array.isArray(t) && t.length === 3, 'Invalid turn data.');
  need(isInt(t[0], 0, 3) && isInt(t[1], 0, 1) && isInt(t[2], 0, 2), 'Invalid turn data.');
  need(Array.isArray(stepsA) && stepsA.length === PHASE_STEPS.length, 'Invalid turn steps.');
  const steps = {};
  stepsA.forEach((v, i) => {
    if (v === 0) return;
    need(Array.isArray(v) && isInt(v[0], 1, 2) && typeof v[1] === 'string' && v[1].length <= 200, 'Invalid turn steps.');
    steps[PHASE_STEPS[i].id] = { status: STEP_STATUS[v[0]], note: v[1] };
  });
  const turnState = { maxTravel: t[0], collided: t[1] === 1, instigator: INSTIGATORS[t[2]], steps };
  if (phase === 'travel') need(turnState.maxTravel >= 1, 'Invalid travel distance.');

  const onPlayer = (e) => e.x === px && e.y === py;

  let battleObj = null;
  if (phase === 'battle') {
    need(battle && typeof battle === 'object', 'Missing battle data.');
    need(BATTLE_STAGES.includes(battle.stage), 'Invalid battle stage.');
    const enemy = enemies[battle.e];
    need(enemy && onPlayer(enemy), 'Battle enemy is not at your position.');
    need(turnState.instigator, 'Missing battle instigator.');
    if (battle.stage === 'loot' || battle.stage === 'lootChoice') need(typeof battle.playerWon === 'boolean', 'Invalid battle result.');
    if (battle.stage === 'lootChoice') need(battle.playerWon && ELEMENTS.includes(battle.lootEl), 'Invalid loot.');
    battleObj = {
      enemyId: enemy.id,
      stage: battle.stage,
      count: enemies.filter(onPlayer).length,
      ...(typeof battle.playerWon === 'boolean' ? { playerWon: battle.playerWon } : {}),
      ...(battle.stage === 'lootChoice' ? { lootEl: battle.lootEl } : {}),
      ...(isInt(battle.shields, 0, 5) ? { shields: battle.shields } : {}),
    };
  } else {
    need(battle === 0, 'Unexpected battle data.');
  }

  let tradeObj = null;
  if (phase === 'trade') {
    need(trade && typeof trade === 'object' && TRADE_STAGES.includes(trade.stage), 'Invalid trade data.');
    const here = planets.find((p) => p.x === px && p.y === py);
    need(here && here.type === 'friendly', 'Trading away from a friendly planet.');
    tradeObj = { stage: trade.stage };
    if (trade.stage === 'cuti' || trade.stage === 'uranium') {
      need(isInt(trade.roll, 1, 6) && typeof trade.success === 'boolean' && typeof trade.resolved === 'boolean', 'Invalid trade data.');
      Object.assign(tradeObj, { roll: trade.roll, success: trade.success, resolved: trade.resolved });
      if (trade.stage === 'cuti') {
        need(isInt(trade.attempt, 1, 2), 'Invalid trade data.');
        tradeObj.attempt = trade.attempt;
      }
    }
  } else {
    need(trade === 0, 'Unexpected trade data.');
  }

  if (phase === 'contact') {
    const here = planets.find((p) => p.x === px && p.y === py);
    need(here && here.type === 'unknown', 'Contact step without an unexplored planet.');
  }

  // Captain's Log (last few turns), then a note that the mission was resumed from a link.
  need(Array.isArray(logA) && logA.length === 2 && Number.isInteger(logA[0]) && Array.isArray(logA[1]), 'Invalid log.');
  need(logA[1].length <= SHARE_LOG_MAX, 'Invalid log.');
  const log = logA[1].map((e) => {
    need(Array.isArray(e) && isInt(e[0], 1, turn) && LOG_TONES[e[1]] && typeof e[2] === 'string' && e[2].length <= 400, 'Invalid log.');
    return { id: nextId++, turn: e[0], tone: LOG_TONES[e[1]], text: e[2] };
  });
  const resumed = {
    id: nextId++,
    turn,
    text:
      status === 'playing'
        ? `Mission resumed from a shared link (${cfg.name}, turn ${turn}).`
        : `Viewing a shared ${status === 'won' ? 'completed' : 'failed'} mission (${cfg.name}, turn ${turn}).`,
    tone: 'info',
  };
  const logMark = logA[0] >= 0 && logA[0] < log.length ? log[logA[0]].id : resumed.id;
  log.push(resumed);

  return {
    v: SAVE_VERSION,
    difficulty,
    limits: { ...cfg.limits },
    res: resObj,
    cargo: cargoObj,
    debt,
    engine,
    player: { x: px, y: py },
    planets,
    enemies,
    nextId,
    turn,
    phase,
    status,
    endReason: status === 'playing' ? null : endReason,
    t: turnState,
    battle: battleObj,
    trade: tradeObj,
    rolls: [],
    rollSeq: 0,
    pending: [],
    log,
    logMark,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encode a game state as a share code (the part after `#s=`): "<version>.<payload>.<checksum>". */
export function encodeState(state) {
  const body = `${SHARE_VERSION}.${toBase64Url(JSON.stringify(pack(state)))}`;
  return `${body}.${checksum(body)}`;
}

/**
 * Decode a share code. Returns { state } or { error }; on a version mismatch the result
 * also carries { version } so the UI can say whether the link is older or newer.
 */
export function decodeState(code) {
  try {
    const parts = String(code).trim().split('.');
    need(parts.length === 3 && parts.every(Boolean), 'The link is incomplete.');
    const [versionText, payload, sum] = parts;

    // 1. Version gate — checked before anything else is trusted or decoded.
    need(/^\d{1,6}$/.test(versionText), 'The link is damaged (missing version).');
    const version = Number(versionText);
    if (version !== SHARE_VERSION) {
      const msg =
        version < SHARE_VERSION
          ? `This link was made with an older version of Perseus Bound (link v${version}, game v${SHARE_VERSION}) and can't be loaded.`
          : `This link was made with a newer version of Perseus Bound (link v${version}, game v${SHARE_VERSION}). Try reloading the page to get the latest version.`;
      return { error: msg, version };
    }

    // 2. Integrity check over version + payload.
    need(checksum(`${versionText}.${payload}`) === sum, 'The link appears to be damaged or incomplete.');
    let data;
    try {
      data = JSON.parse(fromBase64Url(payload));
    } catch {
      fail('The link appears to be damaged or incomplete.');
    }
    return { state: unpack(data) };
  } catch (e) {
    return { error: e instanceof ShareError ? e.message : 'The link could not be read.' };
  }
}

/**
 * The page URL that share links should point to. When the game is embedded in a blog
 * post via <iframe>, the post can pass its own address as ?shareBase=… so links open
 * the post instead of the bare game file (see README).
 */
/** Where the game is published. Share links made from a copy opened from disk point here. */
export const PUBLIC_URL = 'https://mudge.dev/apps/perseus-bound.html';

export function shareBaseUrl() {
  try {
    const base = new URLSearchParams(window.location.search).get('shareBase');
    if (base) {
      const u = new URL(base);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        u.hash = '';
        return u.toString();
      }
    }
  } catch {
    /* fall through */
  }
  // A copy opened straight from disk (file://) would make links nobody else can open, so point those at the
  // public site instead. Anywhere else (the public site, another host, a local dev server) uses its own address.
  if (window.location.protocol === 'file:') return PUBLIC_URL;
  return window.location.href.split('#')[0];
}

export function shareUrl(state) {
  return `${shareBaseUrl()}#${HASH_KEY}=${encodeState(state)}`;
}

/** Read a share code from the current URL fragment. Returns null if there isn't one. */
export function readShareFromLocation() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const code = params.get(HASH_KEY);
  return code ? decodeState(code) : null;
}

/** Remove the share code from the address bar without reloading. */
export function clearShareFromLocation() {
  try {
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + search);
  } catch {
    /* ignore */
  }
}
