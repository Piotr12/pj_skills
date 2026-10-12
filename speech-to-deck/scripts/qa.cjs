#!/usr/bin/env node
/* Automated QA for a speech-to-deck HTML deck. Run through scripts/qa.sh (it provides
 * playwright-core). Produces, in OUT_DIR (default: <deck dir>/qa):
 *   shots/sNN-kK.jpg   every slide at every build step (1920x1080)
 *   motion/sNN.jpg     filmstrip per slide: rows = entry + each step, columns = time samples
 *   contact.jpg        all slides, fully built, on one sheet
 *   deck.pdf           print export (one page per slide)
 *   report.json        machine-readable findings;  report.md  human summary
 * Usage: node qa.cjs DECK.html [OUT_DIR] [--no-motion] [--no-pdf]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const [deckArg, outArg] = argv.filter(a => !a.startsWith('--'));
if (!deckArg) { console.error('usage: qa.cjs DECK.html [OUT_DIR] [--no-motion] [--no-pdf]'); process.exit(64); }
const deckPath = path.resolve(deckArg);
const outDir = path.resolve(outArg || path.join(path.dirname(deckPath), 'qa'));
for (const d of ['shots', 'motion']) fs.rmSync(path.join(outDir, d), { recursive: true, force: true }); // no stale frames from earlier runs
for (const d of ['', 'shots', 'motion']) fs.mkdirSync(path.join(outDir, d), { recursive: true });
const url = pathToFileURL(deckPath).href;

const BUDGET = { // per-style expectations used for flags
  consulting: { words: 110, stepMs: 650, chartMs: 1150, entryMs: 550, minFont: 16, noOverlap: true }, // chartMs includes --entry-delay
  whiteboard: { words: 45, stepMs: 2200, chartMs: 2400, entryMs: 2600, minFont: 20 },
  minimal: { words: 20, stepMs: 1500, chartMs: 1700, entryMs: 1800, minFont: 20 },
};

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const setSheet = async (pg, htmlStr) => {
  const f = path.join(outDir, '.sheet.html');
  fs.writeFileSync(f, `<!doctype html><meta charset="utf-8">${htmlStr}`);
  await pg.goto(pathToFileURL(f).href);
  // every image decoded before the screenshot (a large sheet can otherwise capture half-laid-out strips)
  await pg.evaluate(() => Promise.all([...document.images].map(i => (i.complete ? i.decode().catch(() => {}) : new Promise(r => { i.onload = i.onerror = r; })))));
  await sleep(100);
};
const pad = n => String(n).padStart(2, '0');

/* In-page layout audit of the current (fully built) slide. */
function auditSlide({ i, minFont, style }) {
  const slide = window.deck.slides[i];
  const sr = slide.getBoundingClientRect(), s = sr.width / 1920;
  const issues = [];
  const parseColor = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hexOrRgb = str => {
    const out = [];
    for (const m of str.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi)) {
      let t = m[0];
      if (t[0] === '#') { let h = t.slice(1); if (h.length <= 4) h = [...h].map(x => x + x).join(''); out.push({ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }); }
      else { const c = parseColor(t); if (c) out.push(c); }
    }
    return out.filter(c => c.a >= 0.5);
  };
  const backgroundsOf = el => {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const bgs = [];
      if (cs.backgroundImage && cs.backgroundImage !== 'none') bgs.push(...hexOrRgb(cs.backgroundImage));
      const bc = parseColor(cs.backgroundColor);
      if (bc && bc.a >= 0.5) bgs.push(bc);
      if (n.tagName === 'IMG' || cs.backgroundImage.includes('url(')) return null; // photo: unknown
      if (bgs.length) return bgs;
    } // keep walking past the slide: a theme may paint the stage on .deck or body
    return [{ r: 255, g: 255, b: 255, a: 1 }];
  };
  const visible = el => { for (let n = el; n && n !== slide.parentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false; } return true; };
  const desc = el => { const t = (el.textContent || '').trim().replace(/\s+/g, ' '); return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${t.slice(0, 50)}${t.length > 50 ? '…' : ''}"`; };
  const textEls = [...slide.querySelectorAll('*')].filter(el =>
    !el.closest('.notes,.sketch-layer,script,style') && !(el instanceof SVGElement && !(el instanceof SVGTextElement)) &&
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && visible(el));
  const boxes = [];
  for (const el of textEls) {
    const range = document.createRange(); range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const box = { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s };
    boxes.push({ el, box });
    const cs = getComputedStyle(el);
    if (box.x < -1 || box.y < -1 || box.x + box.w > 1921 || box.y + box.h > 1081) issues.push({ sev: 'blocker', kind: 'off-canvas', msg: `text runs off the slide: ${desc(el)}`, box });
    else if (box.x < 40 || box.y < 30 || box.x + box.w > 1880 || box.y + box.h > 1050) issues.push({ sev: 'minor', kind: 'edge', msg: `text within 40px of the slide edge: ${desc(el)}` });
    if ((cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) issues.push({ sev: 'blocker', kind: 'clipped', msg: `text is clipped by its box: ${desc(el)}` });
    const fsz = parseFloat(cs.fontSize);
    if (fsz < minFont) issues.push({ sev: 'major', kind: 'small-text', msg: `${fsz}px text (min ${minFont}px on a 1920 canvas): ${desc(el)}` });
    const fg = parseColor(cs.color);
    const clipText = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text' || (fg && fg.a < 0.05);
    if (fg && !clipText && !(el instanceof SVGElement)) {
      const bgs = backgroundsOf(el);
      if (bgs) {
        const worst = Math.min(...bgs.map(b => ratio(fg, b)));
        const large = fsz >= 36 || (fsz >= 28 && parseInt(cs.fontWeight, 10) >= 600);
        const need = large ? 3 : 4.5;
        if (worst < need) issues.push({ sev: worst < need - 1 ? 'major' : 'minor', kind: 'contrast', msg: `contrast ${worst.toFixed(2)}:1 (needs ${need}:1): ${desc(el)}` });
      }
    }
  }
  // Overlapping text: compare each line's ink band (centre ± 0.4 em), not the font's full box,
  // so tall display numerals sitting close to their labels are not false positives.
  for (const bx of boxes) {
    const fsz = parseFloat(getComputedStyle(bx.el).fontSize) / 1;
    const range = document.createRange(); range.selectNodeContents(bx.el);
    bx.lines = [...range.getClientRects()].filter(r => r.width > 1).map(r => { const cy = (r.top + r.bottom) / 2; return { x: (r.left - sr.left) / s, w: r.width / s, y: (cy - sr.top) / s - fsz * 0.4, h: fsz * 0.8 }; });
  }
  const hit = (P, Q) => Math.max(0, Math.min(P.x + P.w, Q.x + Q.w) - Math.max(P.x, Q.x)) * Math.max(0, Math.min(P.y + P.h, Q.y + Q.h) - Math.max(P.y, Q.y));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    let area = 0; for (const P of A.lines) for (const Q of B.lines) area += hit(P, Q);
    if (area > 60) issues.push({ sev: 'blocker', kind: 'overlap', msg: `text overlaps: ${desc(A.el)} ⨯ ${desc(B.el)}` });
  }
  // Titles that wrap too far stop working as headlines.
  slide.querySelectorAll('.title, .statement').forEach(t => {
    if (!visible(t)) return;
    const lh = parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.15;
    const lines = Math.round(t.getBoundingClientRect().height / s / lh);
    if (lines > 2 && t.classList.contains('title')) issues.push({ sev: lines > 3 ? 'major' : 'minor', kind: 'title-length', msg: `title wraps to ${lines} lines (keep to 2): ${desc(t)}` });
    if (lines > 3 && t.classList.contains('statement')) issues.push({ sev: 'major', kind: 'title-length', msg: `statement wraps to ${lines} lines: ${desc(t)}` });
  });
  // Title length (consulting action titles: about 15 words / 110 characters).
  if (style === 'consulting') slide.querySelectorAll('.slide-head .title').forEach(t => {
    const n = t.textContent.trim().replace(/\s+/g, ' ').length;
    if (n > 110) issues.push({ sev: n > 130 ? 'major' : 'minor', kind: 'title-length', msg: `action title is ${n} characters (keep to about 110): ${desc(t)}` });
  });
  // Typographic quotes facing the wrong way.
  {
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.notes,script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    // Text nodes joined with a separator so adjacent elements ("So what" + "“This…") are not read as one word.
    let txt = ''; while (walker.nextNode()) txt += '\u0000' + walker.currentNode.textContent;
    const bad = txt.match(/(?:\u0000|\s)\u201d[\p{L}\d\u2026]|[\p{L}\d]\u201c(?=\p{L})/gu);
    if (bad) issues.push({ sev: 'major', kind: 'typography', msg: `${bad.length} quotation mark(s) facing the wrong way: ${bad.slice(0, 3).map(b => JSON.stringify(b.replace(/\u0000/g, '').trim())).join(', ')}` });
  }
  // How much of the body the content fills (consulting pages should not leave a void).
  const bodyEl = slide.querySelector('.slide-body');
  if (style === 'consulting' && bodyEl && slide.dataset.layout !== 'quote' && slide.dataset.layout !== 'closing') {
    const br = bodyEl.getBoundingClientRect(); let lo = Infinity, hi = -Infinity;
    bodyEl.querySelectorAll('*').forEach(el => { if (!visible(el)) return; const r = el.getBoundingClientRect(); if (r.height < 2 || r.width < 2) return; const st = getComputedStyle(el); if (!el.children.length || st.backgroundColor !== 'rgba(0, 0, 0, 0)' || el.tagName === 'svg') { lo = Math.min(lo, r.top); hi = Math.max(hi, r.bottom); } });
    if (hi > lo && br.height > 0) {
      const top = (lo - br.top) / br.height, bottom = (br.bottom - hi) / br.height; // empty bands, as share of the body
      if (Math.max(top, bottom) > (bodyEl.classList.contains('middle') ? 0.38 : 0.3)) issues.push({ sev: 'minor', kind: 'layout', msg: `${Math.round(Math.max(top, bottom) * 100)}% of the body is empty ${bottom > top ? 'below' : 'above'} the content; distribute it (.slide-body.flow / .middle) or add what the title promises` });
    }
  }
  if (style === 'consulting') {
    const top = Math.max(0, ...[...slide.querySelectorAll('[data-step]')].map(e => parseFloat(e.dataset.step) || 0));
    slide.querySelectorAll('.callout[data-step]').forEach(c => { if (parseFloat(c.dataset.step) < top) issues.push({ sev: 'minor', kind: 'build', msg: `callout appears at step ${c.dataset.step} but the slide builds to step ${top}; the so-what arrives last (asides go in the notes)` }); });
  }
  // Leftover workarounds the engine no longer needs (they now misplace marks or do nothing).
  slide.querySelectorAll('[data-sketch-pad]').forEach(el => { if (parseFloat(el.dataset.sketchPad) < 0) issues.push({ sev: 'minor', kind: 'workaround', msg: `negative data-sketch-pad (${el.dataset.sketchPad}): marks are placed from font metrics now; remove it: ${desc(el)}` }); });
  slide.querySelectorAll('[data-sketch-fit="box"]').forEach(el => { if (getComputedStyle(el).display.startsWith('inline') && el.textContent.trim()) issues.push({ sev: 'minor', kind: 'workaround', msg: `data-sketch-fit="box" on inline text: the mark follows the box, not the ink: ${desc(el)}` }); });
  if (slide.querySelector('svg.sketch [style*="--d"], .grow-up, .grow-right, .grow-out, .hl-box')) issues.push({ sev: 'minor', kind: 'workaround', msg: 'inline --d timings, grow-* classes or .hl-box insets are ignored by the engine (drawings chain in document order; highlights fit the words)' });
  // Empty boxes left in the markup read as missing content.
  slide.querySelectorAll('.slide-body p, .slide-body li, .slide-body h3, .slide-body dd, .slide-body dt').forEach(el => { if (!el.textContent.trim() && !el.querySelector('img,svg') && visible(el)) issues.push({ sev: 'minor', kind: 'content', msg: `empty ${el.tagName.toLowerCase()} in the body (remove it rather than prop it open)` }); });
  if (style === 'consulting') {
    const words = s => new Set((s.toLowerCase().match(/[\p{L}\d]{4,}/gu) || []));
    const tw = words(slide.querySelector('.slide-head .title')?.textContent || '');
    slide.querySelectorAll('.callout').forEach(c => { const cw = [...words(c.textContent)]; const shared = cw.filter(w => tw.has(w)).length; if (cw.length >= 4 && shared / cw.length > 0.45) issues.push({ sev: 'minor', kind: 'content', msg: `callout repeats the title (${shared} of ${cw.length} words shared); cut it or make it add something` }); });
    slide.querySelectorAll('.lead:not(.is-quote)').forEach(l => { if (/^[\u201c\u201e"\u00ab]/.test(l.textContent.trim()) && /[\u201d"\u00bb]\s*$/.test(l.textContent.trim())) issues.push({ sev: 'minor', kind: 'typography', msg: `a fully quoted .lead should be .lead.is-quote (quotes use the quote face): ${desc(l)}` }); });
  }
  // Count-ups: tiny numbers read as wrong data while counting.
  slide.querySelectorAll('[data-count]').forEach(el => { const v = parseFloat((el.dataset.final || el.textContent).replace(/[^\d.]/g, '')); if (v < 10) issues.push({ sev: 'minor', kind: 'motion', msg: `data-count on a small number (${el.dataset.final || el.textContent.trim()}) shows misleading intermediate values` }); });
  slide.querySelectorAll('img').forEach(img => { if (!img.complete || !img.naturalWidth) issues.push({ sev: 'blocker', kind: 'image', msg: `image failed to load: ${img.getAttribute('src')?.slice(0, 60)}` }); });
  const clone = slide.cloneNode(true); clone.querySelectorAll('.notes,.tracker,.slide-num,.slide-foot,script,style,.sketch-layer,[data-step-out]').forEach(n => n.remove()); // replaced text is never on screen with its replacement
  const words = (clone.textContent || '').trim().split(/\s+/).filter(w => /\w/.test(w)).length;
  const title = slide.dataset.title || slide.querySelector('h1,h2')?.textContent?.trim() || '';
  return { i, title, layout: slide.dataset.layout || '', words, steps: slide._steps.length, cue: slide.dataset.cue ?? null, issues };
}

