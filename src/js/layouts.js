// Layout position functions, one per era.
//
// Every layout returns positions in the same stage coordinate space (1920x1080),
// so morphing between two eras is a straight lerp of each element's rect.
// Layouts are pure functions of (elements, year, presence) - no hidden state - which
// is what makes the whole render deterministic.

import { SERIES_ROW, MENDELEEV_ROWS, RARE_EARTH_TRAY, EKA, MOSELEY_GAPS, PRE_ACTINIDE_GROUP } from './elements.js';

export const STAGE = { w: 1920, h: 1080 };
// The rectangle every table has to live inside.
export const FIELD = { x: 64, y: 234, w: 1792, h: 690 };

export const ERA = {
  WEIGHT: 0,      // before 1869
  MENDELEEV: 1,   // 1869-1912
  MOSELEY: 2,     // 1913-1944
  MODERN: 3       // 1945-
};

export const ERA_INFO = [
  { name: 'NO SYSTEM', sub: 'ordered by atomic weight', range: 'before 1869' },
  { name: 'MENDELEEV', sub: 'short form - groups I to VIII', range: '1869 - 1912' },
  { name: 'MOSELEY', sub: 'long form - ordered by atomic number', range: '1913 - 1944' },
  { name: 'SEABORG', sub: 'modern 18 columns with two f-block rows', range: '1945 - today' }
];

