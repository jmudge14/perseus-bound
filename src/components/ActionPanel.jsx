import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fadeIn, useChange } from './flash.js';
import { ELEMENTS, ELEMENT_INFO, SHIP_KEYS, SHIP_INFO, MAINTENANCE, LOOT_TABLE } from '../game/constants.js';
import { canAfford, canScan, poolCount, currentPlanet, enemiesAt, maxBorrow, travelPowerCost, gainPreview } from '../game/engine.js';
import { Cube, CostCubes, DieRange, Icon } from './Pieces.jsx';
import { ConsumptionTable, Outcome } from './TurnTracker.jsx';

// ---------------------------------------------------------------------------
// Element picker: +/- counters per element, with caps
// ---------------------------------------------------------------------------

function Picker({ keys = ELEMENTS, value, onChange, maxFor, total }) {
  const sum = Object.values(value).reduce((a, b) => a + b, 0);
  return (
    <div className="pb-picker">
      {keys.map((k) => {
        const n = value[k] || 0;
        const cap = maxFor ? maxFor(k) : Infinity;
        return (
          <div key={k} className="pb-pick">
            <Cube k={k} size={22} />
            <button
              type="button"
              className="pb-btn pb-btn-xs"
              aria-label={`Fewer ${ELEMENT_INFO[k].name}`}
              disabled={n <= 0}
              onClick={() => onChange({ ...value, [k]: n - 1 })}
            >
              −
            </button>
            <span className="pb-pick-n">{n}</span>
            <button
              type="button"
              className="pb-btn pb-btn-xs"
              aria-label={`More ${ELEMENT_INFO[k].name}`}
              disabled={n >= cap || sum >= total}
              onClick={() => onChange({ ...value, [k]: n + 1 })}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Wraps an option that may be unavailable. When `why` is set, hovering the (disabled) option
 * shows the reason over it, and it is also the tooltip. Disabled buttons don't receive mouse
 * events, so the hover is handled by this wrapper.
 */
const WhyNot = ({ why, children }) => (
  <span className={`pb-opt-wrap ${why ? 'has-why' : ''}`} data-why={why || undefined} title={why || undefined}>
    {children}
  </span>
);

/** Inline element cube for option text. */
const E = ({ k }) => <Cube k={k} size={16} />;

const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Phase views
// ---------------------------------------------------------------------------

function RollView({ state, dispatch }) {
  return (
    <>
      <p>
        Roll the black and white dice. <b>Black</b> decides what your crew consumes; <b>white</b> sets how far you can
        travel (half, rounded up).
      </p>
      <ConsumptionTable />
      <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'ROLL_TURN' })}>
        Roll dice
      </button>
    </>
  );
}

function TravelView({ state }) {
  const max = state.t.maxTravel;
  return (
    <>
      <p>
        Travel up to <b>{max}</b> square{max > 1 ? 's' : ''} in a straight line. Click a highlighted square on the map.
      </p>
      <ul className="pb-bullets">
        <li>Landing on a planet: 1 Fuel per square, +2 Power from solar panels.</li>
        <li>Ending in open space: 1 extra Fuel.</li>
        <li>
          {state.difficulty === 'challenge'
            ? `Power: 2 squares costs ${travelPowerCost(state, 2)}, 3 squares costs ${travelPowerCost(state, 3)}.`
            : 'Travelling 3 squares costs 1 Power.'}
        </li>
        <li>You stop when you reach a planet or an enemy vessel (which starts a battle you instigate).</li>
      </ul>
    </>
  );
}

function ScanView({ state, dispatch }) {
  const n = poolCount(state, 'unknown');
  return (
    <>
      <p>
        Spend <b>2 Power</b> to fire your scanner and locate <b>{n}</b> more unexplored planet
        {n > 1 ? 's' : ''} (one for each yellow die not on the map).
      </p>
      <div className="pb-row">
        <button type="button" className="pb-btn pb-btn-primary" disabled={!canScan(state)} onClick={() => dispatch({ type: 'SCAN' })}>
          Scan (−2 Power)
        </button>
        <button type="button" className="pb-btn" onClick={() => dispatch({ type: 'SKIP_SCAN' })}>
          Skip
        </button>
      </div>
    </>
  );
}

function EnemiesView({ dispatch }) {
  return (
    <>
      <p>
        Enemy vessels close in. Black die ÷ 2 (round down) = horizontal moves, white die ÷ 2 = vertical moves, always
        toward you. They overshoot if the roll is high, and stop if they reach you.
      </p>
      <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'MOVE_ENEMIES' })}>
        Roll enemy movement
      </button>
    </>
  );
}

