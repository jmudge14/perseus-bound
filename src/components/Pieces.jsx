import React from 'react';
import { ELEMENT_INFO } from '../game/constants.js';
import { dieArt, tokenArt, elementArt, iconArt } from '../assets/index.js';

// All artwork comes from src/assets (see assets/README.md). Each component below shows
// the art file when one exists, and otherwise a plain fallback drawn in code so the game
// remains playable while art is still being made.

/** An artwork image sized to a box, keeping its aspect ratio. */
function ArtImg({ src, size, alt, className = '', title }) {
  return (
    <img
      className={`pb-art ${className}`}
      src={src}
      alt={alt || ''}
      title={title}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      style={typeof size === 'number' ? undefined : { width: size, height: 'auto' }}
      draggable={false}
    />
  );
}

/** A named UI icon from assets/icons/<name>.*; renders `fallback` (or nothing) when the slot is empty. */
export function Icon({ name, size = 16, fallback = null, title }) {
  const src = iconArt(name);
  if (!src) return fallback;
  return <ArtImg src={src} size={size} alt={title || ''} title={title} className="pb-icon" />;
}

// ---------------------------------------------------------------------------
// Dice — art: assets/dice/<kind>-<value>.*  (fallback: plain pips drawn in code)
// ---------------------------------------------------------------------------

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export const DIE_STYLE = {
  black: { fill: '#16161a', stroke: '#55556a', pip: '#ffffff' },
  white: { fill: '#f7f7f2', stroke: '#9a9a9a', pip: '#16161a' },
  d6: { fill: '#c8ccd6', stroke: '#7a7f8c', pip: '#16161a' },
  yellow: { fill: '#f3d34a', stroke: '#a88d14', pip: '#3a2f00' },
  unknown: { fill: '#f3d34a', stroke: '#a88d14', pip: '#3a2f00' },
  hostile: { fill: '#d64541', stroke: '#7d1f1c', pip: '#ffffff' },
  friendly: { fill: '#4caf50', stroke: '#1f5e22', pip: '#ffffff' },
};

export function Die({ value, kind = 'white', size = 40, className = '', title }) {
  const label = title || `${kind} die showing ${value}`;
  const src = dieArt(kind, value);
  if (src) return <ArtImg src={src} size={size} alt={label} title={title} className={`pb-die ${className}`} />;

  const st = DIE_STYLE[kind] || DIE_STYLE.white;
  return (
    <svg className={`pb-die ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label}>
      {title && <title>{title}</title>}
      <rect x="4" y="4" width="92" height="92" rx="18" fill={st.fill} stroke={st.stroke} strokeWidth="4" />
      {(PIPS[value] || []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill={st.pip} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Ship tokens — art: assets/tokens/player.*, enemy.*  (fallback: plain coloured disc)
// ---------------------------------------------------------------------------

const TOKEN_FALLBACK = { player: '#b7cbe0', enemy: '#dd7a62', 'player-yellow': '#f5ea7a' };

export function ShipToken({ kind = 'player', size = 40, title }) {
  const src = tokenArt(kind);
  if (src) return <ArtImg src={src} size={size} alt={title || ''} title={title} className={`pb-token pb-token-${kind}`} />;
  return (
    <span
      className={`pb-token pb-token-fallback pb-token-${kind}`}
      role="img"
      aria-label={title}
      title={title}
      style={{ width: size, height: typeof size === 'number' ? size : undefined, background: TOKEN_FALLBACK[kind] }}
    />
  );
}

// ---------------------------------------------------------------------------
// Element cubes — art: assets/elements/<C|O2|H2|Cu|Ti|U|debt>.*  (fallback: labelled square)
// ---------------------------------------------------------------------------

export function Cube({ k, size = 26, dim = false, spend = false, title }) {
  const info = ELEMENT_INFO[k];
  if (!info) return null;
  const src = elementArt(k);
  if (src) {
    return <ArtImg src={src} size={size} alt={info.name} title={title || info.name} className={`pb-cube-art ${dim ? 'is-dim' : ''} ${spend ? 'is-spend' : ''}`} />;
  }
  return (
    <span
      className={`pb-cube ${dim ? 'is-dim' : ''} ${spend ? 'is-spend' : ''}`}
      title={title || info.name}
      style={{
        width: size,
        height: size,
        background: info.color,
        color: info.text,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {info.label}
    </span>
  );
}

export function DebtCube({ size = 22, dim = false }) {
  const src = elementArt('debt');
  if (src) return <ArtImg src={src} size={size} alt="Debt" title="Debt" className={`pb-cube-art ${dim ? 'is-dim' : ''}`} />;
  return (
    <span className={`pb-cube pb-debt ${dim ? 'is-dim' : ''}`} style={{ width: size, height: size }} title="Debt">
      !!
    </span>
  );
}

/** Render a cost object like {Cu:1, Ti:3} as a row of cubes. */
export function CostCubes({ cost, size = 20, have }) {
  const cubes = [];
  for (const [k, n] of Object.entries(cost)) {
    for (let i = 0; i < n; i++) {
      const missing = have ? (have[k] || 0) <= i : false;
      cubes.push(<Cube key={`${k}${i}`} k={k} size={size} dim={missing} />);
    }
  }
  return <span className="pb-cost">{cubes}</span>;
}

// ---------------------------------------------------------------------------
// Die-roll labels for reference tables: real die faces plus the printed number,
// e.g. ⬛⬛ "3–4", so the digital tables read the same as the cardboard rules.
// ---------------------------------------------------------------------------

export function DieRange({ from, to = from, kind = 'black', size = 18 }) {
  const values = [];
  for (let v = from; v <= to; v++) values.push(v);
  // Long ranges show the first and last face only (e.g. 3 … 6) to stay compact.
  const faces = values.length > 2 ? [values[0], null, values[values.length - 1]] : values;
  const label = from === to ? `${from}` : `${from}–${to}`;
  return (
    <span className="pb-dierange" aria-label={`Roll ${label}`}>
      <span className="pb-dierange-faces" aria-hidden="true">
        {faces.map((v, i) =>
          v === null ? (
            <span key={i} className="pb-dierange-gap">
              …
            </span>
          ) : (
            <Die key={i} value={v} kind={kind} size={size} />
          )
        )}
      </span>
      <b className="pb-dierange-num">{label}</b>
    </span>
  );
}
