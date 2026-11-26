// All the numbers and tables from the Perseus Bound rulebook live here,
// so balance tweaks only need to happen in one place.

export const BOARD_SIZE = 6;
export const MAX_ELEMENT = 6; // 6 tokens of each element exist
export const MAX_DEBT = 6; // more than 6 debt = ship seized
export const DICE_POOL = { unknown: 3, hostile: 6, friendly: 6 };

export const ELEMENTS = ['C', 'O2', 'H2', 'Cu', 'Ti', 'U'];

export const ELEMENT_INFO = {
  C: { label: 'C', name: 'Carbon', color: '#5f5f5f', text: '#ffffff' },
  O2: { label: 'O₂', name: 'Oxygen', color: '#6f9fd8', text: '#0b1a2e' },
  H2: { label: 'H₂', name: 'Hydrogen', color: '#f4e04d', text: '#3a3000' },
  Cu: { label: 'Cu', name: 'Copper', color: '#f08a24', text: '#3a1a00' },
  Ti: { label: 'Ti', name: 'Titanium', color: '#f4f4f4', text: '#222222' },
  U: { label: 'U', name: 'Uranium', color: '#7cc242', text: '#132600' },
};

export const SHIP_KEYS = ['fuel', 'air', 'food', 'hull', 'power'];

export const SHIP_INFO = {
  fuel: { name: 'Rocket Fuel', short: 'Fuel', color: '#f08a24' },
  air: { name: 'Air', short: 'Air', color: '#8ec9ff' },
  food: { name: 'Food', short: 'Food', color: '#9ed36a' },
  hull: { name: 'Hull Integrity', short: 'Hull', color: '#c9d1d9' },
  power: { name: 'Power', short: 'Power', color: '#ffd54a' },
};

export const DIFFICULTY = {
  standard: {
    name: 'Standard',
    blurb: 'Recommended for new players. 18 Fuel, 6 Power, 6 Air, 6 Food, 10 Hull.',
    start: { fuel: 18, air: 6, food: 6, hull: 10, power: 6 },
    limits: { fuel: 30, air: 20, food: 10, hull: 10, power: 10 },
  },
  challenge: {
    name: 'Challenge',
    blurb:
      'Lower starting stock and limits, planets are one value lower, and fast travel drains more Power.',
    start: { fuel: 6, air: 6, food: 6, hull: 6, power: 6 },
    limits: { fuel: 10, air: 10, food: 6, hull: 6, power: 6 },
  },
};

export const START_CARGO = { C: 2, O2: 2, H2: 2, Cu: 2, Ti: 0, U: 0 };

// Battle loot / ransom table, indexed by 1D6.
export const LOOT_TABLE = [null, 'C', 'O2', 'Ti', 'H2', 'Cu', 'U'];

export const ENGINE_PARTS = [
  { id: 'ionizer', name: 'Hydrogen Ionizer', cost: { Cu: 1, H2: 2, Ti: 1 } },
  { id: 'combustor', name: 'Exhaust Combustor', cost: { Cu: 1, O2: 1, Ti: 1, H2: 1 } },
  { id: 'nuclear', name: 'Nuclear Fuel Supply', cost: { U: 3, Ti: 1 } },
  { id: 'chamber', name: 'Reaction Chamber', cost: { Cu: 1, Ti: 3 } },
];

// Maintenance operations (trade Elements for Ship Resources).
// Note: the rulebook says 2 Ti -> +2 Hull; the printed turn reference says +1.
// The rulebook value is used here.
export const MAINTENANCE = [
  { id: 'generator', label: 'Jury-rigged generator', cost: { Cu: 1, O2: 1, H2: 1 }, gain: { power: 3 } },
  { id: 'fuel', label: 'Manufacture rocket fuel', cost: { O2: 1, H2: 1 }, gain: { fuel: 18 } },
  { id: 'air', label: 'Replenish air', cost: { O2: 1 }, gain: { air: 12 } },
  { id: 'food', label: 'Grow food', cost: { C: 1 }, gain: { food: 6 } },
  { id: 'hull', label: 'Repair hull', cost: { Ti: 2 }, gain: { hull: 2 } },
];

export const PHASE_STEPS = [
  { n: 1, id: 'travel', label: 'Consume & Travel', phases: ['roll', 'travel'] },
  { n: 2, id: 'scan', label: 'Scan for Planets', phases: ['scan'] },
  { n: 3, id: 'enemies', label: 'Move Enemy Vessels', phases: ['enemies'] },
  { n: 4, id: 'battle', label: 'Battle', phases: ['battle'] },
  { n: 5, id: 'contact', label: 'Contact Planet', phases: ['contact'] },
  { n: 6, id: 'resolve', label: 'Resolve Planet', phases: ['trade'] },
  { n: 7, id: 'reduce', label: 'Reduce Planet Value', phases: [] },
  { n: 8, id: 'maintenance', label: 'Maintenance & Repair', phases: ['maintenance'] },
];