export function smoothstep(a, b, t) {
  if (b === a) return t <= a ? 0 : 1;
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

// Cell metrics. Cells are allowed to be wider than tall (up to maxAspect) so a
// tall narrow table still fills a 16:9 frame instead of stranding half of it.
function metrics(colBudget, rowBudget, maxAspect, maxH) {
  let ch = FIELD.h / rowBudget;
  if (maxH) ch = Math.min(ch, maxH);
  let cw = Math.min(FIELD.w / colBudget, ch * maxAspect);
  ch = Math.min(ch, cw);
  return { cw, ch };
}

// ---------------------------------------------------------------------------
// Era 0 - the flowing weight-ordered grid
//
// Each element's index in the queue is the sum of the *presences* of every
// lighter element, so an arriving element pushes its neighbours along
// continuously instead of snapping. The grid is serpentine (boustrophedon) so
// that the index -> (x, y) mapping is continuous at the end of each row: the
// last fraction of a row's index budget is spent moving straight down.
// ---------------------------------------------------------------------------

// Column count as a smooth function of the year alone (deterministic, no feedback).
const COL_STOPS = [[1600, 6], [1700, 7], [1755, 8], [1790, 9], [1812, 10], [1835, 11], [1869, 12]];
export function weightGridCols(year) {
  if (year <= COL_STOPS[0][0]) return COL_STOPS[0][1];
  for (let i = 1; i < COL_STOPS.length; i++) {
    const [y0, c0] = COL_STOPS[i - 1], [y1, c1] = COL_STOPS[i];
    if (year <= y1) return c0 + (c1 - c0) * smoothstep(y0, y1, year);
  }
  return COL_STOPS[COL_STOPS.length - 1][1];
}

function serpentine(idx, cols) {
  const r = Math.floor(idx / cols);
  const u = idx - r * cols;
  const g = Math.min(u, cols - 1);       // horizontal travel within the row
  const v = Math.max(0, u - (cols - 1)); // the last fraction of the row: drop down
  const even = (r % 2) === 0;
  return { cx: even ? g : (cols - 1 - g), cy: r + v };
}

export function layoutWeightGrid(elements, year, presence) {
  const order = elements.slice().sort((a, b) => a.weight - b.weight || a.Z - b.Z);
  const cols = weightGridCols(year);
  let total = 0;
  for (const e of order) total += presence(e);

  const rowsNeeded = Math.max(3, Math.ceil((total + 0.001) / cols));
  const { cw, ch } = metrics(cols + 0.5, rowsNeeded + 0.5, 1.28, 136);
  const gridW = cols * cw;
  const gridH = rowsNeeded * ch;
  const ox = FIELD.x + (FIELD.w - gridW) / 2;
  const oy = FIELD.y + (FIELD.h - gridH) / 2;
  const pad = Math.min(cw, ch) * 0.07;

  const cells = new Map();
  let idx = 0;
  for (const e of order) {
    const p = presence(e);
    const { cx, cy } = serpentine(idx, cols);
    cells.set(e.Z, {
      x: ox + cx * cw + pad, y: oy + cy * ch + pad,
      w: cw - pad * 2, h: ch - pad * 2
    });
    idx += p;
  }
  return { cells, ghosts: [], labels: [], frames: [], secondary: 'weight' };
}

// ---------------------------------------------------------------------------
// Era 1 - Mendeleev's short form
//
// 11 columns: group 0, groups I..VII, then group VIII as a triad of three
// sub-columns. A/B subgroups are offset left/right inside their column.
// Group zero only exists once the nobles arrive, so the column count is blended
// from 10 to 11 across 1894.
// ---------------------------------------------------------------------------

const GROUP_NUMERALS = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function nobleBlend(year) { return smoothstep(1893.4, 1895.6, year); }

function mendeleevGeom(year) {
  const nb = nobleBlend(year);
  const cols = 10 + nb;                       // 10 without group zero, 11 with
  const trayRows = 2.55;                      // tray box + its caption
  const rows = MENDELEEV_ROWS + 0.85 + trayRows;
  const { cw, ch } = metrics(cols + 0.5, rows, 1.95);
  const gridW = cols * cw;
  const ox = FIELD.x + (FIELD.w - gridW) / 2;
  const headH = ch * 0.85;
  const oy = FIELD.y + headH;
  return { nb, cols, cw, ch, ox, oy, headH, trayRows };
}

// column index (0-based, fractional while group zero fades in)
function mendCol(entry, nb) {
  if (entry.group === 0) return 0;
  if (entry.group === 8) return 7 + entry.triad + nb;
  return (entry.group - 1) + nb;
}

export function layoutMendeleev(elements, year, presence) {
  const G = mendeleevGeom(year);
  const pad = G.cw * 0.09;
  const cells = new Map();
  const ghosts = [];
  const labels = [];
  const frames = [];
  const subOff = G.cw * 0.15;

  const place = (col, row, sub) => {
    const dx = sub === 'A' ? -subOff : sub === 'B' ? subOff : 0;
    return {
      x: G.ox + col * G.cw + pad + dx, y: G.oy + row * G.ch + pad * 0.6,
      w: G.cw - pad * 2, h: G.ch - pad * 1.2
    };
  };

  for (const e of elements) {
    const me = e.mendeleev;
    if (!me) continue;
    if (e.Z >= 58 && e.Z <= 71) continue; // rare earths go to the tray
    cells.set(e.Z, place(mendCol(me, G.nb), SERIES_ROW[me.series], me.sub));
  }

  // Mendeleev's predicted-but-missing boxes.
  for (const zs of Object.keys(EKA)) {
    const z = +zs;
    const e = elements.find(el => el.Z === z);
    if (!e || !e.mendeleev) continue;
    const r = place(mendCol(e.mendeleev, G.nb), SERIES_ROW[e.mendeleev.series], e.mendeleev.sub);
    ghosts.push({ key: 'eka' + z, ...r, glyph: '?', label: EKA[z].name, sub: EKA[z].weight, forZ: z });
  }

  // Column headers.
  for (let g = 0; g <= 8; g++) {
    const cols = g === 8 ? [7, 8, 9] : [g === 0 ? -1 : g - 1];
    if (g === 8) {
      labels.push({
        x: G.ox + (8 + G.nb) * G.cw + G.cw / 2, y: G.oy - G.headH * 0.32,
        text: 'VIII', size: G.ch * 0.42, align: 'center', kind: 'head',
        alpha: 1
      });
    } else if (g === 0) {
      labels.push({
        x: G.ox + G.cw / 2, y: G.oy - G.headH * 0.32,
        text: '0', size: G.ch * 0.42, align: 'center', kind: 'head', alpha: G.nb
      });
    } else {
      labels.push({
        x: G.ox + (g - 1 + G.nb) * G.cw + G.cw / 2, y: G.oy - G.headH * 0.32,
        text: GROUP_NUMERALS[g], size: G.ch * 0.42, align: 'center', kind: 'head', alpha: 1
      });
    }
  }
  // Series numbers down the left edge.
  for (const s of Object.keys(SERIES_ROW)) {
    labels.push({
      x: G.ox - G.cw * 0.28, y: G.oy + SERIES_ROW[s] * G.ch + G.ch * 0.62,
      text: s, size: G.ch * 0.34, align: 'right', kind: 'axis', alpha: 0.85
    });
  }

  // The rare-earth tray: fixed slots so arrivals fade in without reflowing.
  const trayTop = G.oy + MENDELEEV_ROWS * G.ch + G.ch * 0.55;
  const trayH = G.ch * 1.15;
  const slotW = Math.min(G.cw * 0.86, (G.cols * G.cw - G.cw * 0.6) / RARE_EARTH_TRAY.length);
  const trayW = slotW * RARE_EARTH_TRAY.length + G.cw * 0.5;
  const trayX = G.ox + (G.cols * G.cw - trayW) / 2;
  frames.push({ x: trayX, y: trayTop, w: trayW, h: trayH + G.ch * 0.72, dashed: true });
  labels.push({
    x: trayX + trayW / 2, y: trayTop + trayH + G.ch * 0.52,
    text: 'RARE EARTHS - NO PLACE IN THE SYSTEM', size: G.ch * 0.29,
    align: 'center', kind: 'tray', alpha: 1
  });
  RARE_EARTH_TRAY.forEach((z, i) => {
    cells.set(z, {
      x: trayX + G.cw * 0.25 + i * slotW + slotW * 0.05,
      y: trayTop + G.ch * 0.22,
      w: slotW * 0.9, h: trayH * 0.74
    });
  });

  return { cells, ghosts, labels, frames, secondary: 'weight' };
}

// ---------------------------------------------------------------------------
// Eras 2 and 3 - the long form
//
// Shared 18-column geometry. Moseley (era 2) keeps Ac..Pu in groups 3..8 of
// period 7 and drops only the lanthanides into a separate row; Seaborg (era 3)
// pulls the actinides down into a second f-block row. The morph between the two
// is the whole point of the film, so both use identical column metrics and the
// heavy elements simply slide.
// ---------------------------------------------------------------------------

// Moseley and Seaborg share one geometry (both budget two f-block rows, Moseley
// simply leaves the second empty) so that the 1945 morph is purely the actinides
// sliding down - no column drift, no header wobble.
function longGeom() {
  const cols = 18;
  const gap = 0.55;
  const rows = 7 + gap + 2;
  const { cw, ch } = metrics(cols + 0.35, rows + 0.85, 1.6);
  const gridW = cols * cw;
  const ox = FIELD.x + (FIELD.w - gridW) / 2;
  const headH = ch * 0.8;
  const oy = FIELD.y + headH;
  return { cols, cw, ch, ox, oy, headH, gap, fTop: 7 + gap };
}

function longPlace(G, col, row) {
  const pad = G.cw * 0.075;
  return {
    x: G.ox + col * G.cw + pad, y: G.oy + row * G.ch + pad,
    w: G.cw - pad * 2, h: G.ch - pad * 2
  };
}

// The 15 f-block cells sit under groups 3..17 (column indices 2..16).
function fSlot(G, i) { return 2 + i; }

function longLabels(G) {
  const labels = [];
  for (let g = 1; g <= 18; g++) {
    labels.push({
      x: G.ox + (g - 1) * G.cw + G.cw / 2, y: G.oy - G.headH * 0.3,
      text: String(g), size: G.ch * 0.32, align: 'center', kind: 'head', alpha: 0.9
    });
  }
  for (let p = 1; p <= 7; p++) {
    labels.push({
      x: G.ox - G.cw * 0.22, y: G.oy + (p - 1) * G.ch + G.ch * 0.62,
      text: String(p), size: G.ch * 0.32, align: 'right', kind: 'axis', alpha: 0.7
    });
  }
  return labels;
}

export function layoutMoseley(elements, year, presence) {
  const G = longGeom();
  const cells = new Map();
  const ghosts = [];
  const labels = longLabels(G);

  for (const e of elements) {
    if (e.Z >= 57 && e.Z <= 71) {                       // lanthanides: own row
      cells.set(e.Z, longPlace(G, fSlot(G, e.Z - 57), G.fTop));
      continue;
    }
    if (PRE_ACTINIDE_GROUP[e.Z]) {                      // Ac..Pu as period-7 d-block
      cells.set(e.Z, longPlace(G, PRE_ACTINIDE_GROUP[e.Z] - 1, 6));
      continue;
    }
    if (e.Z >= 95) {
      // Americium and curium (1944) were slotted in as the next period-7 d-block
      // members - the misfit that pushed Seaborg to rewrite the table a year later.
      cells.set(e.Z, longPlace(G, Math.min(17, e.Z - 87), 6));
      continue;
    }
    cells.set(e.Z, longPlace(G, e.group - 1, e.period - 1));
  }

  // Group-3 cell of period 6 points at the lanthanide row.
  labels.push({
    x: G.ox + 2 * G.cw + G.cw / 2, y: G.oy + 5 * G.ch + G.ch * 0.6,
    text: '57-71', size: G.ch * 0.3, align: 'center', kind: 'ref', alpha: 0.75
  });

  for (const z of MOSELEY_GAPS) {
    const r = cells.get(z);
    if (r) ghosts.push({ key: 'gap' + z, ...r, glyph: '?', label: String(z), sub: '', forZ: z });
  }
  return { cells, ghosts, labels, frames: [], secondary: 'Z' };
}

export function layoutModern(elements, year, presence) {
  const G = longGeom();
  const cells = new Map();
  const labels = longLabels(G);

  for (const e of elements) {
    if (e.Z >= 57 && e.Z <= 71) { cells.set(e.Z, longPlace(G, fSlot(G, e.Z - 57), G.fTop)); continue; }
    if (e.Z >= 89 && e.Z <= 103) { cells.set(e.Z, longPlace(G, fSlot(G, e.Z - 89), G.fTop + 1)); continue; }
    cells.set(e.Z, longPlace(G, e.group - 1, e.period - 1));
  }
  labels.push({
    x: G.ox + 2 * G.cw + G.cw / 2, y: G.oy + 5 * G.ch + G.ch * 0.6,
    text: '57-71', size: G.ch * 0.3, align: 'center', kind: 'ref', alpha: 0.75
  });
  labels.push({
    x: G.ox + 2 * G.cw + G.cw / 2, y: G.oy + 6 * G.ch + G.ch * 0.6,
    text: '89-103', size: G.ch * 0.3, align: 'center', kind: 'ref', alpha: 0.75
  });
  return { cells, ghosts: [], labels, frames: [], secondary: 'Z' };
}

export function layoutForEra(era, elements, year, presence) {
  switch (era) {
    case ERA.WEIGHT: return layoutWeightGrid(elements, year, presence);
    case ERA.MENDELEEV: return layoutMendeleev(elements, year, presence);
    case ERA.MOSELEY: return layoutMoseley(elements, year, presence);
    default: return layoutModern(elements, year, presence);
  }
}
