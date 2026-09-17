#!/usr/bin/env node
// Deterministic frame capture: drive the page frame-by-frame in headless Chromium
// and pipe every frame straight into ffmpeg. Nothing here reads a clock, so the
// same frame range always produces the same bytes.
//
//   node render/capture.js [--out out/periodic-table.mp4] [--start 0] [--end N]
//                          [--fps 60] [--crf 17] [--png-dir DIR] [--no-video]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../scripts/serve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const o = { out: 'out/periodic-table.mp4', start: 0, end: null, fps: 60, crf: 17, pngDir: null, video: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--start') o.start = +argv[++i];
    else if (a === '--end') o.end = +argv[++i];
    else if (a === '--fps') o.fps = +argv[++i];
    else if (a === '--crf') o.crf = +argv[++i];
    else if (a === '--png-dir') o.pngDir = argv[++i];
    else if (a === '--no-video') o.video = false;
  }
  return o;
}

// The container ships one Chromium build; prefer it over whatever this
// playwright version would download.
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const p of ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) {
    if (fs.existsSync(p)) return fs.realpathSync(p);
  }
  return undefined;
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const dir = '/opt/pw-browsers';
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir)) {
      if (!d.startsWith('ffmpeg')) continue;
      for (const c of ['ffmpeg-linux', 'ffmpeg']) {
        const p = path.join(dir, d, c);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return 'ffmpeg';
}

const O = args(process.argv.slice(2));

const server = await serve(0);
const port = server.address().port;
const url = `http://127.0.0.1:${port}/src/index.html?render=1`;

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
         '--font-render-hinting=none', '--disable-gpu']
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__viz && window.__viz.ready, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);

const total = await page.evaluate(() => window.__viz.totalFrames);
const start = Math.max(0, O.start);
const end = O.end === null ? total - 1 : Math.min(total - 1, O.end);
const count = end - start + 1;
console.log(`capturing frames ${start}..${end} (${count} of ${total}) at ${O.fps}fps -> ${(count / O.fps).toFixed(1)}s`);

if (O.pngDir) fs.mkdirSync(path.resolve(ROOT, O.pngDir), { recursive: true });

let ff = null, done = null;
if (O.video) {
  const outPath = path.resolve(ROOT, O.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const bin = ffmpegPath();
  ff = spawn(bin, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(O.fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(O.crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-vf', 'format=yuv420p', '-r', String(O.fps),
    outPath
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  done = new Promise((res, rej) => {
    ff.on('close', c => c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)));
    ff.on('error', rej);
  });
  ff.stdin.on('error', e => { if (e.code !== 'EPIPE') throw e; });
  console.log(`ffmpeg: ${bin} -> ${outPath}`);
}

const t0 = Date.now();
for (let n = start; n <= end; n++) {
  await page.evaluate(f => window.__viz.seek(f), n);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 }, type: 'png' });
  if (O.pngDir) {
    fs.writeFileSync(path.resolve(ROOT, O.pngDir, `f${String(n).padStart(6, '0')}.png`), buf);
  }
  if (ff && !ff.stdin.write(buf)) {
    await new Promise(r => ff.stdin.once('drain', r));
  }
  if ((n - start) % 120 === 0 || n === end) {
    const i = n - start + 1;
    const el = (Date.now() - t0) / 1000;
    const eta = el / i * (count - i);
    process.stdout.write(
      `\r  ${i}/${count}  ${(i / el).toFixed(1)} fps  elapsed ${el.toFixed(0)}s  eta ${eta.toFixed(0)}s   `);
  }
}
process.stdout.write('\n');

if (ff) { ff.stdin.end(); await done; }
await browser.close();
server.close();
console.log('done in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
