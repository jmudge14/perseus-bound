import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cube } from './Pieces.jsx';
import { PHASE_STEPS } from '../game/constants.js';
import { REFERENCE, WHEN } from './TurnTracker.jsx';
import Markdown, { parse } from './Markdown.jsx';
import rulebookText from '../content/rulebook.md?raw';

const TAB_KEY = 'perseus-bound-rules-tab';

/** Rules panel: a short Quick reference and the Full rulebook (src/content/rulebook.md). */
export default function RulesModal({ onClose, difficulty = 'standard' }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const [tab, setTab] = useState(() => {
    try {
      return window.localStorage.getItem(TAB_KEY) === 'full' ? 'full' : 'quick';
    } catch {
      return 'quick';
    }
  });
  const blocks = useMemo(() => parse(rulebookText), []);
  const toc = blocks.filter((b) => b.type === 'h' && b.level >= 2);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (t) => {
    setTab(t);
    if (ref.current) ref.current.scrollTop = 0;
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const jump = (id) => {
    const el = document.getElementById(`rule-${id}`);
    const box = ref.current;
    if (!el || !box) return;
    const header = box.querySelector('.pb-rules-top')?.offsetHeight || 0;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - header - 8;
    box.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <div className="pb-modal-bg" onClick={onClose}>
      <div
        className="pb-modal pb-rules"
        role="dialog"
        aria-modal="true"
        aria-label="Rules"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-rules-top">
          <div className="pb-tabs" role="tablist" aria-label="Rules version">
            <button type="button" role="tab" aria-selected={tab === 'quick'} className={tab === 'quick' ? 'is-on' : ''} onClick={() => choose('quick')}>
              Quick reference
            </button>
            <button type="button" role="tab" aria-selected={tab === 'full'} className={tab === 'full' ? 'is-on' : ''} onClick={() => choose('full')}>
              Full rulebook
            </button>
          </div>
          <button type="button" className="pb-modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div ref={bodyRef} role="tabpanel">
          {tab === 'quick' ? (
            <>
              <h2 className="pb-title-sm">How to Play</h2>

    <p>
      Your prototype interstellar vessel was crippled by a meteorite in an unexplored system of the Perseus Arm. Your
      Uranium was jettisoned and your thermonuclear engine is damaged. Gather and trade for Elements, keep your crew
      alive, and <b>repair all four engine components</b> to return to Earth. Run out of Fuel, Air, Food, Power or
      Hull, or drown in debt, and you're lost among the stars.
    </p>

    <h3>Elements</h3>
    <ul className="pb-elist">
      <li><Cube k="C" size={18} /> <b>Carbon</b> — grows Food.</li>
      <li><Cube k="O2" size={18} /> <b>Oxygen</b> — Air, Rocket Fuel and Power.</li>
      <li><Cube k="H2" size={18} /> <b>Hydrogen</b> — Rocket Fuel and Power.</li>
      <li><Cube k="Cu" size={18} /> <b>Copper</b> — Power and engine repairs.</li>
      <li><Cube k="Ti" size={18} /> <b>Titanium</b> — Hull and engine repairs.</li>
      <li><Cube k="U" size={18} /> <b>Uranium</b> — the rare nuclear fuel for the trip home.</li>
    </ul>
    <p>
      Only 6 of each Element exist, so you can never hold more than 6. Any Elements you gain while in <b>Debt</b>{' '}
      pay it off first, one for one. Holding more than 6 Debt means your ship is seized.
    </p>

    <h3>Turn sequence</h3>
    <p>
      Every turn follows these eight steps in order. Steps that don't apply are skipped. The bar under the header
      shows which step you're on, and you can hover over or click a step there to see the same details.
    </p>
    <div className="pb-rules-steps">
      {PHASE_STEPS.map((step) => {
        const Body = REFERENCE[step.id];
        return (
          <section key={step.id} className="pb-rules-step" aria-labelledby={`pb-rules-step-${step.id}`}>
            <header className="pb-rules-step-head">
              <span className="pb-tstep-n">{step.n}</span>
              <div>
                <h4 id={`pb-rules-step-${step.id}`}>{step.label}</h4>
                <span className="pb-step-when">{WHEN[step.id]}</span>
              </div>
            </header>
            <div className="pb-step-detail-body">
              <Body difficulty={difficulty} />
            </div>
          </section>
        );
      })}
    </div>

    <h3>Challenge mode</h3>
    <p>
      Start with 6 Fuel and 6 Hull, with limits of 10 Fuel, 10 Air, 6 Food, 6 Hull and 6 Power. Planets are one value
      lower: each new planet's die is lowered by 1 as it's placed (a 1 stays a 1). Travelling 2 squares costs 1 Power, and 3 squares costs 3 Power.
    </p>


            </>
          ) : (
            <>
              <nav className="pb-toc" aria-label="Rulebook contents">
                {toc.map((h) => (
                  <button key={h.id} type="button" className={`pb-toc-l${h.level}`} onClick={() => jump(h.id)}>
                    {h.text}
                  </button>
                ))}
              </nav>
              <Markdown blocks={blocks} />
            </>
          )}
        </div>

        <button type="button" className="pb-btn pb-btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
