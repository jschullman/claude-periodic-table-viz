// Deterministic timeline. Everything downstream is a pure function of frame number.

import { ERA, smoothstep } from './layouts.js';

export const FPS = 60;

// Sparse centuries run fast; crowded decades slow down. Morph cues hold the year
// still while the layout tweens underneath.
export const CUES = [
  { t: 'hold', year: 1600, sec: 2.0, era: ERA.WEIGHT },
  { t: 'run', from: 1600, to: 1669, sec: 3.0, era: ERA.WEIGHT },
  { t: 'run', from: 1669, to: 1735, sec: 4.5, era: ERA.WEIGHT },
  { t: 'run', from: 1735, to: 1790, sec: 8.0, era: ERA.WEIGHT },
  { t: 'run', from: 1790, to: 1830, sec: 9.0, era: ERA.WEIGHT },
  { t: 'run', from: 1830, to: 1869, sec: 7.5, era: ERA.WEIGHT },
  { t: 'morph', year: 1869, sec: 2.4, from: ERA.WEIGHT, to: ERA.MENDELEEV },
  { t: 'run', from: 1869, to: 1894, sec: 7.0, era: ERA.MENDELEEV },
  { t: 'run', from: 1894, to: 1913, sec: 6.5, era: ERA.MENDELEEV },
  { t: 'morph', year: 1913, sec: 2.4, from: ERA.MENDELEEV, to: ERA.MOSELEY },
  { t: 'run', from: 1913, to: 1945, sec: 9.5, era: ERA.MOSELEY },
  { t: 'morph', year: 1945, sec: 2.4, from: ERA.MOSELEY, to: ERA.MODERN },
  { t: 'run', from: 1945, to: 1975, sec: 7.5, era: ERA.MODERN },
  { t: 'run', from: 1975, to: 2002, sec: 6.0, era: ERA.MODERN },
  { t: 'run', from: 2002, to: 2026, sec: 6.0, era: ERA.MODERN },
  { t: 'hold', year: 2026, sec: 5.0, era: ERA.MODERN }
];

function buildSchedule() {
  const out = [];
  let f = 0;
  let lastRate = 20;
  for (const c of CUES) {
    const frames = Math.round(c.sec * FPS);
    const rate = c.t === 'run' ? (c.to - c.from) / c.sec : lastRate;
    if (c.t === 'run') lastRate = rate;
    out.push({ ...c, start: f, frames, rate });
    f += frames;
  }
  return { cues: out, total: f };
}

const SCHED = buildSchedule();
export const TOTAL_FRAMES = SCHED.total;
export const DURATION_SEC = TOTAL_FRAMES / FPS;

export function stateAtFrame(frame) {
  const f = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(frame)));
  let cue = SCHED.cues[SCHED.cues.length - 1];
  for (const c of SCHED.cues) {
    if (f < c.start + c.frames) { cue = c; break; }
  }
  const u = cue.frames <= 1 ? 1 : (f - cue.start) / cue.frames;

  if (cue.t === 'morph') {
    // 0.25s of stillness, then the tween, then 0.25s to let it settle.
    const lead = 0.25 * FPS / cue.frames;
    const tail = 1 - lead;
    const b = smoothstep(lead, tail, u);
    return {
      frame: f, year: cue.year, eraA: cue.from, eraB: cue.to,
      blend: b * b * (3 - 2 * b), rate: cue.rate, morphing: true, cue
    };
  }
  const year = cue.t === 'hold' ? cue.year : cue.from + (cue.to - cue.from) * u;
  return {
    frame: f, year, eraA: cue.era, eraB: cue.era,
    blend: 0, rate: cue.rate, morphing: false, cue
  };
}

// Frame index at which a given year is first reached (used by the scrubber ticks).
export function frameForYear(target) {
  for (const c of SCHED.cues) {
    if (c.t === 'run' && target >= c.from && target <= c.to) {
      return c.start + Math.round(c.frames * (target - c.from) / (c.to - c.from));
    }
    if (c.t !== 'run' && Math.abs(c.year - target) < 0.001) return c.start;
  }
  return 0;
}

// Attach the exact frame at which each element / milestone becomes current.
// Doing this in frame space (rather than year space) keeps arrival ramps a
// constant 0.55s whatever the local pacing, and keeps them running while a
// morph cue holds the year still.
export function annotateArrivals(elements, milestones) {
  for (const e of elements) e.arrivalFrame = e.year < 1600 ? -1000 : frameForYear(e.year);
  for (const m of milestones) m.frame = frameForYear(m.year);
}
export const FADE_FRAMES = 33;   // ~0.55s
export const GLOW_FRAMES = 96;   // ~1.6s
export const RECENT_FRAMES = 190;
