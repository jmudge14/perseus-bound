import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RGB, flash, pop, floatText, useChanges } from './flash.js';
import { ELEMENTS, ELEMENT_INFO, SHIP_KEYS, SHIP_INFO, ENGINE_PARTS, MAX_DEBT, MAX_ELEMENT } from '../game/constants.js';
import { canAfford, gainPreview, costText } from '../game/engine.js';
import { Cube, DebtCube, CostCubes, Die, Icon } from './Pieces.jsx';
import { engineArt } from '../assets/index.js';
import { outcomeColor } from './outcomeColors.js';

// ---------------------------------------------------------------------------
// Ship resource tracks
// ---------------------------------------------------------------------------

/**
 * preview (optional): { gain: {power: 3}, cost: {Cu: 1, ...} } from hovering an action.
 * Gains light up in the bars with a +N label; any amount above the maximum is flagged as wasted.
 */
export function ShipTracker({ state, preview }) {
  const pv = Object.fromEntries(gainPreview(state, preview?.gain).map((g) => [g.k, g]));
  const rowRefs = useRef({});
  const numRefs = useRef({});
  useChanges(state.res, (k, a, b) => {
    const rgb = b > a ? RGB.good : RGB.bad;
    flash(rowRefs.current[k], rgb);
    pop(numRefs.current[k], rgb);
    floatText(numRefs.current[k], `${b > a ? '+' : '−'}${Math.abs(b - a)}`, rgb);
  });
  return (
    <section className="pb-panel">
      <h2 className="pb-h">Ship Resources</h2>
      <div className="pb-tracks">
        {SHIP_KEYS.map((k) => {
          const info = SHIP_INFO[k];
          const v = state.res[k];
          const max = state.limits[k];
          const low = v <= Math.max(1, Math.floor(max * 0.2));
          const g = pv[k];
          const after = g ? v + g.gained : v;
          return (
            <div
              key={k}
              ref={(el) => (rowRefs.current[k] = el)}
              className={`pb-track ${low ? 'is-low' : ''} ${g ? 'is-preview' : ''}`}
            >
              <div className="pb-track-head">
                <span className="pb-track-name">
                  <Icon name={k} size={16} />{' '}
                  {g ? (
                    <span className={`pb-delta ${g.wasted ? 'is-waste' : ''}`} title={info.name}>
                      {g.gained ? `+${g.gained}` : 'Full'}
                      {g.wasted ? ` · ${g.wasted} wasted` : ''}
                    </span>
                  ) : (
                    info.name
                  )}
                </span>
                <span className="pb-track-num" ref={(el) => (numRefs.current[k] = el)}>
                  {v}
                  <small>/{max}</small>
                </span>
              </div>
              <div className="pb-segs" style={{ gridTemplateColumns: `repeat(${max}, 1fr)` }} aria-hidden="true">
                {Array.from({ length: max }, (_, i) => (
                  <span
                    key={i}
                    className={`pb-seg ${i >= v && i < after ? 'is-gain' : ''}`}
                    style={i < after ? { background: info.color } : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cargo bay
// ---------------------------------------------------------------------------

export function CargoBay({ state, preview }) {
  const cost = preview?.cost || {};
  const rowRefs = useRef({});
  const numRefs = useRef({});
  const bump = (k, a, b, gainIsGood = true) => {
    const rgb = b > a === gainIsGood ? RGB.good : RGB.bad;
    flash(rowRefs.current[k], rgb);
    pop(numRefs.current[k], rgb);
    floatText(numRefs.current[k], `${b > a ? '+' : '−'}${Math.abs(b - a)}`, rgb);
  };
  useChanges(state.cargo, (k, a, b) => bump(k, a, b));
  useChanges({ debt: state.debt }, (k, a, b) => bump(k, a, b, false));
  return (
    <section className="pb-panel">
      <h2 className="pb-h">Cargo Bay</h2>
      <div className="pb-cargo">
        {ELEMENTS.map((k) => (
          <div
            key={k}
            ref={(el) => (rowRefs.current[k] = el)}
            className="pb-cargo-row"
            title={`${ELEMENT_INFO[k].name}: ${state.cargo[k]} of ${MAX_ELEMENT}`}
          >
            <span className="pb-cargo-name">{ELEMENT_INFO[k].name}</span>
            <span className="pb-cargo-cubes">
              {Array.from({ length: MAX_ELEMENT }, (_, i) => (
                <Cube
                  key={i}
                  k={k}
                  size={20}
                  dim={i >= state.cargo[k]}
                  spend={i < state.cargo[k] && i >= state.cargo[k] - (cost[k] || 0)}
                />
              ))}
            </span>
            <span className="pb-cargo-n" ref={(el) => (numRefs.current[k] = el)}>
              {state.cargo[k]}
            </span>
          </div>
        ))}
        <div
          ref={(el) => (rowRefs.current.debt = el)}
          className={`pb-cargo-row pb-debt-row ${state.debt ? 'has-debt' : ''}`}
          title="Debt must be paid before you keep new Elements"
        >
          <span className="pb-cargo-name">Debt</span>
          <span className="pb-cargo-cubes">
            {Array.from({ length: MAX_DEBT }, (_, i) => (
              <DebtCube key={i} size={20} dim={i >= state.debt} />
            ))}
          </span>
          <span className="pb-cargo-n" ref={(el) => (numRefs.current.debt = el)}>
            {state.debt}
          </span>
        </div>
        {state.debt > 0 && <p className="pb-note">New Elements pay off debt first (1 Element = 1 Debt).</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Engine repair status
// ---------------------------------------------------------------------------

export function EngineRepairs({ state, onRepair, onPreview = () => {} }) {
  const canRepairNow = state.phase === 'maintenance' && state.status === 'playing';
  const done = ENGINE_PARTS.filter((p) => state.engine[p.id]).length;
  const partRefs = useRef({});
  useChanges(state.engine, (id, was, now) => now && !was && flash(partRefs.current[id], RGB.good, { duration: 1400 }));
  return (
    <section className="pb-panel pb-engine-panel">
      <h2 className="pb-h">
        Engine Repairs <span className="pb-h-sub">{done}/4 repaired — repair all four to fly home</span>
      </h2>
      <ul className="pb-engine">
        {ENGINE_PARTS.map((p) => {
          const repaired = state.engine[p.id];
          const affordable = canAfford(state, p.cost);
          const show = () => canRepairNow && !repaired && onPreview({ cost: p.cost });
          const hide = () => onPreview(null);
          return (
            <li
              key={p.id}
              ref={(el) => (partRefs.current[p.id] = el)}
              className={`pb-part ${repaired ? 'is-done' : ''}`}
              onMouseEnter={show}
              onMouseLeave={hide}
              onFocus={show}
              onBlur={hide}
            >
              {engineArt(p.id) && <img className="pb-part-art" src={engineArt(p.id)} alt="" draggable={false} />}
              <span className="pb-part-name">{p.name}</span>
              <CostCubes cost={p.cost} size={17} have={repaired ? undefined : state.cargo} />
              <span className="pb-part-status">
                {repaired ? (
                  <span className="pb-part-done">✔ Repaired</span>
                ) : canRepairNow ? (
                  <button
                    type="button"
                    className="pb-btn pb-btn-sm"
                    disabled={!affordable}
                    title={affordable ? undefined : `Needs ${costText(p.cost)}`}
                    onClick={() => {
                      hide();
                      onRepair(p.id);
                    }}
                  >
                    Repair
                  </button>
                ) : (
                  <span className="pb-part-todo">{affordable ? 'Ready — repair in step 8' : 'Needs parts'}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dice tray: shows the dice from the most recent action
// ---------------------------------------------------------------------------

export function DiceTray({ state }) {
  if (!state.rolls?.length) return null;
  return (
    <div className="pb-tray" key={state.rollSeq}>
      {state.rolls.map((g, i) => (
        <div
          key={i}
          className="pb-roll"
          style={g.result?.[0] ? { borderTopColor: outcomeColor(g.result[0].c) } : undefined}
        >
          <span className="pb-roll-label">{g.label}</span>
          <span className="pb-roll-dice">
            {g.dice.map((d, j) => (
              <Die key={j} value={d.v} kind={d.kind} size={26} className="pb-tumble" />
            ))}
          </span>
          {g.result?.length > 0 && (
            <span className="pb-roll-result">
              {g.result.map((r, j) => (
                <span key={j} className="pb-outcome" style={{ color: outcomeColor(r.c) }}>
                  {r.text}
                </span>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Captain's log
// ---------------------------------------------------------------------------

export function Log({ state }) {
  const listRef = useRef(null);
  const [offset, setOffset] = useState(0); // how many of the newest entries are paged past
  const [fit, setFit] = useState(null); // how many whole entries fit (null = measure again)
  const pages = useRef([]); // offsets of the newer pages, so "Newer" returns exactly
  const entries = useMemo(() => [...state.log].reverse(), [state.log]); // newest first
  const mark = state.logMark ?? Infinity;
  const latestTurn = entries[0]?.turn;

  // New entries: jump back to the newest page and re-measure.
  const seen = useRef(state.log.length ? state.log[state.log.length - 1].id : 0);
  useEffect(() => {
    setOffset(0);
    setFit(null);
    pages.current = [];
    const lastSeen = seen.current;
    if (state.log.length) seen.current = state.log[state.log.length - 1].id;
    // Briefly highlight the entries that just arrived.
    requestAnimationFrame(() => {
      listRef.current?.querySelectorAll('li[data-id]').forEach((li) => {
        const e = state.log.find((x) => String(x.id) === li.dataset.id);
        if (e && e.id > lastSeen) flash(li, e.tone === 'bad' ? RGB.bad : e.tone === 'good' ? RGB.good : RGB.info, { duration: 1300, strength: 0.18 });
      });
    });
  }, [state.log]);

  // Re-measure when the available height changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let h = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight !== h) {
        h = el.clientHeight;
        setFit(null);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure how many whole entries fit (runs before paint, so there is no flicker).
  useLayoutEffect(() => {
    if (fit !== null) return;
    const el = listRef.current;
    if (!el) return;
    const limit = el.clientHeight;
    let n = 0;
    for (const li of el.children) {
      if (li.offsetTop + li.offsetHeight > limit) break;
      n++;
    }
    setFit(Math.max(1, n));
  }, [fit, offset, entries]);

  const shown = fit === null ? entries.slice(offset) : entries.slice(offset, offset + fit);
  const newer = offset;
  const older = Math.max(0, entries.length - offset - shown.length);

  return (
    <section className="pb-panel pb-logpanel">
      <h2 className="pb-h">Captain's Log</h2>
      {newer > 0 && (
        <button
          type="button"
          className="pb-btn pb-btn-sm pb-log-more"
          onClick={() => {
            setOffset(pages.current.pop() ?? 0);
            setFit(null);
          }}
        >
          ▲ Newer ({newer})
        </button>
      )}
      <ol className="pb-log" ref={listRef}>
        {shown.map((e) => (
          <li
            key={e.id}
            data-id={e.id}
            className={[
              `pb-log-${e.tone}`,
              e.id >= mark ? 'is-recent' : '',
              e.turn !== latestTurn ? 'is-old' : '',
            ].join(' ')}
          >
            <span className="pb-log-turn">T{e.turn}</span> {e.text}
          </li>
        ))}
      </ol>
      {/* Always rendered (invisible when not needed) so the list height never depends on it. */}
      <button
        type="button"
        className="pb-btn pb-btn-sm pb-log-more"
        style={older > 0 && fit !== null ? undefined : { visibility: 'hidden' }}
        tabIndex={older > 0 ? 0 : -1}
        aria-hidden={older > 0 ? undefined : true}
        onClick={() => {
          pages.current.push(offset);
          setOffset(offset + shown.length);
          setFit(null);
        }}
      >
        ▼ Older ({older})
      </button>
    </section>
  );
}
