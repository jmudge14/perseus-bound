// Version and build details, filled in by vite.config.js at build time (see the `define` section there).
// The typeof checks keep this working if a file is loaded without Vite (e.g. by the test scripts).

/* global __APP_VERSION__, __BUILD_TIME__, __BUILD_COMMIT__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

/** The build date in the player's own format, e.g. "Nov 25, 2026". */
export function buildDateText() {
  if (!BUILD_TIME) return '';
  const d = new Date(BUILD_TIME);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Full build time, for tooltips, e.g. "Nov 25, 2026, 8:20 PM". */
export function buildTimeText() {
  if (!BUILD_TIME) return '';
  const d = new Date(BUILD_TIME);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** One-line summary, e.g. "v1.0.0 · updated Nov 25, 2026". */
export function versionLine() {
  const date = buildDateText();
  return `v${APP_VERSION}${date ? ` · updated ${date}` : ''}`;
}
