import React, { useEffect, useRef } from 'react';
import { RGB, flash } from './flash.js';
import { BOARD_SIZE } from '../game/constants.js';
import { planetAt, enemiesAt } from '../game/engine.js';
import { Die, ShipToken, Icon } from './Pieces.jsx';

const PLANET_NAME = { unknown: 'Unexplored planet', hostile: 'Hostile planet', friendly: 'Friendly planet' };

/**
 * The 6x6 star map. `options` is a list of reachable squares (from travelOptions or
 * fleeOptions); clicking an affordable one calls onPick(x, y).
 */
export default function Board({ state, options = [], onPick }) {
  const optMap = new Map(options.map((o) => [`${o.x},${o.y}`, o]));
  const cells = [];
  const cellRefs = useRef({});
  const prevSig = useRef(null);

  // What is on each square: used to glow squares whose contents just changed.
  const sig = {};
  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      const p = planetAt(state, x, y);
      sig[`${x},${y}`] = {
        planet: p ? `${p.type}:${p.value}` : '',
        planetType: p?.type || '',
        enemies: enemiesAt(state, x, y).length,
        player: state.player.x === x && state.player.y === y,
      };
    }
  }
  useEffect(() => {
    const old = prevSig.current;
    prevSig.current = sig;
    if (!old) return;
    for (const key of Object.keys(sig)) {
      const a = old[key];
      const b = sig[key];
      if (a.planet === b.planet && a.enemies === b.enemies && a.player === b.player) continue;
      let rgb = RGB.neutral; // something left this square
      if (b.enemies > a.enemies) rgb = RGB.bad; // enemy arrived or spawned
      else if (b.player && !a.player) rgb = RGB.info; // you arrived
      else if (b.planet !== a.planet && b.planet) {
        rgb = b.planetType === 'hostile' ? RGB.bad : b.planetType === 'friendly' ? RGB.good : RGB.warn;
      }
      flash(cellRefs.current[key], rgb, { duration: 1000, strength: 0.22 });
    }
  });

  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      const planet = planetAt(state, x, y);
      const enemies = enemiesAt(state, x, y);
      const isPlayer = state.player.x === x && state.player.y === y;
      const opt = optMap.get(`${x},${y}`);
      const dark = (x + y) % 2 === 0;
      const clickable = opt && opt.affordable;
      const tokenCount = enemies.length + (isPlayer ? 1 : 0);
      const tokenSize = tokenCount > 2 ? '30%' : '40%';

      let label = `Square ${x},${y}`;
      if (planet) label += `, ${PLANET_NAME[planet.type]} value ${planet.value}`;
      if (isPlayer) label += ', your ship';
      if (enemies.length) label += `, ${enemies.length} enemy vessel${enemies.length > 1 ? 's' : ''}`;
      if (opt) label += `. Travel cost ${opt.fuel} fuel${opt.power ? `, ${opt.power} power` : ''}`;

      cells.push(
        <button
          key={`${x},${y}`}
          ref={(el) => (cellRefs.current[`${x},${y}`] = el)}
          type="button"
          className={[
            'pb-cell',
            dark ? 'is-dark' : '',
            opt ? (clickable ? 'is-reach' : 'is-reach-no') : '',
          ].join(' ')}
          onClick={clickable ? () => onPick(x, y) : undefined}
          disabled={!clickable}
          aria-label={label}
          title={label}
        >
          {(x === 1 && y === 1) || (x === BOARD_SIZE && y === BOARD_SIZE) ? (
            <span className="pb-coord">
              ({x},{y})
            </span>
          ) : null}

          {planet && (
            <span className={`pb-planet pb-planet-${planet.type}`}>
              <Die value={planet.value} kind={planet.type} size="100%" title={`${PLANET_NAME[planet.type]} (${planet.value})`} />
            </span>
          )}

          {tokenCount > 0 && (
            <span className={`pb-tokens ${planet ? 'with-planet' : ''}`}>
              {isPlayer && (
                <span className="pb-token-wrap" style={{ width: planet ? tokenSize : '62%' }}>
                  <ShipToken kind="player" size="100%" title="Your ship" />
                </span>
              )}
              {enemies.map((e) => (
                <span key={e.id} className="pb-token-wrap" style={{ width: planet || isPlayer ? tokenSize : '58%' }}>
                  <ShipToken kind="enemy" size="100%" title="Enemy vessel" />
                </span>
              ))}
            </span>
          )}

          {opt && (
            <span
              className={['pb-costtag', clickable ? '' : 'is-no', opt.planet || opt.enemy ? 'has-object' : ''].join(' ')}
              aria-hidden="true"
            >
              <span className="pb-cost-fuel">
                <Icon name="fuel" size="1em" fallback="F" />
                {opt.fuel}
              </span>
              {opt.power ? (
                <span className="pb-cost-power">
                  <Icon name="power" size="1em" fallback="P" />
                  {opt.power}
                </span>
              ) : null}
            </span>
          )}
        </button>
      );
    }
  }

  return (
    <div className="pb-board" role="grid" aria-label="Star map">
      {cells}
    </div>
  );
}
