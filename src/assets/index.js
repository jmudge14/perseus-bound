// Artwork registry — the ONLY place the app looks up images.
//
// Every image is found by folder + file name, whatever its extension (.svg, .png, .webp,
// .jpg or .gif). To replace a piece of art, put the new file in the same folder with the
// same name and delete the old one. To add art to an empty slot, drop the file in. No code
// changes are needed: Vite picks the files up at build time and inlines them into the
// single-file build.
//
// Slots that have no file use a plain fallback (text, or a simple shape drawn in code) so
// the game stays playable before the art exists. See assets/README.md for the full list.

const files = import.meta.glob('./**/*.{svg,png,webp,jpg,jpeg,gif}', { eager: true, import: 'default' });

const EXT_ORDER = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif'];

/** URL of `folder/name.<any image ext>`, or null if the slot is empty. */
export function art(folder, name) {
  for (const ext of EXT_ORDER) {
    const url = files[`./${folder}/${name}.${ext}`];
    if (url) return url;
  }
  return null;
}

// Engine part ids (constants.js) → file names in assets/engine/
const ENGINE_FILES = {
  ionizer: 'hydrogen-ionizer',
  combustor: 'exhaust-combustor',
  nuclear: 'nuclear-fuel-supply',
  chamber: 'reaction-chamber',
};

export const tokenArt = (kind) => art('tokens', kind); // player | enemy | player-yellow
export const elementArt = (k) => art('elements', k); // C | O2 | H2 | Cu | Ti | U | debt
export const engineArt = (id) => art('engine', ENGINE_FILES[id] || id);
export const iconArt = (name) => art('icons', name); // see README for names
export const backgroundArt = () => art('backgrounds', 'background');

/**
 * Die face: dice/<kind>-<value>, e.g. dice/black-3.png. Kinds: black, white, d6,
 * unknown (yellow planet), hostile (red planet), friendly (green planet).
 * `yellow` is accepted as an alias of `unknown`.
 */
export function dieArt(kind, value) {
  const k = kind === 'yellow' ? 'unknown' : kind;
  return art('dice', `${k}-${value}`);
}
