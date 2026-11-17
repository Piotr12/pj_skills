#!/usr/bin/env node
/* Render a deck's listen-along as a video: the slides drawn and built in time with the recording,
 * with the recording as the sound track. Run through scripts/export.sh (it provides
 * playwright-core); needs Google Chrome and ffmpeg.
 *
 * Frame by frame, not a screen recording: the deck's clock is stepped (deck.capture), each frame
 * is a screenshot, ffmpeg encodes H.264 + AAC. Frames in which nothing moves are reused, so the
 * export takes roughly as long as the recording. Slides without a cue are not in the video.
 *
 * Usage: node export.cjs DECK.html [OUT.mp4] [--fps 25] [--from SECONDS] [--to SECONDS]
 *                                  [--captions] [--width 1920] [--crf 20]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const opt = { fps: 25, from: 0, to: null, width: 1920, crf: 20, captions: false };
const files = [];
for (let j = 0; j < argv.length; j++) {
  const a = argv[j];
  if (a === '--captions') opt.captions = true;
  else if (/^--(fps|from|to|width|crf)$/.test(a)) opt[a.slice(2)] = parseFloat(argv[++j]);
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(64); }
  else files.push(a);
}
if (!files[0]) { console.error('usage: export.cjs DECK.html [OUT.mp4] [--fps 25] [--from S] [--to S] [--captions] [--width 1920] [--crf 20]'); process.exit(64); }
const deckPath = path.resolve(files[0]);
const outPath = path.resolve(files[1] || path.join(path.dirname(deckPath), path.basename(deckPath, '.html') + '.mp4'));
const work = path.join(path.dirname(deckPath), '.work');

async function launch() {
  const tries = [{ channel: 'chrome' }, {}];
  const cache = process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/ms-playwright') : path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const rel of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(cache, d, rel); if (fs.existsSync(p)) tries.push({ executablePath: p });
      }
    }
  }
  let last;
  for (const t of tries) { try { return await chromium.launch({ headless: true, ...t }); } catch (e) { last = e; } }
  throw new Error('No Chrome/Chromium found. Install Google Chrome, or run: npx playwright install chromium\n' + last);
}

// The sound track: the original recording when deck.json next to the deck still points at it (the
// embedded copy is compressed for size), else what the deck carries: embedded base64 or audio.mp3.
function soundTrack(html, data) {
  if (!data.audio) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(deckPath), 'deck.json'), 'utf8'));
    const orig = cfg.audio && path.resolve(path.dirname(deckPath), cfg.audio);
    if (orig && fs.existsSync(orig)) return orig;
  } catch {}
  if (data.audio.embedded) {
    const m = html.match(/<script type="application\/octet-stream" id="deck-audio">([^<]*)<\/script>/);
    if (!m || !m[1].trim()) return null;
    fs.mkdirSync(work, { recursive: true });
    const f = path.join(work, 'export-audio.mp3');
    fs.writeFileSync(f, Buffer.from(m[1].trim(), 'base64'));
    return f;
  }
  const f = path.resolve(path.dirname(deckPath), data.audio.src || '');
  return fs.existsSync(f) ? f : null;
}

(async () => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.error('export needs ffmpeg (brew install ffmpeg).'); process.exit(2); }
  const html = fs.readFileSync(deckPath, 'utf8');
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(deckPath).href);
  await page.waitForFunction(() => window.deck && window.deck.state.ready, null, { timeout: 20000 });
  if (!(await page.evaluate(() => !!deck.capture))) { console.error('this deck was built with an older engine; rebuild it with scripts/build.py first.'); process.exit(2); }
  const data = await page.evaluate(() => ({ audio: deck.data.audio, duration: deck.data.duration }));
  const audio = soundTrack(html, data);
  let duration = data.duration || 0;
  if (!duration && audio) duration = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]).toString()) || 0;
  const info = await page.evaluate(o => deck.capture.start(o), { at: opt.from, captions: opt.captions });
  if (!info.cues) { console.error('no slide has a data-cue: there is nothing to follow, so no video.'); process.exit(2); }
  if (!duration) duration = (await page.evaluate(() => Math.max(...deck.cues.map(c => c.t)))) + 8;
  const from = Math.max(0, opt.from || 0), to = Math.min(opt.to ?? duration, duration);
  if (!(to > from)) { console.error(`nothing to export between ${from} s and ${to} s`); process.exit(64); }
  const total = Math.ceil((to - from) * opt.fps);

  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opt.fps), '-i', '-'];
  if (audio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-map', '0:v');
  if (audio) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '160k');
  const height = Math.round(opt.width * 9 / 16 / 2) * 2;
  // screenshots are full-range JPEG; video players expect limited-range BT.709
  args.push('-vf', `scale=${opt.width}:${height}:flags=lanczos+accurate_rnd+full_chroma_int:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`,
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(opt.crf),
    '-g', String(Math.round(opt.fps * 2)), '-r', String(opt.fps), '-t', String(to - from), '-movflags', '+faststart', outPath); // a keyframe every 2 s: seeking
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', code => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`)))); ff.on('error', rej); });
  ff.stdin.on('error', () => {}); // a failing ffmpeg is reported by its exit code

  const cdp = await ctx.newCDPSession(page);
  const t0 = Date.now();
  let frame = null, wasBusy = true, shots = 0, next = 0.1;
  for (let n = 0; n < total; n++) {
    const r = await page.evaluate(t => deck.capture.seek(t), from + n / opt.fps);
    if (!frame || r.changed || r.busy || wasBusy) { // one more shot after motion ends, then the still frame is reused
      const { data: b64 } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
      frame = Buffer.from(b64, 'base64'); shots++;
    }
    wasBusy = r.busy > 0 || r.changed;
    if (!ff.stdin.write(frame)) await new Promise(res => ff.stdin.once('drain', res));
    if ((n + 1) / total >= next) { process.stderr.write(`  ${Math.round(next * 100)} %  (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`); next += 0.1; }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log(JSON.stringify({ out: outPath, seconds: +(to - from).toFixed(2), fps: opt.fps, frames: total, rendered: shots, audio: !!audio, captions: opt.captions,
    size_mb: +(fs.statSync(outPath).size / 1048576).toFixed(1), took_s: Math.round((Date.now() - t0) / 1000), errors }));
})().catch(e => { console.error(e); process.exit(1); });
