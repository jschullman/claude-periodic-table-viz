// All drawing. Pure function of (ctx, model) where model comes from the timeline,
// so frame N always looks identical however it was reached.

import { STAGE, ERA_INFO, layoutForEra, smoothstep } from './layouts.js';
import { FADE_FRAMES, GLOW_FRAMES, RECENT_FRAMES } from './timeline.js';

export const PALETTE = {
  bg: '#0f1118',
  rule: 'rgba(232,234,240,0.14)',
  text: '#e9ebf2',
  dim: '#8f97ab',
  faint: '#5d6577',
  accent: '#e8c46a',
  block: { s: '#d98a6a', p: '#66a3b5', d: '#9098cc', f: '#c7a557' }
};
const BLOCK_ORDER = [['s', 's-block'], ['p', 'p-block'], ['d', 'd-block'], ['f', 'f-block']];
const FONT = '"Liberation Sans", Arial, Helvetica, sans-serif';

const f = (w, px) => `${w} ${px.toFixed(2)}px ${FONT}`;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// --- the per-frame model -----------------------------------------------------

export function buildModel(state, data) {
  const { elements, milestones } = data;
  const { year, frame } = state;

  const presence = e => smoothstep(e.arrivalFrame, e.arrivalFrame + FADE_FRAMES, frame);
  const glow = e => e.year < 1600 ? 0
    : 1 - smoothstep(e.arrivalFrame, e.arrivalFrame + GLOW_FRAMES, frame);

  const A = layoutForEra(state.eraA, elements, year, presence);
  const B = state.eraA === state.eraB ? A : layoutForEra(state.eraB, elements, year, presence);
  const t = state.blend;

  // How far the typical element moves in this morph. When almost everything is
  // reshuffling (1869) nothing is exceptional and nothing lifts; when only a
  // handful move (the actinides in 1945) those few are the exception.
  const travels = [];
  if (t > 0 && t < 1) {
    for (const e of elements) {
      const ra = A.cells.get(e.Z), rb = B.cells.get(e.Z);
      if (ra && rb && presence(e) > 0.4) travels.push(Math.hypot(rb.x - ra.x, rb.y - ra.y));
    }
    travels.sort((a, b) => a - b);
  }
  const median = travels.length ? travels[travels.length >> 1] : 0;

  const rects = new Map();
  const lift = new Map();
  for (const e of elements) {
    const ra = A.cells.get(e.Z), rb = B.cells.get(e.Z);
    const r = !ra ? rb : !rb ? ra : {
      x: lerp(ra.x, rb.x, t), y: lerp(ra.y, rb.y, t),
      w: lerp(ra.w, rb.w, t), h: lerp(ra.h, rb.h, t)
    };
    if (r) rects.set(e.Z, r);
    // A cell crossing a long distance has to fly over cells that are staying put
    // (the actinides drop straight through the lanthanide row in 1945). Lift it
    // off the plane for the crossing and draw it last, so it reads as passing
    // over rather than colliding.
    let lf = 0;
    if (ra && rb && t > 0 && t < 1) {
      const d = Math.hypot(rb.x - ra.x, rb.y - ra.y);
      const floor = Math.max(rb.h * 1.4, median * 2.2);
      lf = clamp01((d - floor) / (rb.h * 1.6)) * Math.sin(Math.PI * t);
    }
    lift.set(e.Z, lf);
  }

  const known = elements.filter(e => presence(e) > 0.5).length;
  let active = null;
  for (const ms of milestones) if (ms.frame <= frame) active = ms;
  const msAlpha = active ? smoothstep(active.frame, active.frame + 20, frame) : 0;

  // Most recent arrival, for the "just discovered" readout.
  let recent = null;
  for (const e of elements) {
    if (e.year < 1600 || e.arrivalFrame > frame) continue;
    if (!recent || e.arrivalFrame > recent.arrivalFrame) recent = e;
  }
  const recentFade = recent
    ? 1 - smoothstep(recent.arrivalFrame + FADE_FRAMES, recent.arrivalFrame + RECENT_FRAMES, frame)
    : 0;

  return {
    ...state, elements, rects, lift, presence, glow, known,
    A, B, t, milestone: active, msAlpha,
    recent: recentFade > 0.01 ? recent : null, recentFade
  };
}

