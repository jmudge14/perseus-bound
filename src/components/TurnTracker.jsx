import React, { useEffect, useRef, useState } from 'react';
import { RGB, flash } from './flash.js';
import { PHASE_STEPS, LOOT_TABLE, ELEMENT_INFO, MAINTENANCE, SHIP_INFO } from '../game/constants.js';
import { Cube, CostCubes, DieRange, Icon } from './Pieces.jsx';
import { outcomeColor } from './outcomeColors.js';

// ---------------------------------------------------------------------------
// Quick-reference content for each step (adapted from the printed Turn Reference)
// ---------------------------------------------------------------------------

export const WHEN = {
  travel: 'Every turn',
  scan: 'Optional',
  enemies: 'Every turn',
  battle: 'If you share a square with an enemy',
  contact: 'If you are on an unexplored planet',
  resolve: 'If you are on a planet',
  reduce: 'Automatic, after resolving a planet',
  maintenance: 'Optional — one operation',
};

const C = ({ k }) => <Cube k={k} size={16} />;

/** Outcome text in its resource colour, with its icon from assets/icons if one exists. */
export function Outcome({ c, children }) {
  return (
    <span className="pb-outcome" style={{ color: outcomeColor(c) }}>
      <Icon name={c} size={14} />
      {children}
    </span>
  );
}