function BattleView({ state, dispatch, onPreview }) {
  const B = state.battle;
  const [shields, setShields] = useState(0);
  const maxShields = Math.min(5, state.res.power);
  useEffect(() => setShields((v) => Math.min(v, maxShields)), [maxShields]);
  if (!B) return null;
  const here = enemiesAt(state, state.player.x, state.player.y).length;
  const inst = state.t.instigator === 'player' ? 'You are the instigator and win ties.' : 'The enemy is the instigator and wins ties.';

  if (B.stage === 'choose') {
    return (
      <>
        <p className="pb-alert">
          <Icon name="battle" size={18} /> Enemy vessel engaged{here > 1 ? ` (1 of ${here})` : ''}. {inst}
        </p>
        <div className="pb-subcard">
          <h4>Fight</h4>
          <p>Raise shields first: each Power blocks 1 damage if you lose (spent either way, max 5).</p>
          <div className="pb-row pb-inline-action">
            <label className="pb-shields">
              Shields
              <input
                type="range"
                min={0}
                max={maxShields}
                value={shields}
                onChange={(e) => setShields(Number(e.target.value))}
                disabled={maxShields === 0}
              />
              <b>{shields}</b>
            </label>
            <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'BATTLE_FIGHT', shields })}>
              Roll for victory
            </button>
          </div>
        </div>
        <div className="pb-subcard">
          <h4>Flee</h4>
          <div className="pb-row pb-inline-action">
            <span className="pb-flee-rule">
              {state.res.fuel < 3
                ? 'You need at least 3 Fuel to flee.'
                : '1D6: 4–6 escape 3 squares (−3 Fuel); 1–3 you lose, without shields.'}
            </span>
            <button
              type="button"
              className="pb-btn"
              disabled={state.res.fuel < 3}
              onClick={() => dispatch({ type: 'BATTLE_FLEE' })}
            >
              Attempt to flee
            </button>
          </div>
        </div>
      </>
    );
  }

  if (B.stage === 'fleeDir') {
    return <p>Escape! Click a highlighted square on the map to burn 3 squares in that direction (−3 Fuel).</p>;
  }

  if (B.stage === 'loot') {
    return (
      <>
        <p className={B.playerWon ? 'pb-good' : 'pb-alert'}>
          {B.playerWon ? 'Victory! Roll to see what you can loot.' : 'Defeat. Roll to see what ransom they demand.'}
        </p>
        <LootTable />
        <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'BATTLE_LOOT' })}>
          Roll for {B.playerWon ? 'loot' : 'ransom'}
        </button>
      </>
    );
  }

  if (B.stage === 'lootChoice') {
    return (
      <>
        <p className="pb-good">Choose your spoils:</p>
        <div className="pb-row pb-wrap">
          <button
            type="button"
            className="pb-btn pb-btn-primary"
            onClick={() => dispatch({ type: 'BATTLE_LOOT_CHOOSE', kind: 'element' })}
          >
            +1 <Cube k={B.lootEl} size={18} /> {ELEMENT_INFO[B.lootEl].name}
          </button>
          {SHIP_KEYS.map((k) => {
            const [e] = gainPreview(state, { [k]: 2 });
            const show = () => onPreview({ gain: { [k]: 2 } });
            const hide = () => onPreview(null);
            return (
              <button
                key={k}
                type="button"
                className={`pb-btn ${e.wasted ? 'is-warn' : ''}`}
                disabled={e.gained === 0}
                title={e.wasted && e.gained ? `Only +${e.gained} fits (${e.wasted} wasted)` : undefined}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={() => {
                  hide();
                  dispatch({ type: 'BATTLE_LOOT_CHOOSE', kind: 'ship', key: k });
                }}
              >
                +2 {SHIP_INFO[k].short}
                {e.wasted > 0 && e.gained > 0 && <span className="pb-waste">+{e.gained} fits</span>}
              </button>
            );
          })}
        </div>
      </>
    );
  }
  return null;
}