// --- pieces ------------------------------------------------------------------

function drawCell(ctx, r, e, alpha, g, secW, secZ, lf) {
  if (alpha <= 0.004 || r.w <= 1) return;
  const col = PALETTE.block[e.block];
  const pop = (0.82 + 0.18 * alpha) * (1 + 0.05 * g) * (1 + 0.16 * (lf || 0));
  const w = r.w * pop, h = r.h * pop;
  const x = r.x - (w - r.w) / 2, y = r.y - (h - r.h) / 2;
  const rad = Math.min(w, h) * 0.14;

  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, h, rad);
  if (lf > 0.01) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 26 * lf;
    ctx.shadowOffsetY = 7 * lf;
    ctx.fillStyle = PALETTE.bg;                 // opaque base so it occludes cleanly
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = rgba(col, 0.18 + 0.3 * g + 0.12 * (lf || 0));
  ctx.fill();
  ctx.lineWidth = lerp(1.3, 2.2, g);
  ctx.strokeStyle = g > 0.02 ? `rgba(255,255,255,${0.35 + 0.55 * g})` : rgba(col, 0.62);
  ctx.stroke();

  if (g > 0.02) {                       // brief halo on arrival
    ctx.globalAlpha = alpha * g * 0.55;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, rad + 3);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }

  ctx.globalAlpha = alpha;
  const wide = h > 34;
  const nameRoom = h > 44 && w > 58;
  const symSize = Math.min(h * (nameRoom ? 0.42 : 0.5), w * 0.55);
  ctx.font = f(700, symSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(e.symbol, x + w / 2, y + h * (nameRoom ? 0.58 : 0.68));

  if (wide) {
    const small = Math.min(h * 0.2, w * 0.24);
    ctx.font = f(400, small);
    ctx.textAlign = 'left';
    if (secZ > 0.01) {
      ctx.globalAlpha = alpha * secZ;
      ctx.fillStyle = rgba(col, 0.95);
      ctx.fillText(String(e.Z), x + w * 0.09, y + h * 0.25);
    }
    if (secW > 0.01) {
      ctx.globalAlpha = alpha * secW;
      ctx.fillStyle = rgba(col, 0.95);
      ctx.fillText(e.weight >= 100 ? e.weight.toFixed(0) : e.weight.toFixed(1), x + w * 0.09, y + h * 0.25);
    }
    ctx.globalAlpha = alpha;
  }
  if (nameRoom) {
    ctx.font = f(400, Math.min(h * 0.155, w * 0.17));
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.faint;
    const nm = e.name.length > 11 ? e.name.slice(0, 10) + '.' : e.name;
    ctx.fillText(nm, x + w / 2, y + h * 0.9);
  }
  ctx.globalAlpha = 1;
}

