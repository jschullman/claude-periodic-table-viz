// Interactive front end: play/pause, scrubbable timeline, milestone ticks.
// The renderer drives the exact same code path through window.__viz.

import { parseCSV, buildElements } from './elements.js';
import { TOTAL_FRAMES, FPS, stateAtFrame, frameForYear, annotateArrivals, CUES } from './timeline.js';
import { buildModel, drawFrame, PALETTE } from './draw.js';
import { STAGE } from './layouts.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = STAGE.w;
canvas.height = STAGE.h;

let data = null;
let frame = 0;
let playing = false;
let rafId = null;
let lastT = 0;

async function loadData() {
  const [eTxt, mTxt] = await Promise.all([
    fetch('../data/elements.csv').then(r => r.text()),
    fetch('../data/milestones.csv').then(r => r.text())
  ]);
  const elements = buildElements(parseCSV(eTxt));
  const milestones = parseCSV(mTxt)
    .map(r => ({ year: +r.year, headline: r.headline, detail: r.detail }))
    .sort((a, b) => a.year - b.year);
  annotateArrivals(elements, milestones);
  return { elements, milestones };
}

export function renderFrame(n) {
  frame = Math.max(0, Math.min(TOTAL_FRAMES - 1, n));
  const model = buildModel(stateAtFrame(frame), data);
  drawFrame(ctx, model, TOTAL_FRAMES);
  syncUI(model);
}

function syncUI(model) {
  const scrub = document.getElementById('scrub');
  if (scrub && document.activeElement !== scrub) scrub.value = frame;
  const t = document.getElementById('readout');
  if (t) {
    t.textContent = `frame ${frame} / ${TOTAL_FRAMES - 1}   ·   ` +
      `${(frame / FPS).toFixed(2)}s   ·   year ${model.year.toFixed(1)}   ·   ` +
      `${model.known} known`;
  }
}

function tick(now) {
  if (!playing) return;
  if (!lastT) lastT = now;
  const advance = Math.max(1, Math.round((now - lastT) / (1000 / FPS)));
  lastT = now;
  let next = frame + advance;
  if (next >= TOTAL_FRAMES) { next = TOTAL_FRAMES - 1; setPlaying(false); }
  renderFrame(next);
  if (playing) rafId = requestAnimationFrame(tick);
}

function setPlaying(v) {
  playing = v;
  lastT = 0;
  const btn = document.getElementById('play');
  btn.textContent = v ? 'Pause' : 'Play';
  if (v) {
    if (frame >= TOTAL_FRAMES - 1) frame = 0;
    rafId = requestAnimationFrame(tick);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
  }
}

function buildTicks() {
  const bar = document.getElementById('ticks');
  const marks = [1669, 1789, 1807, 1869, 1894, 1913, 1945, 2002];
  for (const y of marks) {
    const el = document.createElement('button');
    el.className = 'tick';
    el.textContent = y;
    el.onclick = () => { setPlaying(false); renderFrame(frameForYear(y)); };
    bar.appendChild(el);
  }
  for (const c of CUES) {
    if (c.t !== 'morph') continue;
    const el = document.createElement('button');
    el.className = 'tick morph';
    el.textContent = 'morph ' + c.year;
    el.onclick = () => { setPlaying(false); renderFrame(frameForYear(c.year)); };
    bar.appendChild(el);
  }
}

(async function init() {
  data = await loadData();

  const scrub = document.getElementById('scrub');
  scrub.max = TOTAL_FRAMES - 1;
  scrub.oninput = () => { setPlaying(false); renderFrame(+scrub.value); };
  document.getElementById('play').onclick = () => setPlaying(!playing);
  buildTicks();

  document.addEventListener('keydown', ev => {
    if (ev.key === ' ') { ev.preventDefault(); setPlaying(!playing); }
    if (ev.key === 'ArrowRight') { setPlaying(false); renderFrame(frame + (ev.shiftKey ? 60 : 1)); }
    if (ev.key === 'ArrowLeft') { setPlaying(false); renderFrame(frame - (ev.shiftKey ? 60 : 1)); }
  });

  // Deterministic hooks for the headless renderer.
  window.__viz = {
    totalFrames: TOTAL_FRAMES,
    fps: FPS,
    seek(n) { renderFrame(n); },
    ready: true
  };
  document.body.classList.remove('loading');
  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render-mode');
  }
  renderFrame(0);
})();