function LootTable() {
  return (
    <table className="pb-mini pb-loot">
      <tbody>
        {LOOT_TABLE.slice(1).map((k, i) => (
          <tr key={k}>
            <td>
              <DieRange from={i + 1} kind="d6" size={16} />
            </td>
            <td>
              <Cube k={k} size={16} /> <Outcome c={k}>{ELEMENT_INFO[k].name}</Outcome>
            </td>
            <td className="pb-dimtext">or {k === 'U' ? 4 : 2} debt</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContactView({ dispatch }) {
  return (
    <>
      <p>
        You've reached an unexplored planet. Hail the inhabitants: roll 1D6. On <b>1–2</b> they are hostile, on{' '}
        <b>3–6</b> friendly.
      </p>
      <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'CONTACT' })}>
        Make contact
      </button>
    </>
  );
}

// ----- Friendly planet: gather or trade -----

function TradeView({ state, dispatch }) {
  const T = state.trade;
  const [mode, setMode] = useState(null);
  useEffect(() => setMode(null), [T?.stage]);
  if (!T) return null;
  const p = currentPlanet(state);
  const inDebt = state.debt > 0;
  const debtWhy = `In debt (${state.debt}): pay it off before trading. Gather or borrow instead.`;

  if (T.stage === 'gather7') return <Gather7 dispatch={dispatch} />;
  if (T.stage === 'cuti') return <CuTiView state={state} dispatch={dispatch} />;
  if (T.stage === 'uranium') return <UraniumView state={state} dispatch={dispatch} />;

  if (mode === 'cho') return <ChoTrade state={state} dispatch={dispatch} onBack={() => setMode(null)} />;
  if (mode === 'borrow') return <Borrow state={state} dispatch={dispatch} onBack={() => setMode(null)} />;

  return (
    <>
      <p className="pb-good">
        <Icon name="friendly" size={18} /> Friendly planet (value {p?.value}). Choose <b>one</b> action:
      </p>
      <div className="pb-options pb-options-grid">
        <button type="button" className="pb-opt pb-opt-wide" onClick={() => dispatch({ type: 'TRADE_GATHER' })}>
          <b>Gather resources</b>
          <span className="pb-gather-list">
            <span>Roll 2D6, add:</span>
            <span><i>3–4</i> <E k="Cu" /></span>
            <span><i>5–6</i> <E k="O2" /><E k="O2" /></span>
            <span><i>7</i> any 3 of <E k="C" /><E k="O2" /><E k="H2" /></span>
            <span><i>8–9</i> <E k="H2" /><E k="H2" /></span>
            <span><i>10–11</i> <E k="Ti" /></span>
            <span><i>2, 12</i> nothing</span>
          </span>
        </button>
        <WhyNot why={inDebt && debtWhy}>
          <button type="button" className="pb-opt" disabled={inDebt} onClick={() => setMode('cho')}>
            <b>Trade for <E k="C" /><E k="O2" /><E k="H2" /></b>
            <span>Swap up to 3 Elements 1-for-1.</span>
          </button>
        </WhyNot>
        <WhyNot why={inDebt && debtWhy}>
          <button type="button" className="pb-opt" disabled={inDebt} onClick={() => dispatch({ type: 'TRADE_CUTI_ROLL' })}>
            <b>Trade for <E k="Cu" /> or <E k="Ti" /></b>
            <span>1D6 ≥ 3: 2 Elements → 1, twice.</span>
          </button>
        </WhyNot>
        <WhyNot why={inDebt && debtWhy}>
          <button type="button" className="pb-opt" disabled={inDebt} onClick={() => dispatch({ type: 'TRADE_U_ROLL' })}>
            <b>Trade for <E k="U" /></b>
            <span>1D6 ≥ 4: 4 Elements → 1 <E k="U" />.</span>
          </button>
        </WhyNot>
        <WhyNot why={state.debt >= 5 && `Debt ${state.debt}: you can't borrow with 5 or more Debt.`}>
          <button type="button" className="pb-opt" disabled={state.debt >= 5} onClick={() => setMode('borrow')}>
            <b>Borrow</b>
            <span>Up to 3 (no <E k="U" />), +2 Debt each.</span>
          </button>
        </WhyNot>
      </div>
      {inDebt && <p className="pb-note">You can't trade while in debt; gather or borrow instead.</p>}
      <button type="button" className="pb-btn" onClick={() => dispatch({ type: 'TRADE_FINISH' })}>
        Leave without trading
      </button>
    </>
  );
}

function Gather7({ dispatch }) {
  const keys = ['C', 'O2', 'H2'];
  const [picks, setPicks] = useState(zero(keys));
  return (
    <>
      <p className="pb-good">Good Samaritans! Choose any 3 of Carbon, Oxygen or Hydrogen.</p>
      <Picker keys={keys} value={picks} onChange={setPicks} total={3} />
      <button
        type="button"
        className="pb-btn pb-btn-primary"
        disabled={total(picks) !== 3}
        onClick={() => dispatch({ type: 'TRADE_GATHER7', picks })}
      >
        Take them ({total(picks)}/3)
      </button>
    </>
  );
}

function ChoTrade({ state, dispatch, onBack }) {
  const [give, setGive] = useState(zero(ELEMENTS));
  const [get, setGet] = useState(zero(['C', 'O2', 'H2']));
  const n = total(give);
  return (
    <>
      <p>Give up to 3 Elements…</p>
      <Picker value={give} onChange={setGive} maxFor={(k) => state.cargo[k]} total={3} />
      <p>…and receive the same number of C / O₂ / H₂:</p>
      <Picker keys={['C', 'O2', 'H2']} value={get} onChange={setGet} total={n} />
      <div className="pb-row">
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          disabled={n < 1 || total(get) !== n}
          onClick={() => dispatch({ type: 'TRADE_CHO', give, get })}
        >
          Trade {n} for {total(get)}
        </button>
        <button type="button" className="pb-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}

function GiveFor({ state, need, label, onConfirm, extra, excludeU }) {
  const keys = excludeU ? ELEMENTS.filter((k) => k !== 'U') : ELEMENTS;
  const [give, setGive] = useState(zero(keys));
  return (
    <>
      <p>
        Choose {need} Elements to give{label ? ` ${label}` : ''}:
      </p>
      <Picker keys={keys} value={give} onChange={setGive} maxFor={(k) => state.cargo[k]} total={need} />
      {extra}
      {onConfirm(give, total(give) === need)}
    </>
  );
}

function CuTiView({ state, dispatch }) {
  const T = state.trade;
  const [get, setGet] = useState('Ti');
  const header = (
    <p>
      Negotiation {T.attempt} of 2: rolled <b>{T.roll}</b> —{' '}
      {!T.success ? 'no deal.' : T.resolved ? 'negotiation settled.' : 'they agree to trade!'}
    </p>
  );
  if (T.success && !T.resolved) {
    return (
      <>
        {header}
        <GiveFor
          state={state}
          need={2}
          label="for 1 Copper or Titanium"
          extra={
            <div className="pb-row">
              Receive:
              {['Cu', 'Ti'].map((k) => (
                <label key={k} className="pb-radio">
                  <input type="radio" name="cuti" checked={get === k} onChange={() => setGet(k)} />
                  <Cube k={k} size={20} /> {ELEMENT_INFO[k].name}
                </label>
              ))}
            </div>
          }
          onConfirm={(give, ok) => (
            <div className="pb-row">
              <button
                type="button"
                className="pb-btn pb-btn-primary"
                disabled={!ok}
                onClick={() => dispatch({ type: 'TRADE_CUTI_ACCEPT', give, get })}
              >
                Trade
              </button>
              <button type="button" className="pb-btn" onClick={() => dispatch({ type: 'TRADE_CUTI_DECLINE' })}>
                Decline
              </button>
            </div>
          )}
        />
      </>
    );
  }
  return (
    <>
      {header}
      <div className="pb-row">
        {T.attempt < 2 && (
          <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'TRADE_CUTI_ROLL' })}>
            Negotiate again
          </button>
        )}
        <button type="button" className="pb-btn" onClick={() => dispatch({ type: 'TRADE_FINISH' })}>
          Done trading
        </button>
      </div>
    </>
  );
}

function UraniumView({ state, dispatch }) {
  const T = state.trade;
  const header = (
    <p>
      Rolled <b>{T.roll}</b> — {T.success ? 'they will part with Uranium!' : 'they refuse to trade Uranium.'}
    </p>
  );
  if (!T.success) {
    return (
      <>
        {header}
        <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'TRADE_FINISH' })}>
          Continue
        </button>
      </>
    );
  }
  return (
    <>
      {header}
      <GiveFor
        state={state}
        need={4}
        label="for 1 Uranium"
        excludeU
        onConfirm={(give, ok) => (
          <div className="pb-row">
            <button
              type="button"
              className="pb-btn pb-btn-primary"
              disabled={!ok}
              onClick={() => dispatch({ type: 'TRADE_U_ACCEPT', give })}
            >
              Trade for <Cube k="U" size={18} />
            </button>
            <button type="button" className="pb-btn" onClick={() => dispatch({ type: 'TRADE_FINISH' })}>
              Decline
            </button>
          </div>
        )}
      />
    </>
  );
}