function drawGhost(ctx, gh, alpha) {
  if (alpha <= 0.004) return;
  ctx.globalAlpha = alpha;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(PALETTE.accent, 0.62);
  roundRect(ctx, gh.x, gh.y, gh.w, gh.h, Math.min(gh.w, gh.h) * 0.14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(PALETTE.accent, 0.85);
  const hasSub = gh.h > 48;
  ctx.font = f(700, Math.min(gh.h * (hasSub ? 0.4 : 0.48), gh.w * 0.5));
  ctx.fillText(gh.glyph, gh.x + gh.w / 2, gh.y + gh.h * (hasSub ? 0.55 : 0.68));
  if (gh.label) {
    ctx.font = f(400, Math.min(gh.h * 0.155, gh.w * 0.155));
    ctx.fillStyle = rgba(PALETTE.accent, 0.7);
    ctx.fillText(gh.label, gh.x + gh.w / 2, gh.y + gh.h * 0.9);
  }
  ctx.globalAlpha = 1;
}

function drawDecor(ctx, L, alpha, presence) {
  if (alpha <= 0.004) return;
  for (const fr of L.frames) {
    ctx.globalAlpha = alpha * 0.75;
    ctx.setLineDash(fr.dashed ? [7, 6] : []);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = PALETTE.rule;
    roundRect(ctx, fr.x, fr.y, fr.w, fr.h, 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const lb of L.labels) {
    ctx.globalAlpha = alpha * (lb.alpha === undefined ? 1 : lb.alpha);
    ctx.textAlign = lb.align;
    ctx.textBaseline = 'alphabetic';
    ctx.font = f(lb.kind === 'head' ? 700 : 400, lb.size);
    ctx.fillStyle = lb.kind === 'head' ? PALETTE.dim
      : lb.kind === 'tray' ? rgba(PALETTE.accent, 0.8) : PALETTE.faint;
    if (lb.kind === 'tray') ctx.letterSpacing = '2px';
    ctx.fillText(lb.text, lb.x, lb.y);
    ctx.letterSpacing = '0px';
  }
  ctx.globalAlpha = 1;
}

function drawYear(ctx, year, known) {
  const digits = String(Math.floor(year)).split('');
  const size = 128, slot = 74;
  ctx.font = f(700, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  digits.forEach((d, i) => ctx.fillText(d, 64 + slot * i + slot / 2, 160));

  ctx.textAlign = 'left';
  ctx.font = f(400, 22);
  ctx.fillStyle = PALETTE.dim;
  ctx.letterSpacing = '3px';
  ctx.fillText(`${known} ELEMENTS KNOWN`, 66, 196);
  ctx.letterSpacing = '0px';
}

// During a morph the two eras' furniture is faded out then in, never blended on
// top of itself - overlapping headers read as mush.
export const outA = t => 1 - smoothstep(0, 0.46, t);
export const inB = t => smoothstep(0.54, 1, t);

function drawEraBadge(ctx, eraA, eraB, t) {
  const draw = (era, a) => {
    if (a <= 0.004) return;
    const info = ERA_INFO[era];
    ctx.globalAlpha = a;
    ctx.textAlign = 'right';
    ctx.font = f(700, 42);
    ctx.fillStyle = PALETTE.text;
    ctx.letterSpacing = '4px';
    ctx.fillText(info.name, 1856, 118);
    ctx.letterSpacing = '0px';
    ctx.font = f(400, 22);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(info.sub, 1856, 152);
    ctx.font = f(400, 20);
    ctx.fillStyle = PALETTE.faint;
    ctx.fillText(info.range, 1856, 182);
    ctx.globalAlpha = 1;
  };
  if (eraA === eraB) draw(eraA, 1);
  else { draw(eraA, outA(t)); draw(eraB, inB(t)); }
}

function drawLegend(ctx) {
  let x = 700;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const [k, label] of BLOCK_ORDER) {
    ctx.fillStyle = rgba(PALETTE.block[k], 0.28);
    roundRect(ctx, x, 132, 20, 20, 5);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.block[k], 0.75);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.font = f(400, 19);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(label, x + 28, 143);
    x += 28 + ctx.measureText(label).width + 30;
  }
  ctx.textBaseline = 'alphabetic';
}

function drawCaption(ctx, m) {
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(64, 944.5); ctx.lineTo(1856, 944.5); ctx.stroke();

  if (!m.milestone) {                          // opening card, before 1669
    ctx.textAlign = 'left';
    ctx.font = f(700, 30);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('The periodic table, 1600 to 2026', 64, 999);
    ctx.font = f(400, 22);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText('Elements appear as they are discovered. The layout changes as chemistry learns how to read them.', 64, 1034);
  }
  if (m.milestone) {
    const a = m.msAlpha;
    ctx.globalAlpha = a;
    ctx.textAlign = 'left';
    ctx.font = f(700, 40);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText(String(m.milestone.year), 64, 1000);
    ctx.font = f(700, 30);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(m.milestone.headline, 180, 999);
    ctx.font = f(400, 22);
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(m.milestone.detail, 180, 1034);
    ctx.globalAlpha = 1;
  }

  if (m.recent && m.recentFade > 0.01) {
    const a = Math.min(1, m.recentFade * 1.6);
    ctx.globalAlpha = a;
    ctx.textAlign = 'right';
    ctx.font = f(400, 17);
    ctx.fillStyle = PALETTE.faint;
    ctx.letterSpacing = '3px';
    ctx.fillText('JUST DISCOVERED', 1856, 982);
    ctx.letterSpacing = '0px';
    ctx.font = f(700, 30);
    ctx.fillStyle = rgba(PALETTE.block[m.recent.block], 1);
    ctx.fillText(`${m.recent.name}  ${m.recent.symbol}`, 1856, 1016);
    ctx.font = f(400, 18);
    ctx.fillStyle = PALETTE.faint;
    const who = m.recent.discoverer.length > 44 ? m.recent.discoverer.slice(0, 43) + '.' : m.recent.discoverer;
    ctx.fillText(who + (m.recent.disputed ? '  (disputed)' : ''), 1856, 1042);
    ctx.globalAlpha = 1;
  }
}

function drawProgress(ctx, frame, total) {
  ctx.fillStyle = 'rgba(232,234,240,0.09)';
  ctx.fillRect(0, 1074, STAGE.w, 3);
  ctx.fillStyle = rgba(PALETTE.accent, 0.75);
  ctx.fillRect(0, 1074, STAGE.w * (frame / Math.max(1, total - 1)), 3);
}

// --- the frame ---------------------------------------------------------------

export function drawFrame(ctx, m, totalFrames) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, STAGE.w, STAGE.h);

  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(64, 214.5); ctx.lineTo(1856, 214.5); ctx.stroke();

  drawYear(ctx, m.year, m.known);
  drawEraBadge(ctx, m.eraA, m.eraB, m.t);
  drawLegend(ctx);

  drawDecor(ctx, m.A, m.eraA === m.eraB ? 1 : outA(m.t), m.presence);
  if (m.eraA !== m.eraB) drawDecor(ctx, m.B, inB(m.t), m.presence);

  const secWeight = blendSecondary(m, 'weight');
  const secZ = blendSecondary(m, 'Z');

  // Lifted cells last, so they fly over everything they cross.
  const order = m.elements.slice().sort((a, b) => (m.lift.get(a.Z) || 0) - (m.lift.get(b.Z) || 0));
  for (const e of order) {
    const r = m.rects.get(e.Z);
    if (!r) continue;
    drawCell(ctx, r, e, m.presence(e), m.glow(e), secWeight, secZ, m.lift.get(e.Z) || 0);
  }

  const ghostAlpha = (gh, eraAlpha) => {
    const el = m.elements.find(x => x.Z === gh.forZ);
    return eraAlpha * (el ? 1 - m.presence(el) : 1);
  };
  for (const gh of m.A.ghosts) drawGhost(ctx, gh, ghostAlpha(gh, m.eraA === m.eraB ? 1 : outA(m.t)));
  if (m.eraA !== m.eraB) for (const gh of m.B.ghosts) drawGhost(ctx, gh, ghostAlpha(gh, inB(m.t)));

  drawCaption(ctx, m);
  drawProgress(ctx, m.frame, totalFrames);
}

function blendSecondary(m, want) {
  const a = m.A.secondary === want ? 1 : 0;
  const b = m.B.secondary === want ? 1 : 0;
  return lerp(a, b, m.t);
}
