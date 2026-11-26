// Brief, non-blocking change highlights.
//
// Everything here uses the Web Animations API on existing elements: nothing is awaited,
// nothing blocks clicks (no overlays, no disabled states), and nothing persists after the
// animation ends. All effects are skipped when the user's OS asks for reduced motion.

import { useEffect, useRef } from 'react';

export const RGB = {
  good: '121, 217, 138',
  bad: '255, 123, 107',
  info: '127, 178, 255',
  warn: '255, 213, 74',
  neutral: '210, 218, 235',
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const can = (el) => el && typeof el.animate === 'function' && !reducedMotion();

/** Glow an element's area and outline in a colour, then fade back to normal. */
export function flash(el, rgb = RGB.info, { duration = 900, delay = 0, strength = 0.28 } = {}) {
  if (!can(el)) return;
  el.animate(
    [
      { boxShadow: `inset 0 0 0 999px rgba(${rgb}, ${strength}), 0 0 0 2px rgba(${rgb}, 0.9), 0 0 16px 2px rgba(${rgb}, 0.5)` },
      { boxShadow: `inset 0 0 0 999px rgba(${rgb}, 0), 0 0 0 2px rgba(${rgb}, 0), 0 0 16px 2px rgba(${rgb}, 0)` },
    ],
    { duration, delay, easing: 'ease-out' }
  );
}

/** Quick scale "pop" for a number that changed. */
export function pop(el, rgb) {
  if (!can(el)) return;
  el.animate(
    [
      { transform: 'scale(1.35)', ...(rgb ? { color: `rgb(${rgb})` } : {}) },
      { transform: 'scale(1)' },
    ],
    { duration: 450, easing: 'ease-out' }
  );
}

/** A small "+2" / "−1" that floats up from the right side of `host` and fades away. */
export function floatText(host, text, rgb) {
  if (!can(host)) return;
  const tag = document.createElement('span');
  tag.className = 'pb-float';
  tag.textContent = text;
  tag.style.color = `rgb(${rgb})`;
  host.appendChild(tag);
  const anim = tag.animate(
    [
      { opacity: 0, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'translateY(0)', offset: 0.15 },
      { opacity: 0, transform: 'translateY(-16px)' },
    ],
    { duration: 1200, easing: 'ease-out' }
  );
  anim.onfinish = () => tag.remove();
  anim.oncancel = () => tag.remove();
}

/** Brief fade-in, used when a panel's content is replaced. */
export function fadeIn(el, duration = 260) {
  if (!can(el)) return;
  el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration, easing: 'ease-out' });
}

/**
 * Call onChange(key, oldValue, newValue) for each key of `obj` whose value changed since
 * the previous render. Nothing fires on the first render.
 */
export function useChanges(obj, onChange) {
  const prev = useRef(obj);
  useEffect(() => {
    const old = prev.current || {};
    prev.current = obj;
    if (old === obj) return;
    for (const k of Object.keys(obj)) {
      if (old[k] !== undefined && old[k] !== obj[k]) onChange(k, old[k], obj[k]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
}

/** Call onChange(old, new) when `value` changes (not on first render). */
export function useChange(value, onChange) {
  const prev = useRef(value);
  useEffect(() => {
    const old = prev.current;
    prev.current = value;
    if (old !== value) onChange(old, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