function Borrow({ state, dispatch, onBack }) {
  const keys = ELEMENTS.filter((k) => k !== 'U');
  const [element, setElement] = useState(keys.find((k) => maxBorrow(state, k) > 0) || 'O2');
  const max = maxBorrow(state, element);
  const [n, setN] = useState(1);
  useEffect(() => setN((v) => Math.max(1, Math.min(v, max))), [max]);
  return (
    <>
      <p>Borrow up to 3 of one Element. Each one adds 2 Debt (you can never hold more than 6 Debt).</p>
      <div className="pb-row pb-wrap">
        {keys.map((k) => (
          <label key={k} className="pb-radio">
            <input type="radio" name="borrow" checked={element === k} onChange={() => setElement(k)} disabled={maxBorrow(state, k) === 0} />
            <Cube k={k} size={20} />
          </label>
        ))}
      </div>
      <label className="pb-shields">
        Amount:
        <input type="range" min={1} max={Math.max(1, max)} value={n} onChange={(e) => setN(Number(e.target.value))} disabled={max <= 1} />
        <b>{max ? n : 0}</b> (+{max ? n * 2 : 0} Debt)
      </label>
      <div className="pb-row">
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          disabled={max < 1}
          onClick={() => dispatch({ type: 'TRADE_BORROW', element, n })}
        >
          Borrow
        </button>
        <button type="button" className="pb-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}

// ----- Maintenance -----

function MaintenanceView({ state, dispatch, onPreview }) {
  return (
    <>
      <p>
        Choose <b>one</b> operation, or an engine repair below the map. Either ends your turn. Hover to preview.
      </p>
      <ul className="pb-maint">
        {MAINTENANCE.map((m) => {
          const ok = canAfford(state, m.cost);
          const effects = gainPreview(state, m.gain);
          const wasted = effects.filter((e) => e.wasted > 0);
          const useless = effects.every((e) => e.gained === 0);
          const usable = ok && !useless; // nothing to gain = nothing to do
          const show = () => usable && onPreview({ gain: m.gain, cost: m.cost });
          const hide = () => onPreview(null);
          return (
            <li
              key={m.id}
              className={wasted.length ? 'has-waste' : ''}
              onMouseEnter={show}
              onMouseLeave={hide}
              onFocus={show}
              onBlur={hide}
            >
              <CostCubes cost={m.cost} size={18} have={state.cargo} />
              <span className="pb-maint-arrow">→</span>
              <span className="pb-maint-gain">
                {effects.map((e) => `+${e.n} ${SHIP_INFO[e.k].short}`).join(', ')}
                {useless ? (
                  <span className="pb-waste is-full">full</span>
                ) : (
                  wasted.length > 0 && <span className="pb-waste">{wasted.map((e) => `${e.wasted} wasted`).join(', ')}</span>
                )}
              </span>
              <button
                type="button"
                className={`pb-btn pb-btn-sm ${wasted.length ? 'is-warn' : ''}`}
                disabled={!usable}
                title={
                  useless
                    ? effects.map((e) => `${SHIP_INFO[e.k].name} is already full`).join('; ')
                    : wasted.length
                    ? wasted
                        .map((e) => `${SHIP_INFO[e.k].name} is ${state.res[e.k]}/${state.limits[e.k]}: only +${e.gained} fits, ${e.wasted} wasted`)
                        .join('; ')
                    : undefined
                }
                onClick={() => {
                  hide();
                  dispatch({ type: 'MAINTAIN', id: m.id });
                }}
              >
                Do it
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="pb-btn pb-btn-primary" onClick={() => dispatch({ type: 'END_TURN' })}>
        End turn
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------

const TITLES = {
  roll: 'Consume Resources',
  travel: 'Travel',
  scan: 'Scan for Planets',
  enemies: 'Move Enemy Vessels',
  battle: 'Battle!',
  contact: 'Contact Planet',
  trade: 'Gather or Trade',
  maintenance: 'Maintenance & Repair',
};

export default function ActionPanel({ state, dispatch, onPreview = () => {} }) {
  const views = {
    roll: RollView,
    travel: TravelView,
    scan: ScanView,
    enemies: EnemiesView,
    battle: BattleView,
    contact: ContactView,
    trade: TradeView,
    maintenance: MaintenanceView,
  };
  const View = views[state.phase];
  const bodyRef = useRef(null);
  const fitRef = useRef(null);
  const [, setTick] = useState(0);

  // The turn box has a fixed size. If a step's content is taller than the box (different
  // fonts, smaller window), scale the content down evenly so it always fits, with no scrollbars.
  const refit = () => {
    const body = bodyRef.current;
    const inner = fitRef.current;
    if (!body || !inner) return;
    inner.style.zoom = '1';
    const avail = body.clientHeight;
    const need = inner.scrollHeight;
    if (avail > 0 && need > avail) inner.style.zoom = String(Math.max(0.6, (avail / need) * 0.97));
  };
  useLayoutEffect(refit);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    // Steps can change their own content (e.g. opening a trade form) without this panel
    // re-rendering, so also re-fit whenever anything inside the box changes.
    const inner = fitRef.current;
    let raf = 0;
    const mo =
      inner && typeof MutationObserver !== 'undefined'
        ? new MutationObserver((list) => {
            if (list.every((m) => m.target === inner && m.type === 'attributes')) return; // our own zoom change
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(refit);
          })
        : null;
    mo?.observe(inner, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => {
      window.removeEventListener('resize', onResize);
      mo?.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = `${state.phase}/${state.battle?.stage || ''}/${state.trade?.stage || ''}/${state.turn}`;
  useChange(stage, () => fadeIn(bodyRef.current));
  return (
    <section className="pb-panel pb-action" aria-live="polite">
      <h2 className="pb-h pb-action-title">
        Turn {state.turn} · {TITLES[state.phase] || ''}
      </h2>
      <div className="pb-action-body" ref={bodyRef}>
        <div className="pb-fit" ref={fitRef}>
          {View ? <View state={state} dispatch={dispatch} onPreview={onPreview} /> : null}
        </div>
      </div>
    </section>
  );
}
