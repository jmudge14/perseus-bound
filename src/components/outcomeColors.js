import { SHIP_INFO, ELEMENT_INFO } from '../game/constants.js';

// Colour keys used for dice outcomes. Ship resources and elements reuse the colours
// of their tracks and cubes, so a roll's meaning is recognisable at a glance.
const EXTRA = {
  enemy: '#ff7b6b',
  bad: '#ff7b6b',
  hostile: '#ff6a64',
  good: '#79d98a',
  friendly: '#6fd673',
  unknown: '#f3d34a',
  neutral: '#9aa3b8',
};

// Some cube colours are too dark (Carbon) to read as text on the dark background.
const TEXT_OVERRIDE = { C: '#c9c9cf' };

export function outcomeColor(key) {
  if (TEXT_OVERRIDE[key]) return TEXT_OVERRIDE[key];
  if (SHIP_INFO[key]) return SHIP_INFO[key].color;
  if (ELEMENT_INFO[key]) return ELEMENT_INFO[key].color;
  return EXTRA[key] || '#e6e9f2';
}

