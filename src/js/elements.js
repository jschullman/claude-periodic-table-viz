// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (C) 2026 Josh Schullman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Element data loading + derived structural facts (modern block/group/period,
// Mendeleev short-form placement, era-specific gap placeholders).

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i] === undefined ? '' : cells[i]; });
    return row;
  });
}

// --- modern (IUPAC) placement -------------------------------------------------

export function modernPeriod(Z) {
  if (Z <= 2) return 1;
  if (Z <= 10) return 2;
  if (Z <= 18) return 3;
  if (Z <= 36) return 4;
  if (Z <= 54) return 5;
  if (Z <= 86) return 6;
  return 7;
}

export function isLanthanide(Z) { return Z >= 57 && Z <= 71; }
export function isActinide(Z) { return Z >= 89 && Z <= 103; }

// Group 1..18 for main-table elements; 0 for the f-block (which lives in its own row).
export function modernGroup(Z) {
  if (Z === 1) return 1;
  if (Z === 2) return 18;
  const p = modernPeriod(Z);
  if (p === 2) return Z <= 4 ? Z - 2 : Z + 8 - 5 + 5; // 3,4 -> 1,2 ; 5..10 -> 13..18
  if (p === 3) return Z <= 12 ? Z - 10 : Z - 10 + 10; // 11,12 -> 1,2 ; 13..18 -> 13..18
  if (p === 4) return Z - 18;
  if (p === 5) return Z - 36;
  if (p === 6) return isLanthanide(Z) ? 0 : (Z <= 56 ? Z - 54 : Z - 68);
  return isActinide(Z) ? 0 : (Z <= 88 ? Z - 86 : Z - 100);
}

export function blockOf(Z) {
  if (isLanthanide(Z) || isActinide(Z)) return 'f';
  const g = modernGroup(Z);
  if (Z === 2) return 's';
  if (g <= 2) return 's';
  if (g >= 13) return 'p';
  return 'd';
}

// --- Mendeleev short form (1871 style, as extended to ~1905) ------------------
// group: 0 = group zero (nobles), 1..7 = I..VII, 8 = group VIII (triads)
// sub:   'A' left-offset, 'B' right-offset, '' centred (group 0 and VIII)
// series: Mendeleev's series number; series 9 was empty and is elided in the drawing.
const M = {};
function m(sym, series, group, sub, triad) { M[sym] = { series, group, sub: sub || '', triad: triad === undefined ? -1 : triad }; }

m('H', 1, 1, 'A');                                                   m('He', 1, 0, '');
m('Li', 2, 1, 'A'); m('Be', 2, 2, 'A'); m('B', 2, 3, 'A'); m('C', 2, 4, 'A');
m('N', 2, 5, 'A'); m('O', 2, 6, 'A'); m('F', 2, 7, 'A');             m('Ne', 2, 0, '');
m('Na', 3, 1, 'A'); m('Mg', 3, 2, 'A'); m('Al', 3, 3, 'A'); m('Si', 3, 4, 'A');
m('P', 3, 5, 'A'); m('S', 3, 6, 'A'); m('Cl', 3, 7, 'A');            m('Ar', 3, 0, '');
m('K', 4, 1, 'A'); m('Ca', 4, 2, 'A'); m('Sc', 4, 3, 'A'); m('Ti', 4, 4, 'A');
m('V', 4, 5, 'A'); m('Cr', 4, 6, 'A'); m('Mn', 4, 7, 'A');
m('Fe', 4, 8, '', 0); m('Co', 4, 8, '', 1); m('Ni', 4, 8, '', 2);
m('Cu', 5, 1, 'B'); m('Zn', 5, 2, 'B'); m('Ga', 5, 3, 'B'); m('Ge', 5, 4, 'B');
m('As', 5, 5, 'B'); m('Se', 5, 6, 'B'); m('Br', 5, 7, 'B');          m('Kr', 5, 0, '');
m('Rb', 6, 1, 'A'); m('Sr', 6, 2, 'A'); m('Y', 6, 3, 'A'); m('Zr', 6, 4, 'A');
m('Nb', 6, 5, 'A'); m('Mo', 6, 6, 'A'); m('Tc', 6, 7, 'A');
m('Ru', 6, 8, '', 0); m('Rh', 6, 8, '', 1); m('Pd', 6, 8, '', 2);
m('Ag', 7, 1, 'B'); m('Cd', 7, 2, 'B'); m('In', 7, 3, 'B'); m('Sn', 7, 4, 'B');
m('Sb', 7, 5, 'B'); m('Te', 7, 6, 'B'); m('I', 7, 7, 'B');           m('Xe', 7, 0, '');
m('Cs', 8, 1, 'A'); m('Ba', 8, 2, 'A'); m('La', 8, 3, 'A');
// series 9 empty; series 10 resumes at group IV
m('Hf', 10, 4, 'A'); m('Ta', 10, 5, 'A'); m('W', 10, 6, 'A'); m('Re', 10, 7, 'A');
m('Os', 10, 8, '', 0); m('Ir', 10, 8, '', 1); m('Pt', 10, 8, '', 2);
m('Au', 11, 1, 'B'); m('Hg', 11, 2, 'B'); m('Tl', 11, 3, 'B'); m('Pb', 11, 4, 'B');
m('Bi', 11, 5, 'B'); m('Po', 11, 6, 'B'); m('At', 11, 7, 'B');       m('Rn', 11, 0, '');
m('Fr', 12, 1, 'A'); m('Ra', 12, 2, 'A'); m('Ac', 12, 3, 'A');
m('Th', 12, 4, 'A'); m('Pa', 12, 5, 'A'); m('U', 12, 6, 'A');

export const MENDELEEV = M;
// Mendeleev series -> drawn row index (series 9 held no known elements, so it is dropped)
export const SERIES_ROW = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 10: 8, 11: 9, 12: 10 };
export const MENDELEEV_ROWS = 11;

// Rare earths Mendeleev could not place: cerium through lutetium.
export const RARE_EARTH_TRAY = [];
for (let z = 58; z <= 71; z++) RARE_EARTH_TRAY.push(z);

// The four famous predictions, drawn as dashed "?" boxes until the element arrives.
export const EKA = {
  21: { name: 'eka-boron', weight: '~44' },
  31: { name: 'eka-aluminium', weight: '~68' },
  32: { name: 'eka-silicon', weight: '~72' },
  43: { name: 'eka-manganese', weight: '~100' }
};

// Moseley's numbered holes: every atomic number below 92 with no known element in 1913.
export const MOSELEY_GAPS = [43, 61, 72, 75, 85, 87];

// Pre-actinide placement: 1913-1944 chemists read Ac..Pu as a continuation of the
// d-block, so they sat in groups 3..8 of period 7.
export const PRE_ACTINIDE_GROUP = { 89: 3, 90: 4, 91: 5, 92: 6, 93: 7, 94: 8 };

export function buildElements(rows) {
  return rows.map(r => {
    const Z = +r.Z;
    return {
      Z,
      symbol: r.symbol,
      name: r.name,
      weight: +r.atomic_weight,
      year: +r.discovery_year,          // sort key; negative = prehistoric
      yearDisplay: r.year_display,
      discoverer: r.discoverer,
      source: r.source,
      disputed: r.disputed === '1',
      altYear: r.alt_year ? +r.alt_year : null,
      altBasis: r.alt_basis,
      notes: r.notes,
      block: blockOf(Z),
      group: modernGroup(Z),
      period: modernPeriod(Z),
      mendeleev: MENDELEEV[r.symbol] || null
    };
  }).sort((a, b) => a.Z - b.Z);
}
