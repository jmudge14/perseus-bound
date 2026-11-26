import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DIFFICULTY, DICE_POOL } from './game/constants.js';
import { act, newGame, travelOptions, fleeOptions, SAVE_VERSION } from './game/engine.js';
import Board from './components/Board.jsx';
import ActionPanel from './components/ActionPanel.jsx';
import { ShipTracker, CargoBay, EngineRepairs, DiceTray, Log } from './components/Panels.jsx';
import { ShipToken, Icon } from './components/Pieces.jsx';
import { backgroundArt } from './assets/index.js';
import RulesModal from './components/RulesModal.jsx';
import ShareModal from './components/ShareModal.jsx';
import CreditsModal from './components/CreditsModal.jsx';
import TurnTracker from './components/TurnTracker.jsx';
import { readShareFromLocation, clearShareFromLocation } from './game/share.js';
import { scoreGame, formatScore, SCORE_WEIGHTS } from './game/score.js';
import { loadHighScores, recordWin, bestScore } from './game/highscores.js';

const SAVE_KEY = 'perseus-bound-save-v1';

// localStorage can be unavailable (privacy modes, some embeds), so every access is guarded.
function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.v === SAVE_VERSION && s.status === 'playing' ? s : null;
  } catch {
    return null;
  }
}
function writeSave(s) {
  try {
    if (s && s.status === 'playing') window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [state, setState] = useState(null);
  const [saved, setSaved] = useState(() => loadSave());
  const [showRules, setShowRules] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  // Hover preview of an action's effect: { gain, cost } — shown in Ship Resources and Cargo Bay.
  const [preview, setPreview] = useState(null);
  // A game arriving via a share link: { state } or { error }. Shown on the title screen.
  const [incoming, setIncoming] = useState(() => readShareFromLocation());
  // True while looking at someone else's finished game: it is view-only and never touches your save.
  const [viewing, setViewing] = useState(false);
  const [highScores, setHighScores] = useState(() => loadHighScores());
  const [lastRank, setLastRank] = useState(null);

  const dispatch = useCallback((action) => setState((s) => act(s, action)), []);

  useEffect(() => {
    if (state && !viewing) writeSave(state);
    setPreview(null);
  }, [state, viewing]);

  // Record your own wins in the personal high-score list (once, when the game is won).
  const prevStatus = React.useRef(null);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state?.status ?? null;
    if (state?.status === 'won' && was === 'playing' && !viewing) {
      const { list, rank } = recordWin(state);
      setHighScores(list);
      setLastRank(rank);
    }
  }, [state, viewing]);

  // Pasting a share link into the address bar of an open tab only changes the hash,
  // so listen for that too. The current game is autosaved, so returning to the title is safe.
  useEffect(() => {
    const onHash = () => {
      const found = readShareFromLocation();
      if (!found) return;
      setIncoming(found);
      setSaved(loadSave());
      setShowShare(false);
      setState(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const acceptShared = () => {
    const finished = incoming.state.status !== 'playing';
    setViewing(finished); // a finished game is view-only and leaves your own save alone
    setLastRank(null);
    setState(incoming.state);
    setIncoming(null);
    if (!finished) setSaved(null);
    clearShareFromLocation(); // so a refresh resumes the local autosave instead of re-loading the link
  };

  const dismissShared = () => {
    setIncoming(null);
    clearShareFromLocation();
  };

  const options = useMemo(() => {
    if (!state || state.status !== 'playing') return [];
    if (state.phase === 'travel') return travelOptions(state, state.t.maxTravel);
    if (state.phase === 'battle' && state.battle?.stage === 'fleeDir') return fleeOptions(state);
    return [];
  }, [state]);

  const onPick = (x, y) => {
    if (state.phase === 'travel') dispatch({ type: 'TRAVEL', x, y });
    else dispatch({ type: 'BATTLE_FLEE_MOVE', x, y });
  };

  const start = (difficulty) => {
    setViewing(false);
    setLastRank(null);
    setSaved(null);
    setState(newGame(difficulty));
  };

  const quit = () => {
    if (viewing) {
      // Leaving a shared game you were only viewing: your own save is untouched.
      setViewing(false);
      setSaved(loadSave());
      setState(null);
      return;
    }
    if (state?.status === 'playing' && !window.confirm('Abandon this mission and return to the title screen?')) return;
    writeSave(null);
    setSaved(null);
    setState(null);
  };

  return (
    <div className="pb-app">
      <div
        className="pb-stars"
        aria-hidden="true"
        style={backgroundArt() ? { backgroundImage: `url(${backgroundArt()})` } : undefined}
      />
      {!state ? (
        <TitleScreen
          saved={saved}
          incoming={incoming}
          onAcceptShared={acceptShared}
          onDismissShared={dismissShared}
          onStart={(d) => {
            dismissShared();
            start(d);
          }}
          onResume={() => {
            dismissShared();
            setState(saved);
          }}
          onRules={() => setShowRules(true)}
          onCredits={() => setShowCredits(true)}
          highScores={highScores}
        />
      ) : (
        <>
          <header className="pb-header">
            <h1 className="pb-title">Perseus Bound</h1>
            <span className="pb-badge">{DIFFICULTY[state.difficulty].name}</span>
            <span className="pb-spacer" />
            <CreditsLink onClick={() => setShowCredits(true)} />
            {viewing && <span className="pb-badge pb-badge-view">Viewing a shared mission</span>}
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => setShowShare(true)}>
              <Icon name="share" size={14} /> Share
            </button>
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => setShowRules(true)}>
              Rules
            </button>
            <button type="button" className="pb-btn pb-btn-sm" onClick={quit}>
              New game
            </button>
          </header>

          {/* Always rendered (greyed out once the game is over) so the layout never jumps. */}
          <TurnTracker
            phase={state.phase}
            difficulty={state.difficulty}
            steps={state.t?.steps || {}}
            ended={state.status !== 'playing'}
          />

          <main className="pb-layout">
            <div className="pb-col-board">
              <Board state={state} options={options} onPick={onPick} />
              <Legend state={state} />
              <EngineRepairs state={state} onRepair={(id) => dispatch({ type: 'REPAIR', id })} onPreview={setPreview} />
            </div>
            <div className="pb-col-feed">
              <DiceTray state={state} />
              <Log state={state} />
            </div>
            <div className="pb-col-side">
              {state.status === 'playing' ? (
                <ActionPanel state={state} dispatch={dispatch} onPreview={setPreview} />
              ) : (
                <GameOver
                  state={state}
                  viewing={viewing}
                  rank={lastRank}
                  onAgain={() => start(state.difficulty)}
                  onTitle={quit}
                />
              )}
              <ShipTracker state={state} preview={preview} />
              <CargoBay state={state} preview={preview} />
            </div>
          </main>
        </>
      )}
      {showRules && <RulesModal difficulty={state?.difficulty} onClose={() => setShowRules(false)} />}
      {showShare && state && <ShareModal state={state} onClose={() => setShowShare(false)} />}
      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    </div>
  );
}

function Legend({ state }) {
  // Planet dice on the map vs. how many of that colour exist (e.g. "Unexplored (2/3)").
  const dice = (type, label) => {
    const onMap = state.planets.filter((p) => p.type === type).length;
    const total = DICE_POOL[type];
    return (
      <span title={`${onMap} of ${total} ${label.toLowerCase()} planet dice are on the map; ${total - onMap} left in the pool`}>
        <i className={`pb-sw pb-sw-${type}`} /> {label}{' '}
        <span className={`pb-legend-count ${onMap === total ? 'is-full' : ''}`}>
          ({onMap}/{total})
        </span>
      </span>
    );
  };
  return (
    <div className="pb-legend">
      {dice('unknown', 'Unexplored')}
      {dice('friendly', 'Friendly')}
      {dice('hostile', 'Hostile')}
      <span><ShipToken kind="player" size={16} /> You</span>
      <span><ShipToken kind="enemy" size={16} /> Enemy</span>
    </div>
  );
}

function SharedBanner({ incoming, saved, onAccept, onDismiss }) {
  if (incoming.error) {
    return (
      <div className="pb-panel pb-shared is-error" role="alert">
        <b>This shared link couldn't be loaded.</b>
        <p>{incoming.error}</p>
        <button type="button" className="pb-btn pb-btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  }
  const s = incoming.state;
  const repaired = Object.values(s.engine).filter(Boolean).length;
  if (s.status !== 'playing') {
    const sc = scoreGame(s);
    const best = bestScore(s.difficulty);
    return (
      <div className="pb-panel pb-shared" role="region" aria-label="Shared mission">
        <b>Someone shared a {s.status === 'won' ? 'completed' : 'failed'} mission</b>
        <p>
          {DIFFICULTY[s.difficulty].name} · {s.status === 'won' ? 'won' : 'lost'} on turn {s.turn}
          {sc ? (
            <>
              {' '}
              · score <b>{formatScore(sc.total)}</b>
            </>
          ) : (
            ` · ${repaired}/4 engine parts repaired`
          )}
        </p>
        {sc && best && (
          <p className="pb-note">
            Your best {DIFFICULTY[s.difficulty].name} score: {formatScore(best.score)}
            {sc.total > best.score ? ' — they beat it!' : sc.total === best.score ? ' — a tie!' : ''}
          </p>
        )}
        <p className="pb-note">View-only: your own saved game is not affected.</p>
        <div className="pb-row pb-center">
          <button type="button" className="pb-btn pb-btn-primary" onClick={onAccept}>
            View mission
          </button>
          <button type="button" className="pb-btn" onClick={onDismiss}>
            No thanks
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="pb-panel pb-shared" role="region" aria-label="Shared mission">
      <b>Someone shared a mission with you</b>
      <p>
        {DIFFICULTY[s.difficulty].name} · turn {s.turn} · {repaired}/4 engine parts repaired · {s.enemies.length} enemy
        vessel{s.enemies.length === 1 ? '' : 's'} on the map
      </p>
      {saved && (
        <p className="pb-note">Taking over this mission replaces your own saved game (turn {saved.turn}).</p>
      )}
      <div className="pb-row pb-center">
        <button type="button" className="pb-btn pb-btn-primary" onClick={onAccept}>
          Take command
        </button>
        <button type="button" className="pb-btn" onClick={onDismiss}>
          No thanks
        </button>
      </div>
    </div>
  );
}

function TitleScreen({ saved, incoming, onAcceptShared, onDismissShared, onStart, onResume, onRules, onCredits, highScores = [] }) {
  return (
    <div className="pb-titlescreen">
      <div className="pb-hero-tokens" aria-hidden="true">
        <ShipToken kind="player" size={64} />
      </div>
      <h1 className="pb-title pb-title-xl">Perseus Bound</h1>
      <p className="pb-tagline">A single-player resource management survival game</p>
      {incoming && <SharedBanner incoming={incoming} saved={saved} onAccept={onAcceptShared} onDismiss={onDismissShared} />}
      <p className="pb-intro">
        Your prototype interstellar vessel is stranded in an unexplored star system in the Perseus Arm of the Milky Way. A
        meteorite wrecked your thermonuclear engines and forced you to jettison all of your Uranium. You know the way home.
        To get there you'll need to scavenge, trade and fight for resources, keep your crew alive, and repair your engine.
        And you may find you're not alone out here.
      </p>
      <div className="pb-start">
        {Object.entries(DIFFICULTY).map(([id, d]) => (
          <button key={id} type="button" className="pb-opt pb-start-opt" onClick={() => onStart(id)}>
            <b>{d.name}</b>
            <span>{d.blurb}</span>
          </button>
        ))}
      </div>
      <div className="pb-row pb-center">
        {saved && (
          <button type="button" className="pb-btn pb-btn-primary" onClick={onResume}>
            Resume mission (turn {saved.turn})
          </button>
        )}
        <button type="button" className="pb-btn" onClick={onRules}>
          How to play
        </button>
      </div>
      {highScores.length > 0 && <HighScores list={highScores} />}
      <p className="pb-titlescreen-foot">
        <CreditsLink onClick={onCredits} />
      </p>
    </div>
  );
}

/** Small, low-key link to the Credits page. */
function CreditsLink({ onClick }) {
  return (
    <button type="button" className="pb-creditslink" onClick={onClick}>
      Credits
    </button>
  );
}

function HighScores({ list }) {
  return (
    <section className="pb-panel pb-scores" aria-label="Your best scores">
      <h2 className="pb-h">Your best scores</h2>
      <ol>
        {list.slice(0, 5).map((e, i) => (
          <li key={i}>
            <span className="pb-scores-rank">{i + 1}</span>
            <b>{formatScore(e.score)}</b>
            <span className="pb-dimtext">
              {DIFFICULTY[e.difficulty]?.name || e.difficulty} · {e.turns} turns · {e.cargo} cargo · {e.date}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Score breakdown for a won game (turns, cargo, resources), in order of importance. */
function ScoreCard({ state }) {
  const sc = scoreGame(state);
  if (!sc) return null;
  const W = SCORE_WEIGHTS;
  return (
    <div className="pb-scorecard">
      <div className="pb-score-total">
        Score <b>{formatScore(sc.total)}</b>
      </div>
      <table>
        <tbody>
          <tr>
            <td>Turns</td>
            <td>{sc.turns}</td>
            <td title={`${formatScore(W.turnNumerator)} ÷ turns`}>{formatScore(sc.turnPoints)}</td>
          </tr>
          <tr>
            <td>Cargo left (minus debt)</td>
            <td>{sc.cargo}</td>
            <td title={`${W.perElement} points per Element`}>{formatScore(sc.cargoPoints)}</td>
          </tr>
          <tr>
            <td>Ship resources left</td>
            <td>{sc.resources}</td>
            <td title={`${W.perResource} points per resource point`}>{formatScore(sc.resourcePoints)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GameOver({ state, viewing, rank, onAgain, onTitle }) {
  const won = state.status === 'won';
  const sc = scoreGame(state);
  const best = viewing && sc ? bestScore(state.difficulty) : null;
  return (
    <section className={`pb-panel pb-over ${won ? 'is-won' : 'is-lost'}`} role="alert">
      <h2 className="pb-title-sm">
        {viewing ? 'Shared mission: ' : ''}
        {won ? 'Mission Accomplished' : 'Lost in the Perseus Arm'}
      </h2>
      <p>{state.endReason}</p>
      {!won && <p className="pb-dimtext">Survived {state.turn} turn{state.turn === 1 ? '' : 's'}.</p>}
      <ScoreCard state={state} />
      {!viewing && rank && <p className="pb-good pb-rank">New personal best #{rank}!</p>}
      {best && (
        <p className="pb-note">
          Your best {DIFFICULTY[state.difficulty].name} score: {formatScore(best.score)}
        </p>
      )}
      <div className="pb-row">
        <button type="button" className="pb-btn pb-btn-primary" onClick={onAgain}>
          {viewing ? 'Play a new game' : 'Play again'}
        </button>
        <button type="button" className="pb-btn" onClick={onTitle}>
          Title screen
        </button>
      </div>
    </section>
  );
}