(async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.deck && window.deck.state.ready, null, { timeout: 20000 });
  await page.addStyleTag({ content: '.deck-controls,.deck-player,.deck-caption,.deck-toast{display:none!important}' });
  const meta = await page.evaluate(() => ({ n: deck.slides.length, style: deck.data.style || document.documentElement.dataset.theme, steps: deck.slides.map((_, i) => deck.steps(i)), hasAudio: !!deck.audio, duration: deck.data.duration }));
  const budget = BUDGET[meta.style] || BUDGET.consulting;
  const entryState = [];
  const report = { deck: deckPath, style: meta.style, slides: [], motion: [], interaction: [], console: consoleErrors, files: {} };

  const cueDump = await page.evaluate(() => ({
    cues: deck.cues.map(c => ({ t: c.t, i: c.i, k: c.k })),
    slideCues: deck.slides.map(s => (s.dataset.cue && s.dataset.cue !== 'none' ? parseFloat(s.dataset.cue) : null)),
    counts: document.querySelectorAll('[data-count]').length,
  }));

  /* ---------- static pass ---------- */
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (let i = 0; i < meta.n; i++) {
    for (let k = 0; k <= meta.steps[i]; k++) {
      await page.evaluate(([i, k]) => deck.go(i, k, { instant: true, noTransition: true, force: true }), [i, k]);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(60);
      await page.screenshot({ path: path.join(outDir, 'shots', `s${pad(i + 1)}-k${k}.jpg`), type: 'jpeg', quality: 82 });
      if (k === 0) entryState[i] = await page.evaluate(i => {
        const slide = deck.slides[i];
        const vis = el => { for (let n = el; n && n !== slide.parentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false; } return true; };
        const all = [...slide.querySelectorAll('*')].filter(el => !el.closest('.notes,.tracker,.slide-num,.slide-foot,script,style,.sketch-layer') && vis(el));
        const body = all.filter(el => !el.closest('.slide-head'));
        const label = el => el.matches('.h,.k,.exhibit,.callout-title,figcaption,cite') || parseFloat(getComputedStyle(el).fontSize) < 22;
        const hasText = els => els.some(el => !label(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
        const hasVisual = els => els.some(el => el.matches('svg,img,figure,.chart,.sticky') && el.getBoundingClientRect().width > 20);
        return { title: hasText(all.filter(el => el.closest('.slide-head'))), body: hasText(body) || hasVisual(body) };
      }, i);
    }
    report.slides.push(await page.evaluate(auditSlide, { i, minFont: budget.minFont, style: meta.style }));
  }

  /* ---------- motion pass ---------- */
  if (!flags.has('--no-motion')) {
    const fracs = [0.1, 0.3, 0.55, 1];
    for (let i = 0; i < meta.n; i++) {
      const rows = [];
      const transitions = [{ label: i === 0 ? 'entry' : 'entry (from previous)', run: i === 0 ? null : 'next' }];
      for (let k = 1; k <= meta.steps[i]; k++) transitions.push({ label: `step ${k}`, run: 'next' });
      if (i > 0) await page.evaluate(i => deck.go(i - 1, Infinity, { instant: true, noTransition: true, force: true }), i);
      else await page.evaluate(() => deck.go(0, 0, { instant: true, noTransition: true, force: true }));
      await sleep(80);
      for (const tr of transitions) {
        if (!tr.run) { rows.push({ label: tr.label, totalMs: 0, anims: [], frames: [] }); continue; }
        // t0 = the click. Entry animations may start later (--entry-delay), so wait for them and
        // place every animation on the same clock via its startTime.
        const entryDelay = await page.evaluate(() => { window.__qaT0 = document.timeline.currentTime; deck.next(); const s = deck.slides[deck.state.i]; return deck.state.k === 0 ? (parseFloat(getComputedStyle(s).getPropertyValue('--entry-delay')) || 0) : 0; });
        await sleep(60 + entryDelay + (entryDelay ? 60 : 0));
        const info = await page.evaluate(() => {
          const anims = document.getAnimations();
          window.__qaAnims = anims;
          window.__qaStarts = anims.map(a => a.startTime); // read before any pause (paused animations lose startTime)
          const list = anims.map(a => {
            const t = a.effect.getComputedTiming(); const tgt = a.effect.target;
            const pe = a.effect.pseudoElement || '';
            const name = a.animationName || a.transitionProperty || (a.effect.getKeyframes?.()[0] ? Object.keys(a.effect.getKeyframes()[0]).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join('+') : 'waapi');
            const who = tgt ? (tgt.className?.baseVal ?? tgt.className ?? tgt.tagName) : '';
            const isCount = tgt && tgt.hasAttribute && tgt.hasAttribute('data-count');
            let easing = t.easing; // CSS animations keep their easing on the keyframes
            if (a.constructor.name === 'CSSAnimation' && easing === 'linear') { try { easing = a.effect.getKeyframes()[0].easing || easing; } catch {} }
            const start = Math.max(0, Math.round((window.__qaStarts[anims.indexOf(a)] ?? window.__qaT0) - window.__qaT0)); // when it began, relative to the click
            return { type: a.constructor.name, name, target: `${tgt?.tagName?.toLowerCase() || ''}${pe}.${String(who).trim().split(/\s+/).slice(0, 3).join('.')}${isCount ? '[data-count]' : ''}`, start, delay: Math.round(t.delay || 0) + start, duration: Math.round(t.duration || 0), easing };
          });
          const totalMs = list.reduce((m, a) => Math.max(m, a.delay + a.duration), 0);
          return { totalMs, anims: list };
        });
        const frames = [];
        if (info.totalMs > 0) {
          for (const f of fracs) {
            const t = Math.round(info.totalMs * f);
            await page.evaluate(t => { (window.__qaAnims || []).forEach((a, ix) => { try { const st = Math.max(0, ((window.__qaStarts || [])[ix] ?? window.__qaT0) - window.__qaT0); a.pause(); a.currentTime = Math.max(0, Math.min(t - st, (a.effect.getComputedTiming().endTime || t))); } catch {} }); }, t);
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            const file = path.join(outDir, 'motion', `s${pad(i + 1)}-${tr.label.replace(/\W+/g, '_')}-${String(t).padStart(4, '0')}ms.jpg`);
            await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
            frames.push({ t, file });
          }
          await page.evaluate(() => { for (const a of document.getAnimations()) { try { a.finish(); } catch {} } });
        }
        await sleep(60);
        rows.push({ label: tr.label, totalMs: info.totalMs, count: info.anims.length, anims: info.anims.slice(0, 14), frames });
      }
      const flagsOut = [];
      rows.forEach(r => {
        const chart = (r.anims || []).some(a => /c-bar|c-arc|c-line|c-seg|rough-shape|data-count/.test(a.target));
        const lim = chart ? budget.chartMs : (r.label.startsWith('entry') ? budget.entryMs : budget.stepMs);
        if (budget.noOverlap && r.label.startsWith('entry')) {
          const o = (r.anims || []).find(a => /view-transition-old\(slide\)/.test(a.target)), n = (r.anims || []).find(a => /view-transition-new\(slide\)/.test(a.target));
          if (o && n && n.delay < o.delay + o.duration - 10) flagsOut.push({ sev: 'minor', msg: `${r.label}: incoming slide starts ${o.delay + o.duration - n.delay} ms before the outgoing one has gone (double exposure)` });
        }
        if (r.totalMs > lim * 1.5) flagsOut.push({ sev: 'major', msg: `${r.label}: ${r.totalMs}ms of animation (budget ${lim}ms)` });
        else if (r.totalMs > lim) flagsOut.push({ sev: 'minor', msg: `${r.label}: ${r.totalMs}ms of animation (budget ${lim}ms)` });
        if (r.label.startsWith('step') && r.count === 0) flagsOut.push({ sev: 'major', msg: `${r.label}: nothing animates on this build step` });
        const lin = (r.anims || []).filter(a => (a.type === 'CSSTransition' || a.type === 'Animation') && a.easing === 'linear' && a.duration > 400 && !/stroke|opacity|s2d-count/i.test(a.name));
        if (lin.length) flagsOut.push({ sev: 'minor', msg: `${r.label}: ${lin.length} long linear animation(s) feel mechanical` });
      });
      report.motion.push({ i, rows: rows.map(r => ({ label: r.label, totalMs: r.totalMs, count: r.count || 0, anims: r.anims })), flags: flagsOut });
      // filmstrip sheet
      const strip = rows.filter(r => r.frames && r.frames.length);
      if (strip.length) {
        const sheet = await ctx.newPage();
        const cells = strip.map(r => `<div class="lbl">${r.label}<br><small>${r.totalMs}ms</small></div>` + r.frames.map(f => `<figure><img src="${pathToFileURL(f.file).href}"><figcaption>${f.t}ms</figcaption></figure>`).join('')).join('');
        await sheet.setViewportSize({ width: 140 + 4 * 492, height: 200 });
        await setSheet(sheet, `<style>body{margin:0;background:#202124;color:#ddd;font:14px system-ui}.g{display:grid;grid-template-columns:140px repeat(4,480px);gap:12px;padding:12px}.lbl{align-self:center}figure{margin:0}img{width:480px;height:270px;display:block}figcaption{font-size:12px;opacity:.7}</style><div class="g">${cells}</div>`);
        await sheet.waitForLoadState('load');
        await sheet.screenshot({ path: path.join(outDir, 'motion', `s${pad(i + 1)}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
        await sheet.close();
        for (const r of strip) for (const f of r.frames) fs.rmSync(f.file, { force: true });
      }
    }
  }

  /* ---------- interaction ---------- */
  const check = (name, ok, detail = '') => report.interaction.push({ name, ok: !!ok, detail });
  await page.goto(url + '#/1'); await page.waitForFunction(() => deck.state.ready);
  const totalSteps = meta.steps.reduce((a, b) => a + b, 0) + meta.n - 1;
  for (let j = 0; j < totalSteps; j++) { await page.keyboard.press('ArrowRight'); await sleep(25); }
  let st = await page.evaluate(() => deck.state);
  check('ArrowRight walks every step to the end', st.i === meta.n - 1 && st.k === meta.steps[meta.n - 1], JSON.stringify(st));
  await page.keyboard.press('Home'); await sleep(50); st = await page.evaluate(() => deck.state);
  check('Home returns to the first slide', st.i === 0 && st.k === 0);
  await page.keyboard.press('End'); await sleep(50); st = await page.evaluate(() => deck.state);
  check('End jumps to the last slide', st.i === meta.n - 1);
  for (let j = 0; j < totalSteps; j++) { await page.keyboard.press('ArrowLeft'); await sleep(20); }
  st = await page.evaluate(() => deck.state);
  check('ArrowLeft walks back to the start', st.i === 0 && st.k === 0, JSON.stringify(st));
  const target = Math.min(3, meta.n);
  await page.goto(url + `#/${target}`); await page.reload(); await page.waitForFunction(() => deck.state.ready);
  st = await page.evaluate(() => deck.state);
  check(`URL #/${target} opens slide ${target}`, st.i === target - 1);
  await page.keyboard.press('o'); await sleep(150);
  check('O opens the overview', await page.evaluate(() => document.body.classList.contains('is-overview')));
  await page.keyboard.press('Escape'); await sleep(150);
  { // a quick double press right after a slide change must not leave a drawing hidden
    const target = await page.evaluate(() => deck.slides.findIndex(s => s.querySelector('svg.sketch .rough-shape:not(.rough-draw)')));
    if (target > 0) {
      await page.evaluate(i => deck.go(i - 1, Infinity, { instant: true, noTransition: true, force: true }), target); await sleep(100);
      await page.keyboard.press('ArrowRight'); await sleep(80); await page.keyboard.press('ArrowRight'); await sleep(1500);
      const pending = await page.evaluate(() => document.querySelectorAll('.slide.is-active .rough-shape.is-pending').length);
      check('a quick double press after a slide change leaves no drawing hidden', pending === 0, `${pending} shapes still hidden on slide ${target + 1}`);
    }
    await page.keyboard.press('o'); await sleep(150);
  }
  {
    const ov = await page.evaluate(() => { const r = deck.slides.map(s => s.getBoundingClientRect()); let overlap = 0; for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) { const x = Math.min(r[a].right, r[b].right) - Math.max(r[a].left, r[b].left), y = Math.min(r[a].bottom, r[b].bottom) - Math.max(r[a].top, r[b].top); if (x > 2 && y > 2) overlap++; } const clipped = r.filter(x => x.right > innerWidth + 1).length; return { overlap, clipped }; });
    check('overview thumbnails neither overlap nor overflow the window', ov.overlap === 0 && ov.clipped === 0, JSON.stringify(ov));
  }
  await page.screenshot({ path: path.join(outDir, 'overview.jpg'), type: 'jpeg', quality: 75 });
  await page.keyboard.press('Escape'); await sleep(150);
  check('Esc closes the overview', await page.evaluate(() => !document.body.classList.contains('is-overview')));
  {
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 4000 }).catch(() => null), page.keyboard.press('s')]);
    let ok = false, detail = 'no window';
    if (popup) {
      await sleep(400);
      const sv = await popup.evaluate(() => ({ notes: !!document.getElementById('notes'), cur: !!document.querySelector('#cur .slide'), text: (document.getElementById('pos') || {}).textContent || '' })).catch(e => ({ err: e.message }));
      ok = sv.notes && sv.cur; detail = JSON.stringify(sv);
      await popup.close();
    }
    check('S opens the speaker view (current slide, next, notes)', ok, detail);
  }
  for (const [w, h] of [[1280, 720], [1440, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(120);
    const r = await page.evaluate(() => { const b = document.querySelector('.deck').getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight }; });
    check(`fits a ${w}x${h} window`, r.l >= -1 && r.t >= -1 && r.r <= r.w + 1 && r.b <= r.h + 1 && (Math.abs(r.r - r.l - r.w) < 2 || Math.abs(r.b - r.t - r.h) < 2), JSON.stringify(r));
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  // reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url + '#/1'); await page.reload(); await page.waitForFunction(() => deck.state.ready);
  let worst = 0;
  for (let j = 0; j < Math.min(totalSteps, 12); j++) {
    await page.keyboard.press('ArrowRight'); await sleep(40);
    worst = Math.max(worst, await page.evaluate(() => document.getAnimations().reduce((m, a) => { const t = a.effect.getComputedTiming(); return Math.max(m, (t.duration || 0) + (t.delay || 0)); }, 0)));
  }
  check('reduced motion keeps animations at or under 250ms', worst <= 250, `longest ${Math.round(worst)}ms`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // audio / listen-along
  if (meta.hasAudio) {
    await page.goto(url + '#/1'); await page.reload(); await page.waitForFunction(() => deck.state.ready);
    const ad = await page.evaluate(() => new Promise(res => { const a = deck.audio; deck.audioReady.then(() => {}); if (a.readyState >= 1) res(a.duration); a.addEventListener('loadedmetadata', () => res(a.duration)); setTimeout(() => res(a.duration || 0), 8000); }));
    check('audio loads and matches the transcript length', ad > 0 && (!meta.duration || Math.abs(ad - meta.duration) < 3), `audio ${ad?.toFixed?.(1)}s vs transcript ${meta.duration}s`);
    const cues = await page.evaluate(() => deck.cues.map(c => ({ t: c.t, i: c.i, k: c.k })));
    check('slides carry cues for listen-along', cues.length >= Math.min(3, meta.n - 1), `${cues.length} cues`);
    const sample = cues.length ? [cues[0], cues[Math.floor(cues.length / 2)], cues[cues.length - 1]] : [];
    for (const c of sample) {
      const got = await page.evaluate(c => new Promise(res => { const a = deck.audio; const done = () => setTimeout(() => res(deck.state), 250); a.addEventListener('seeked', done, { once: true }); setTimeout(() => res({ ...deck.state, timeout: true }), 5000); a.currentTime = c.t + 0.3; }), c);
      check(`seeking the audio to ${c.t.toFixed(1)}s shows slide ${c.i + 1} step ${c.k}`, got.i === c.i && got.k === c.k, JSON.stringify(got));
    }
    let backwards = 0; for (let j = 1; j < cues.length; j++) if (cues[j].i < cues[j - 1].i || (cues[j].i === cues[j - 1].i && cues[j].k < cues[j - 1].k)) backwards++;
    check('cues move forward through the deck', backwards === 0, `${backwards} backward jumps`);
  }

  /* ---------- PDF + contact sheet ---------- */
  if (!flags.has('--no-pdf')) {
    try {
      await page.goto(url); await page.waitForFunction(() => deck.state.ready);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await sleep(300);
      await page.pdf({ path: path.join(outDir, 'deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
      const pdf = fs.readFileSync(path.join(outDir, 'deck.pdf'), 'latin1');
      const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
      check('print/PDF export has one page per slide', pages === meta.n, `${pages} pages for ${meta.n} slides`);
      await page.emulateMedia({ media: 'screen' });
    } catch (e) { check('print/PDF export', false, e.message); }
  }
  {
    const sheet = await ctx.newPage();
    const imgs = report.slides.map(s => `<figure><img src="${pathToFileURL(path.join(outDir, 'shots', `s${pad(s.i + 1)}-k${s.steps}.jpg`)).href}"><figcaption>${s.i + 1}. ${s.title.replace(/</g, '&lt;')}</figcaption></figure>`).join('');
    await sheet.setViewportSize({ width: 4 * 480 + 5 * 16, height: 200 });
    await setSheet(sheet, `<style>body{margin:0;background:#1b1c1f;color:#ccc;font:15px system-ui}.g{display:grid;grid-template-columns:repeat(4,480px);gap:16px;padding:16px}figure{margin:0}img{width:480px;height:270px;display:block}figcaption{margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><div class="g">${imgs}</div>`);
    await sheet.waitForLoadState('load');
    await sheet.screenshot({ path: path.join(outDir, 'contact.jpg'), type: 'jpeg', quality: 80, fullPage: true });
    await sheet.close();
  }
  await browser.close();
  fs.rmSync(path.join(outDir, '.sheet.html'), { force: true });

  /* ---------- listen-along pacing ---------- */
  const pacing = [];
  if (meta.hasAudio) {
    const cueList = cueDump.cues, slideCue = cueDump.slideCues;
    for (let j = 1; j < cueList.length; j++) {
      const gap = cueList[j].t - cueList[j - 1].t;
      if (gap > 90 && !(cueList[j - 1].i === 0 && cueList[j - 1].k === 0)) pacing.push({ sev: 'minor', where: `slide ${cueList[j - 1].i + 1}`, msg: `nothing changes for ${Math.round(gap)} s in listen-along (${cueList[j - 1].t.toFixed(0)}–${cueList[j].t.toFixed(0)} s); reveal the next point when it is spoken` });
    }
    cueList.filter(c => c.k > 0 && slideCue[c.i] != null && Math.abs(c.t - slideCue[c.i]) < 0.6).forEach(c => pacing.push({ sev: 'minor', where: `slide ${c.i + 1}`, msg: `step ${c.k} has the same cue as its slide; show that element on entry instead of building it` }));
    for (let i = 0; i < meta.n; i++) {
      const own = cueList.filter(c => c.i === i), next = cueList.find(c => c.i > i);
      if (!own.length) continue;
      const last = own[own.length - 1];
      if (next && last.k > 0 && next.t - last.t < 4) pacing.push({ sev: 'minor', where: `slide ${i + 1}`, msg: `step ${last.k} is visible for only ${(next.t - last.t).toFixed(1)} s before the next slide` });
      const maxCuedK = Math.max(...own.map(c => c.k));
      if (maxCuedK < meta.steps[i]) pacing.push({ sev: 'minor', where: `slide ${i + 1}`, msg: `steps ${maxCuedK + 1}–${meta.steps[i]} have no cue, so listen-along never reveals them` });
      const e = entryState[i];
      const firstStep = own.find(c => c.k > 0);
      if (e && !e.body && meta.steps[i] > 0) {
        const wait = firstStep && slideCue[i] != null ? firstStep.t - slideCue[i] : 0;
        if (wait > 8) pacing.push({ sev: 'major', where: `slide ${i + 1}`, msg: `the body is empty for ${Math.round(wait)} s after the slide appears in listen-along; show the set-up on entry` });
        else if (wait > 4) pacing.push({ sev: 'minor', where: `slide ${i + 1}`, msg: `the body is empty for ${Math.round(wait)} s after the slide appears; fine if showing the first element earlier would reveal it before it is said` });
      }
    }
  }
  report.slides.forEach((s, i) => {
    const e = entryState[i]; if (!e || e.title || e.body || s.layout === 'blank' || s.layout === 'credits') return; // end matter is meant to be quiet
    const first = cueDump.cues.find(c => c.i === i && c.k > 0), own = cueDump.slideCues[i];
    const wait = meta.hasAudio && first && own != null ? first.t - own : Infinity;
    s.issues.push({ sev: wait > 8 ? 'major' : 'minor', kind: 'empty', msg: `the slide shows nothing when it appears (step 0)${Number.isFinite(wait) ? `; first step after ${wait.toFixed(1)} s` : ''}` });
  });
  if (meta.style === 'consulting' && cueDump.counts > 1) pacing.push({ sev: 'minor', where: 'deck', msg: `${cueDump.counts} count-up numbers; consulting allows at most one hero count` });
  report.pacing = pacing;

  /* ---------- report ---------- */
  for (const s of report.slides) {
    if (s.layout === 'credits') continue; // fine print, not slide copy
    const wb = s.layout === 'summary' ? Math.round(budget.words * 1.4) : budget.words; // an executive summary may be denser
    if (s.words > wb) s.issues.push({ sev: s.words > wb * 1.4 ? 'major' : 'minor', kind: 'density', msg: `${s.words} words (style budget ${wb}; title and body, not the source line)` });
  }
  const all = [
    ...report.slides.flatMap(s => s.issues.map(x => ({ ...x, where: `slide ${s.i + 1}` }))),
    ...report.motion.flatMap(m => m.flags.map(x => ({ ...x, kind: 'motion', where: `slide ${m.i + 1}` }))),
    ...pacing.map(x => ({ ...x, kind: 'listen-along' })),
    ...report.interaction.filter(x => !x.ok).map(x => ({ sev: 'blocker', kind: 'interaction', msg: `${x.name} failed ${x.detail}`, where: 'deck' })),
    ...consoleErrors.map(e => ({ sev: e.startsWith('warning') ? 'minor' : 'blocker', kind: 'console', msg: e, where: 'deck' })),
  ];
  const count = sev => all.filter(x => x.sev === sev).length;
  report.summary = { blockers: count('blocker'), majors: count('major'), minors: count('minor'), slides: meta.n, style: meta.style };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  const md = [
    `# QA report: ${path.basename(deckPath)}`, '',
    `Style **${meta.style}**, ${meta.n} slides. Blockers ${report.summary.blockers}, major ${report.summary.majors}, minor ${report.summary.minors}.`, '',
    '## Findings', '', ...(all.length ? all.map(x => `- **${x.sev}** (${x.where}, ${x.kind}) ${x.msg}`) : ['- none']), '',
    '## Slides', '', '| # | title | layout | words | steps | cue |', '|---|---|---|---|---|---|',
    ...report.slides.map(s => `| ${s.i + 1} | ${s.title.replace(/\|/g, '/')} | ${s.layout} | ${s.words} | ${s.steps} | ${s.cue ?? ''} |`), '',
    '## Motion (ms of animation per transition)', '',
    ...report.motion.map(m => `- slide ${m.i + 1}: ` + m.rows.map(r => `${r.label} ${r.totalMs}`).join(', ')), '',
    '## Interaction', '', ...report.interaction.map(x => `- ${x.ok ? 'pass' : 'FAIL'}: ${x.name}${x.ok ? '' : ' — ' + x.detail}`), '',
    `Artifacts: shots/ (every step), motion/ (filmstrips), contact.jpg, overview.jpg${flags.has('--no-pdf') ? '' : ', deck.pdf'}.`,
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'report.md'), md + '\n');
  console.log(JSON.stringify({ out: outDir, ...report.summary }));
})().catch(e => { console.error(e); process.exit(1); });