/** Black-die consumption table (step 1), shared by the reference cards and the action panel. */
export function ConsumptionTable() {
  const rows = [
    [1, 1, 'Spotted by enemy sentinels — spawn an enemy vessel', 'enemy'],
    [2, 2, 'You took a nap — nothing consumed', 'neutral'],
    [3, 4, '−1 Air', 'air'],
    [5, 5, '−1 Power', 'power'],
    [6, 6, '−1 Food', 'food'],
  ];
  return (
    <table className="pb-ref-table pb-ref-dice">
      <tbody>
        {rows.map(([from, to, text, c]) => (
          <tr key={from}>
            <td>
              <DieRange from={from} to={to} kind="black" />
            </td>
            <td>
              <Outcome c={c}>{text}</Outcome>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const REFERENCE = {
  travel: ({ difficulty }) => (
    <>
      <p>
        <b>Roll black &amp; white.</b> Black = consumption:
      </p>
      <ConsumptionTable />
      <ul>
        <li>
          <b>Travel</b> up to white ÷ 2 (round up) squares in a straight line ← ↑ → ↓. Minimum 1 — you must move.
        </li>
        <li>−1 Rocket Fuel per square; −1 more if you end in open space.</li>
        <li>
          {difficulty === 'challenge' ? '2 squares: −1 Power. 3 squares: −3 Power.' : '3 squares: −1 Power.'}
        </li>
        <li>Stop on any planet or enemy vessel, and at the map edge.</li>
        <li>
          <b>Solar panels:</b> +2 Power whenever you end on any planet.
        </li>
      </ul>
    </>
  ),

  scan: () => (
    <ul>
      <li>
        <b>−2 Power</b> to fire the scanner.
      </li>
      <li>For each yellow die not on the map, roll coordinates (black = column, white = row) and place it there.</li>
      <li>Re-roll any coordinate that is already occupied.</li>
      <li>At most 3 unexplored planets exist at once.</li>
    </ul>
  ),

  enemies: () => (
    <ul>
      <li>
        <b>Black ÷ 2</b> (round down) ↔ horizontal, then <b>White ÷ 2</b> (round down) ↕ vertical.
      </li>
      <li>Every vessel moves toward you by the full amount and may overshoot your row or column.</li>
      <li>A vessel that reaches your square stops there — battle!</li>
      <li>Vessels can't pass each other and stop at the edge; they fly over planets.</li>
    </ul>
  ),

  battle: () => (
    <>
      <ul>
        <li>
          <b>Flee</b> (once, at the start): 1D6 4–6 escape 3 squares for 3 Fuel; 1–3 you lose, taking the 2D6
          difference as damage.
        </li>
        <li>
          <b>Shields:</b> spend up to 5 Power; each blocks 1 damage if you lose.
        </li>
        <li>
          <b>Roll:</b> you = black, enemy = white. Higher wins; ties go to the instigator (whoever moved onto whom).
        </li>
        <li>Loser takes the difference as Hull damage (minus shields).</li>
        <li>
          <b>Loot 1D6:</b> win → take that Element or +2 any ship resource. Lose → pay that Element or take Debt.
        </li>
      </ul>
      <table className="pb-ref-table pb-ref-loot">
        <tbody>
          {LOOT_TABLE.slice(1).map((k, i) => (
            <tr key={k}>
              <td>
                <DieRange from={i + 1} kind="d6" />
              </td>
              <td>
                <C k={k} /> <Outcome c={k}>{ELEMENT_INFO[k].name}</Outcome>
              </td>
              <td className="pb-dimtext">or {k === 'U' ? 4 : 2} Debt</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  ),

  contact: () => (
    <>
      <p>On an unexplored (yellow) planet, roll 1D6:</p>
      <table className="pb-ref-table pb-ref-dice">
        <tbody>
          <tr>
            <td><DieRange from={1} to={2} kind="d6" /></td>
            <td><Outcome c="hostile"><b>Hostile</b></Outcome> — swap for a red die of the same value</td>
          </tr>
          <tr>
            <td><DieRange from={3} to={6} kind="d6" /></td>
            <td><Outcome c="friendly"><b>Friendly</b></Outcome> — swap for a green die of the same value</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>If no die of that colour is left: hostile spawns an enemy at once; friendly leaves no planet.</li>
      </ul>
    </>
  ),

  resolve: () => (
    <>
      <p>
        <b>Hostile (red):</b> roll coordinates for an enemy vessel (never within 3 squares in a straight line of you).
      </p>
      <p>
        <b>Friendly (green):</b> choose <b>one</b>:
      </p>
      <table className="pb-ref-table pb-ref-gather">
        <thead>
          <tr><th colSpan={2}>Gather: roll black + white</th></tr>
        </thead>
        <tbody>
          <tr><td>2, 12</td><td><Outcome c="neutral">Nothing</Outcome></td></tr>
          <tr><td>3–4</td><td><Outcome c="Cu">+1 Copper</Outcome> <C k="Cu" /></td></tr>
          <tr><td>5–6</td><td><Outcome c="O2">+2 Oxygen</Outcome> <C k="O2" /></td></tr>
          <tr><td>7</td><td>Any 3 of <C k="C" /> <C k="O2" /> <C k="H2" /></td></tr>
          <tr><td>8–9</td><td><Outcome c="H2">+2 Hydrogen</Outcome> <C k="H2" /></td></tr>
          <tr><td>10–11</td><td><Outcome c="Ti">+1 Titanium</Outcome> <C k="Ti" /></td></tr>
        </tbody>
      </table>
      <ul>
        <li>
          <b>Trade</b> up to 3 Elements 1-for-1 for <C k="C" /> <C k="O2" /> <C k="H2" />.
        </li>
        <li>
          <b>Trade</b> 1D6 ≥ 3: 2 Elements → 1 <C k="Cu" /> or <C k="Ti" />. Two attempts.
        </li>
        <li>
          <b>Trade</b> 1D6 ≥ 4: 4 Elements → 1 <C k="U" />.
        </li>
        <li>
          <b>Borrow</b> up to 3 of one Element (not U), +2 Debt each.
        </li>
        <li>No trading while in debt.</li>
      </ul>
    </>
  ),

  reduce: () => (
    <ul>
      <li>The planet you visited loses 1 value.</li>
      <li>A planet already at 1 is removed and its die returns to the pool.</li>
      <li>Removing a friendly planet means you overstayed your welcome: spawn an enemy vessel.</li>
    </ul>
  ),

  maintenance: () => (
    <>
      <p>
        Choose <b>one</b>:
      </p>
      <ul className="pb-ref-maint">
        {MAINTENANCE.map((m) => (
          <li key={m.id}>
            <CostCubes cost={m.cost} size={16} /> →{' '}
            {Object.entries(m.gain)
              .map(([k, n]) => `+${n} ${SHIP_INFO[k].short}`)
              .join(', ')}
          </li>
        ))}
        <li>Repair 1 engine part (4 Elements, see Engine Repairs)</li>
      </ul>
      <p className="pb-note">Debt is always paid first: each Element you gain cancels 1 Debt.</p>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export default function TurnTracker({ phase, difficulty, steps = {}, ended = false }) {
  const [pinned, setPinned] = useState(null); // step id kept open by click/tap
  const [hover, setHover] = useState(null); // step id previewed by mouse hover / keyboard focus
  const rootRef = useRef(null);
  const activeIdx = PHASE_STEPS.findIndex((s) => s.phases.includes(phase));
  const shownId = hover ?? pinned;
  const shown = PHASE_STEPS.find((s) => s.id === shownId);
  const Body = shown ? REFERENCE[shown.id] : null;

  // Change highlights: steps that just finished or were skipped flash quickly in order,
  // then the new current step glows. Purely visual; nothing waits for it.
  const btnRefs = useRef({});
  const prevSteps = useRef(steps);
  const prevActive = useRef(activeIdx);
  useEffect(() => {
    const oldSteps = prevSteps.current || {};
    const oldActive = prevActive.current;
    prevSteps.current = steps;
    prevActive.current = activeIdx;
    let order = 0;
    PHASE_STEPS.forEach((st) => {
      const now = steps[st.id];
      const before = oldSteps[st.id];
      if (now && (!before || before.status !== now.status)) {
        flash(btnRefs.current[st.id], now.status === 'skipped' ? RGB.neutral : RGB.good, {
          duration: 600,
          delay: order++ * 90,
          strength: 0.2,
        });
      }
    });
    if (activeIdx !== oldActive && activeIdx >= 0) {
      flash(btnRefs.current[PHASE_STEPS[activeIdx].id], RGB.info, { duration: 900, delay: order * 90 });
    }
  }, [steps, activeIdx]);

  // Close a pinned card on Escape or a click outside the tracker.
  useEffect(() => {
    if (!pinned) return undefined;
    const onKey = (e) => e.key === 'Escape' && setPinned(null);
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setPinned(null);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [pinned]);

  return (
    <nav
      className={`pb-tracker ${ended ? 'is-ended' : ''}`}
      ref={rootRef}
      aria-label={ended ? 'Turn sequence (game over)' : 'Turn sequence'}
      onPointerLeave={() => setHover(null)}
    >
      <ol className="pb-tracker-steps">
        {PHASE_STEPS.map((s, i) => {
          const done = steps[s.id];
          // Current step wins; otherwise show what happened to it this turn (done / skipped).
          const cls =
            i === activeIdx
              ? 'is-active'
              : done
                ? `is-${done.status}`
                : activeIdx >= 0 && i < activeIdx
                  ? 'is-past'
                  : '';
          const statusText =
            i !== activeIdx && done ? `${done.status === 'skipped' ? 'Skipped' : 'Done'}${done.note ? `: ${done.note}` : ''}` : '';
          return (
            <li key={s.id} className={`pb-tstep ${cls} ${shownId === s.id ? 'is-open' : ''}`}>
              <button
                ref={(el) => (btnRefs.current[s.id] = el)}
                type="button"
                title={statusText ? `${s.n}. ${s.label} — ${statusText}` : `${s.n}. ${s.label}`}
                aria-expanded={pinned === s.id}
                aria-controls="pb-step-detail"
                aria-current={i === activeIdx ? 'step' : undefined}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(s.id)}
                onFocus={(e) => e.target.matches(':focus-visible') && setHover(s.id)}
                onBlur={() => setHover(null)}
                onClick={() => {
                  setHover(null);
                  setPinned((p) => (p === s.id ? null : s.id));
                }}
              >
                <span className="pb-tstep-n" aria-hidden="true">
                  {s.n}
                </span>
                <span className="pb-tstep-label">{s.label}</span>
                {statusText && <span className="pb-sr">{statusText}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {shown && (
        <div id="pb-step-detail" className="pb-step-detail" role="region" aria-label={`Step ${shown.n}: ${shown.label}`}>
          <div className="pb-step-detail-head">
            <span className="pb-tstep-n">{shown.n}</span>
            <div>
              <b>{shown.label}</b>
              <span className="pb-step-when">{WHEN[shown.id]}</span>
            </div>
            {PHASE_STEPS[activeIdx]?.id === shown.id && <span className="pb-here">You are here</span>}
            {PHASE_STEPS[activeIdx]?.id !== shown.id && steps[shown.id] && (
              <span className={`pb-step-status is-${steps[shown.id].status}`}>
                {steps[shown.id].status === 'skipped' ? 'Skipped this turn' : 'Done this turn'}
              </span>
            )}
            {pinned === shown.id && (
              <button type="button" className="pb-modal-x pb-step-close" onClick={() => setPinned(null)} aria-label="Close">
                ×
              </button>
            )}
          </div>
          {PHASE_STEPS[activeIdx]?.id !== shown.id && steps[shown.id]?.note && (
            <p className={`pb-step-note is-${steps[shown.id].status}`}>
              {steps[shown.id].status === 'skipped' ? 'Skipped' : 'This turn'}: {steps[shown.id].note}.
            </p>
          )}
          <div className="pb-step-detail-body">
            <Body difficulty={difficulty} />
          </div>
          {pinned !== shown.id && <p className="pb-note">Click the step to keep this open.</p>}
        </div>
      )}
    </nav>
  );
}
