/* speech-to-deck engine. No dependencies; uses window.rough (rough.js) when a theme asks
 * for hand-drawn sketches. Public API for QA and the speaker view: window.deck. */
(() => {
  'use strict';
  const W = 1920, H = 1080;
  const doc = document, body = doc.body, root = doc.documentElement;
  const deckEl = doc.querySelector('.deck');
  const slides = [...deckEl.querySelectorAll(':scope > .slide')];
  const DATA = (() => { try { return JSON.parse(doc.getElementById('deck-data').textContent); } catch { return {}; } })();
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { i: 0, k: 0, overview: false, ready: false };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cssVar = (el, name, fallback = '') => (getComputedStyle(el).getPropertyValue(name).trim() || fallback);
  const reduced = () => reduceMQ.matches || root.classList.contains('force-reduce-motion');
  const svg = (tag, attrs = {}) => { const n = doc.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  /* ------------------------------------------------------------------ scale */
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    root.style.setProperty('--scale', String(s));
    const cols = innerWidth > 1500 ? 4 : innerWidth > 1000 ? 3 : 2, pad = 28, gap = 22;
    root.style.setProperty('--ov-cols', String(cols));
    root.style.setProperty('--ov-zoom', String((innerWidth - 2 * pad - (cols - 1) * gap - 16) / cols / W));
  }
  addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------------------ steps */
  // Steps are the distinct positive numbers used in data-step / data-sketch-step / data-step-out.
  function collectSteps(slide) {
    const set = new Set();
    slide.querySelectorAll('[data-step],[data-sketch-step],[data-step-out]').forEach(el => {
      for (const a of ['step', 'sketchStep', 'stepOut']) {
        const n = parseFloat(el.dataset[a]);
        if (n > 0) set.add(n);
      }
    });
    slide._steps = [...set].sort((a, b) => a - b);
    return slide._steps;
  }
  const stepValue = (slide, k) => (k > 0 ? slide._steps[k - 1] : 0);

  /* --------------------------------------------------------------- charts */
  const fmtNum = (v, o) => {
    const d = o.decimals ?? (Math.abs(v) < 10 && v % 1 ? 1 : 0);
    const s = Number(v).toLocaleString(DATA.lang || 'en', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (o.prefix || '') + s + (o.suffix || '');
  };
  function wrapLabel(text, max) {
    const words = String(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  function textEl(x, y, str, cls, anchor = 'middle', maxChars = 0, lh = 1.15) {
    const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
    const lines = maxChars ? wrapLabel(str, maxChars) : [String(str)];
    lines.forEach((ln, j) => { const ts = svg('tspan', { x, dy: j ? `${lh}em` : '0' }); ts.textContent = ln; t.appendChild(ts); });
    return t;
  }
  // Inverse of an ease-in-out cubic: at what share of the time has the sweep covered share p?
  function sweepTime(p) {
    const f = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let lo = 0, hi = 1; for (let j = 0; j < 30; j++) { const m = (lo + hi) / 2; if (f(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // The part of the global ease-in-out curve between times ta..tb, as a CSS linear() easing,
  // so the sweep keeps one continuous speed across segments.
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hasLinearFn = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
  function sliceEasing(ta, tb, pa, pb) {
    if (!hasLinearFn || pb - pa < 1e-6) return 'linear';
    const pts = [];
    for (let j = 0; j <= 12; j++) { const t = ta + (tb - ta) * j / 12; pts.push(((easeIO(t) - pa) / (pb - pa)).toFixed(4)); }
    return `linear(${pts.join(', ')})`;
  }
  function renderChart(fig) {
    if (fig._chart) return;
    const src = fig.querySelector('script[type="application/json"]');
    if (!src) return;
    let o; try { o = JSON.parse(src.textContent); } catch (e) { console.error('chart JSON', e); return; }
    const type = fig.dataset.chart || o.type || 'bar';
    const w = fig.clientWidth || 800, h = fig.clientHeight || 450;
    const s = svg('svg', { class: 'chart-svg', viewBox: `0 0 ${w} ${h}`, role: 'img' });
    if (o.title) s.setAttribute('aria-label', o.title);
    const hl = new Set([].concat(o.highlight ?? []));
    const fs = parseFloat(cssVar(fig, '--chart-font', '24'));
    const labelFs = fs, valueFs = fs * 1.08;
    if (type === 'bar') {
      const vals = o.values, labels = o.labels || [], n = vals.length;
      const max = o.max ?? Math.max(...vals) * 1.0;
      if (o.orientation === 'h') {
        const labW = o.labelWidth ?? Math.min(w * 0.36, 16 + labelFs * 0.55 * Math.max(...labels.map(l => String(l).length)));
        const valW = valueFs * 4.2, gap = h / n * 0.28, bh = (h - gap * (n - 1)) / n;
        vals.forEach((v, i) => {
          const y = i * (bh + gap), bw = Math.max(2, (w - labW - valW) * (v / max));
          const g = svg('g', { style: `--i:${i}` });
          g.appendChild(svg('rect', { x: labW, y, width: bw, height: bh, class: `c-bar is-h ${hl.has(i) ? 'is-hl' : ''}`, style: `--i:${i}` }));
          const lt = textEl(labW - 16, y + bh / 2, labels[i] ?? '', 'c-label', 'end'); lt.setAttribute('dominant-baseline', 'central'); lt.setAttribute('style', `--i:${i}`); g.appendChild(lt);
          const vt = textEl(labW + bw + 14, y + bh / 2, fmtNum(v, o), `c-value ${hl.has(i) ? 'is-hl' : ''}`, 'start'); vt.setAttribute('dominant-baseline', 'central'); vt.setAttribute('style', `--i:${i}`); g.appendChild(vt);
          s.appendChild(g);
        });
      } else {
        const top = valueFs * 1.6, labH = labelFs * 2.8, ch = h - top - labH;
        const slot = w / n, bw = slot * (o.barWidth ?? 0.56);
        s.appendChild(svg('line', { x1: 0, x2: w, y1: top + ch, y2: top + ch, class: 'c-axis' }));
        vals.forEach((v, i) => {
          const bh = Math.max(2, ch * (v / max)), x = i * slot + (slot - bw) / 2, y = top + ch - bh;
          s.appendChild(svg('rect', { x, y, width: bw, height: bh, class: `c-bar ${hl.has(i) ? 'is-hl' : ''}`, style: `--i:${i}` }));
          const vt = textEl(x + bw / 2, y - valueFs * 0.5, fmtNum(v, o), `c-value ${hl.has(i) ? 'is-hl' : ''}`); vt.setAttribute('style', `--i:${i}`); s.appendChild(vt);
          const lt = textEl(x + bw / 2, top + ch + labelFs * 1.3, labels[i] ?? '', 'c-label', 'middle', Math.max(6, Math.floor(slot / (labelFs * 0.55)))); lt.setAttribute('style', `--i:${i}`); s.appendChild(lt);
        });
      }
    } else if (type === 'dots') {
      // unit chart: one dot per item, the highlighted share in the accent ("40 of 45")
      const total = o.total ?? 0, hlN = o.highlight ?? 0;
      const cols = o.columns || Math.ceil(Math.sqrt(total * w / h)), rows = Math.ceil(total / cols);
      const cell = Math.min(w / cols, h / rows), rad = cell * (o.size ?? 0.36);
      const ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2;
      for (let j = 0; j < total; j++) {
        const cx = ox + (j % cols + 0.5) * cell, cy = oy + (Math.floor(j / cols) + 0.5) * cell;
        s.appendChild(svg('circle', { cx, cy, r: rad, class: `c-dot ${j < hlN ? 'is-hl' : ''}`, style: `--i:${j}` }));
      }
    } else if (type === 'waterfall') {
      const vals = o.values, labels = o.labels || [], n = vals.length + (o.total === false ? 0 : 1);
      let run = 0; const bars = vals.map(v => { const b = { from: run, to: run + v }; run += v; return b; });
      if (o.total !== false) bars.push({ from: 0, to: run, total: true });
      const lo = Math.min(0, ...bars.map(b => Math.min(b.from, b.to))), hi = Math.max(...bars.map(b => Math.max(b.from, b.to)));
      const top = valueFs * 1.6, labH = labelFs * 2.8, ch = h - top - labH, slot = w / n, bw = slot * 0.58;
      const Y = v => top + ch * (1 - (v - lo) / (hi - lo || 1));
      s.appendChild(svg('line', { x1: 0, x2: w, y1: Y(0), y2: Y(0), class: 'c-axis' }));
      bars.forEach((b, i) => {
        const x = i * slot + (slot - bw) / 2, y = Math.min(Y(b.from), Y(b.to)), bh = Math.max(2, Math.abs(Y(b.from) - Y(b.to)));
        const cls = b.total ? 'is-total' : (b.to < b.from ? 'is-neg' : 'is-pos');
        s.appendChild(svg('rect', { x, y, width: bw, height: bh, class: `c-bar c-seg-v ${cls} ${hl.has(i) ? 'is-hl' : ''}`, style: `--i:${i}` }));
        if (i < bars.length - 1) s.appendChild(svg('line', { x1: x + bw, x2: x + slot, y1: Y(b.to), y2: Y(b.to), class: 'c-connector c-label', style: `--i:${i}` }));
        const v = b.total ? b.to : b.to - b.from;
        const vt = textEl(x + bw / 2, y - valueFs * 0.5, (v > 0 && !b.total ? '+' : '') + fmtNum(v, o), 'c-value', 'middle'); vt.setAttribute('style', `--i:${i}`); s.appendChild(vt);
        const lt = textEl(x + bw / 2, top + ch + labelFs * 1.3, b.total ? (o.totalLabel || 'Total') : (labels[i] ?? ''), 'c-label', 'middle', Math.max(6, Math.floor(slot / (labelFs * 0.55)))); lt.setAttribute('style', `--i:${i}`); s.appendChild(lt);
      });
    } else if (type === 'line') {
      const labels = o.labels || [], series = o.series || [{ name: '', values: o.values }];
      const all = series.flatMap(sr => sr.values), lo = o.min ?? Math.min(0, ...all), hi = o.max ?? Math.max(...all);
      const left = 10, right = valueFs * 5, top = valueFs * 1.4, labH = labelFs * 2.2, cw = w - left - right, ch = h - top - labH;
      const X = j => left + (labels.length > 1 ? cw * j / (labels.length - 1) : cw / 2), Y = v => top + ch * (1 - (v - lo) / (hi - lo || 1));
      s.appendChild(svg('line', { x1: left, x2: left + cw, y1: top + ch, y2: top + ch, class: 'c-axis' }));
      labels.forEach((l, j) => { const t = textEl(X(j), top + ch + labelFs * 1.3, l, 'c-label'); t.setAttribute('style', `--i:${j}`); s.appendChild(t); });
      series.forEach((sr, si) => {
        const d = sr.values.map((v, j) => `${j ? 'L' : 'M'}${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        const p = svg('path', { d, class: `c-line ${hl.has(si) || series.length === 1 ? 'is-hl' : ''}`, style: `--i:${si}`, fill: 'none' });
        s.appendChild(p);
        const last = sr.values.length - 1;
        const vt = textEl(X(last) + 14, Y(sr.values[last]), (sr.name ? sr.name + ' ' : '') + fmtNum(sr.values[last], o), `c-value ${hl.has(si) ? 'is-hl' : ''}`, 'start');
        vt.setAttribute('dominant-baseline', 'central'); vt.setAttribute('style', `--i:${si + 3}`); s.appendChild(vt);
      });
    } else if (type === 'donut') {
      const vals = o.values, labels = o.labels || [], total = vals.reduce((a, b) => a + b, 0);
      const noLegend = o.legend === false;
      const legendW = noLegend ? 0 : 40 + labelFs * 0.56 * Math.max(...labels.map((l, i) => String(l).length + fmtNum(vals[i], o).length + 2));
      const legendH = noLegend ? 0 : vals.length * labelFs * 1.8;
      const below = w - legendW - 40 < h * 0.7; // narrow figure: legend under the ring
      const r = (below ? Math.min(w, h - legendH - 24) : Math.min(h, w - legendW - 40)) / 2 - 6, sw = r * (o.thickness ?? 0.32);
      const cx = below ? w / 2 : Math.max(0, (w - (2 * r + 40 + legendW)) / 2) + r + 6, cy = below ? r + 6 : h / 2;
      const rr = r - sw / 2, C = 2 * Math.PI * rr; let acc = 0;
      const dur = parseFloat(cssVar(fig, '--chart-sweep', '900'));
      const roughDonut = sketchStyle(fig) === 'rough';
      const at = (ang, rad) => ({ x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
      vals.forEach((v, i) => {
        const len = C * v / total;
        if (roughDonut) { // hand-drawn: hachured ring sectors, drawn stroke by stroke
          const a0 = -Math.PI / 2 + 2 * Math.PI * acc / total, a1 = -Math.PI / 2 + 2 * Math.PI * (acc + v) / total, big = a1 - a0 > Math.PI ? 1 : 0;
          const o1 = at(a0, r), o2 = at(a1, r), i1 = at(a1, r - sw), i2 = at(a0, r - sw);
          s.appendChild(svg('path', { d: `M${o1.x},${o1.y} A${r},${r} 0 ${big} 1 ${o2.x},${o2.y} L${i1.x},${i1.y} A${r - sw},${r - sw} 0 ${big} 0 ${i2.x},${i2.y} Z`, class: `c-arc c-sector ${hl.has(i) ? 'is-hl' : ''} c-k${i}`, style: `--i:${i}` }));
          acc += v;
          const ly = below ? 2 * r + 12 + labelFs * 1.1 + i * labelFs * 1.8 : cy - (vals.length - 1) * labelFs * 0.9 + i * labelFs * 1.8;
          const lt = svg('text', { x: below ? cx : cx + r + 40, y: ly, class: `c-label ${hl.has(i) ? 'is-hl' : ''}`, 'dominant-baseline': 'central', 'text-anchor': below ? 'middle' : 'start', style: `--i:${i}` });
          const t1 = svg('tspan', { class: 'c-legend-v' }); t1.textContent = fmtNum(v, o) + '  ';
          const t2 = svg('tspan'); t2.textContent = labels[i] ?? '';
          lt.append(t1, t2); if (!noLegend) s.appendChild(lt);
          return;
        }
        const c = svg('circle', { cx, cy, r: rr, fill: 'none', 'stroke-width': sw, class: `c-arc ${hl.has(i) ? 'is-hl' : ''} c-k${i}`,
          'stroke-dasharray': `${len} ${C + 1}`, transform: `rotate(${-90 + 360 * acc / total} ${cx} ${cy})`, style: `--i:${i};--len:${len}` });
        // One sweep, clockwise, on a single ease-in-out curve: each segment is a linear slice of it.
        const pa = acc / total, pb = (acc + v) / total, ta = sweepTime(pa), tb = sweepTime(pb);
        c.style.transitionDelay = `${Math.round(dur * ta)}ms`;
        c.style.transitionDuration = `${Math.max(16, Math.round(dur * (tb - ta)))}ms`;
        c.style.transitionTimingFunction = sliceEasing(ta, tb, pa, pb);
        s.appendChild(c); acc += v;
        const ly = below ? 2 * r + 12 + labelFs * 1.1 + i * labelFs * 1.8 : cy - (vals.length - 1) * labelFs * 0.9 + i * labelFs * 1.8;
        const lt = svg('text', { x: below ? cx : cx + r + 40, y: ly, class: `c-label ${hl.has(i) ? 'is-hl' : ''}`, 'dominant-baseline': 'central', 'text-anchor': below ? 'middle' : 'start', style: `--i:${i}` });
        const t1 = svg('tspan', { class: 'c-legend-v' }); t1.textContent = fmtNum(v, o) + '  ';
        const t2 = svg('tspan'); t2.textContent = labels[i] ?? '';
        lt.append(t1, t2); if (!noLegend) s.appendChild(lt);
      });
      if (o.center) { const t = textEl(cx, cy, o.center, 'c-value c-center'); t.setAttribute('dominant-baseline', 'central'); t.dataset.maxW = String((rr - sw / 2) * 2 * 0.8); s.appendChild(t); }
    }
    fig.insertBefore(s, fig.firstChild);
    s.querySelectorAll('[data-max-w]').forEach(t => { // keep centred labels inside the donut hole
      const max = parseFloat(t.dataset.maxW), w0 = t.getBBox().width;
      if (w0 > max) t.style.fontSize = `${parseFloat(getComputedStyle(t).fontSize) * max / w0}px`;
    });
    s.querySelectorAll('.c-line').forEach(p => { const L = p.getTotalLength(); p.style.setProperty('--len', L); p.style.strokeDasharray = `${L} ${L}`; });
    fig._chart = true;
    if (sketchStyle(fig) === 'rough') { fig.classList.add('is-rough'); roughifySvg(s, true); }
  }

  /* -------------------------------------------------------------- sketches */
  const sketchStyle = el => (cssVar(el, '--sketch-style', 'clean') === 'rough' && window.rough ? 'rough' : 'clean');
  const colorOf = (el, name) => {
    if (!name) return cssVar(el, '--sketch-color', cssVar(el, '--accent', '#d33'));
    if (/^(#|rgb|hsl|oklch|var\()/.test(name)) return name;
    return cssVar(el, `--marker-${name}`, cssVar(el, `--${name}`, name));
  };
  let seedCounter = 1;
  // Two layers: highlighter strokes blend with the page (multiply/screen) so ink shows through;
  // every other mark keeps its own colour where it crosses text.
  function ensureLayer(slide, kind = 'marks') {
    const cls = kind === 'highlight' ? 'sketch-layer is-highlight-layer' : 'sketch-layer';
    let layer = slide.querySelector(`:scope > svg.${cls.split(' ').join('.')}`);
    if (kind !== 'highlight') layer = [...slide.querySelectorAll(':scope > svg.sketch-layer')].find(l => !l.classList.contains('is-highlight-layer'));
    if (!layer) {
      layer = svg('svg', { class: cls, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      if (kind === 'highlight') slide.insertBefore(layer, slide.querySelector(':scope > svg.sketch-layer'));
      else slide.appendChild(layer);
    }
    return layer;
  }
  // Rects of an element in slide coordinates (1920x1080), ignoring in-flight build transforms.
  // Font metrics, so marks sit on the visible glyphs rather than the font's (often tall) line box.
  const metricCache = new Map();
  function inkMetrics(el) {
    const cs = getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (metricCache.has(font)) return metricCache.get(font);
    let m = null;
    try {
      const ctx = (inkMetrics.ctx ||= doc.createElement('canvas').getContext('2d'));
      ctx.font = font;
      const H = ctx.measureText('H'), x = ctx.measureText('x'), g = ctx.measureText('gjpqy');
      if (H.fontBoundingBoxAscent) m = { fa: H.fontBoundingBoxAscent, fd: H.fontBoundingBoxDescent, cap: H.actualBoundingBoxAscent, xh: x.actualBoundingBoxAscent, desc: g.actualBoundingBoxDescent, size: parseFloat(cs.fontSize) };
    } catch {}
    metricCache.set(font, m);
    return m;
  }
  // Boxed elements (background, border, stickies, figures) are marked by their box; text is
  // marked by its ink: one rect per rendered line, so a cross or underline hugs the words.
  function rectsIn(slide, el) {
    const sr = slide.getBoundingClientRect(), s = sr.width / W || 1;
    const map = r => ({ x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s });
    const box = map(el.getBoundingClientRect());
    const cs = getComputedStyle(el);
    const boxed = el.dataset.sketchFit === 'box' || el.matches('img,svg,figure,video,canvas,.sticky,.chart,.callout') ||
      !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0;
    if (boxed && el.dataset.sketchFit !== 'text') return { all: box, lines: [box] };
    const range = doc.createRange(); range.selectNodeContents(el);
    const raw = [...range.getClientRects()].map(map).filter(r => r.w > 1 && r.h > 1).sort((a, b) => a.y - b.y || a.x - b.x);
    if (!raw.length) return { all: box, lines: [box] };
    const lines = [];
    for (const r of raw) {
      const L = lines.find(l => Math.abs((l.y + l.h / 2) - (r.y + r.h / 2)) < Math.min(l.h, r.h) * 0.5);
      if (!L) { lines.push({ ...r }); continue; }
      const x1 = Math.min(L.x, r.x), y1 = Math.min(L.y, r.y), x2 = Math.max(L.x + L.w, r.x + r.w), y2 = Math.max(L.y + L.h, r.y + r.h);
      Object.assign(L, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    const m = inkMetrics(el);
    if (m) for (const l of lines) { // baseline and ink box of each line, from the font's metrics
      const half = (l.h - (m.fa + m.fd)) / 2; // extra leading (if the rect is a line box) split above and below
      l.base = l.y + Math.max(0, half) + m.fa; l.m = m;
      l.y = l.base - m.cap; l.h = m.cap + m.desc * 0.6;
    }
    const x1 = Math.min(...lines.map(l => l.x)), y1 = Math.min(...lines.map(l => l.y));
    const x2 = Math.max(...lines.map(l => l.x + l.w)), y2 = Math.max(...lines.map(l => l.y + l.h));
    return { all: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, lines };
  }
  function measureSketches(slide) {
    const targets = [...slide.querySelectorAll('[data-sketch]')];
    if (!targets.length) return;
    // Measure the fully built state (with the design's own transforms), without animating.
    slide.classList.add('no-anim');
    const hidden = [...slide.querySelectorAll('[data-step]:not(.is-in)')];
    hidden.forEach(el => el.classList.add('is-in'));
    void slide.offsetWidth;
    const geo = targets.map(el => {
      const g = rectsIn(slide, el);
      const to = el.dataset.to ? slide.querySelector(el.dataset.to) : null;
      return [el, g, to ? rectsIn(slide, to) : null];
    });
    hidden.forEach(el => el.classList.remove('is-in'));
    void slide.offsetWidth;
    slide.classList.remove('no-anim');
    for (const [el, g, to] of geo) { el._geo = g; el._geoTo = to; }
  }
  function annotationPaths(slide, el, type) {
    const style = sketchStyle(slide);
    const color = colorOf(slide, el.dataset.sketchColor);
    const sw = parseFloat(el.dataset.sketchWidth || cssVar(slide, '--sketch-width', '4'));
    const pad = parseFloat(el.dataset.sketchPad ?? cssVar(slide, '--sketch-pad', '10'));
    const { all, lines } = el._geo;
    const seed = el._seed || (el._seed = (seedCounter++ * 7919) % 2147483647);
    const out = [];
    const rc = style === 'rough' ? window.rough.svg(ensureLayer(slide)) : null;
    const ro = { stroke: color, strokeWidth: sw, roughness: parseFloat(cssVar(slide, '--roughness', '1.4')), bowing: 1.2, seed, disableMultiStroke: false };
    const line = (x1, y1, x2, y2, extra = {}) => rc ? rc.line(x1, y1, x2, y2, { ...ro, ...extra })
      : svg('path', { d: `M${x1},${y1} L${x2},${y2}`, stroke: extra.stroke || color, 'stroke-width': extra.strokeWidth || sw, 'stroke-linecap': 'round', fill: 'none' });
    const path = (d, extra = {}) => rc ? rc.path(d, { ...ro, ...extra })
      : svg('path', { d, stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' });
    switch (type) {
      case 'underline':
        lines.forEach(r => { const y = r.base != null ? r.base + r.m.size * 0.14 + pad * 0.3 : r.y + r.h + pad * 0.4; out.push(line(r.x - 2, y, r.x + r.w + 2, y)); });
        break;
      case 'double-underline':
        lines.forEach(r => { const y = r.base != null ? r.base + r.m.size * 0.12 + pad * 0.2 : r.y + r.h + pad * 0.3; out.push(line(r.x, y, r.x + r.w, y)); out.push(line(r.x + 6, y + sw * 2.2, r.x + r.w - 4, y + sw * 2.2)); });
        break;
      case 'strike':
        lines.forEach(r => { const y = r.base != null ? r.base - r.m.xh * 0.5 : r.y + r.h * 0.55; out.push(line(r.x - 4, y, r.x + r.w + 4, y)); });
        break;
      case 'cross': {
        const r = all; out.push(line(r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad)); out.push(line(r.x + r.w + pad, r.y - pad, r.x - pad, r.y + r.h + pad));
        break;
      }
      case 'box': {
        const r = all, x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2;
        out.push(rc ? rc.rectangle(x, y, w, h, ro) : svg('rect', { x, y, width: w, height: h, rx: parseFloat(cssVar(slide, '--sketch-radius', '6')), stroke: color, 'stroke-width': sw, fill: 'none' }));
        break;
      }
      case 'circle': {
        const r = all, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        let w = r.w * 1.18 + pad * 2, h = r.h * 1.45 + pad * 2;
        if (el._geo.lines[0]?.m) { // in running text, stay within the line spacing; widen instead
          const cs = getComputedStyle(el), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          const capH = lh * 1.15 + pad;
          if (h > capH) { w += (h - capH) * 0.6; h = capH; }
        }
        out.push(rc ? rc.ellipse(cx, cy, w, h, ro) : svg('ellipse', { cx, cy, rx: w / 2, ry: h / 2, stroke: color, 'stroke-width': sw, fill: 'none' }));
        break;
      }
      case 'highlight': {
        const hc = colorOf(slide, el.dataset.sketchColor || 'highlight');
        lines.forEach(r => {
          const band = r.base != null ? r.m.xh * 1.35 : r.h * 0.82, cy = r.base != null ? r.base - r.m.xh * 0.42 : r.y + r.h * 0.53;
          const cap = rc ? band / 2 : 0, ext = Math.min(pad, 12) * 0.5; // round caps reach half a stroke past the ends
          const p = svg('path', { d: `M${r.x - ext + cap},${cy + band * 0.04} L${r.x + r.w + ext - cap},${cy - band * 0.04}`, stroke: hc, 'stroke-width': band, 'stroke-linecap': rc ? 'round' : 'butt', fill: 'none', class: 'is-highlight', opacity: cssVar(slide, '--highlight-opacity', '0.55') });
          out.push(p);
        });
        break;
      }
      case 'bracket-left': case 'bracket-right': {
        const r = all, left = type === 'bracket-left', x = left ? r.x - pad : r.x + r.w + pad, d = left ? 18 : -18;
        out.push(path(`M${x + d},${r.y - 4} L${x},${r.y - 4} L${x},${r.y + r.h + 4} L${x + d},${r.y + r.h + 4}`));
        break;
      }
      case 'tick': {
        const r = all, x = r.x - pad - 44, y = r.y + r.h / 2;
        out.push(path(`M${x},${y} L${x + 14},${y + 16} L${x + 40},${y - 22}`));
        break;
      }
      case 'arrow': {
        if (!el._geoTo) break;
        const a = el._geo.all, b = el._geoTo.all;
        const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const edge = (r, c, toward) => { // point on rect edge toward a target
          const dx = toward.x - c.x, dy = toward.y - c.y, sx = (r.w / 2 + pad) / Math.abs(dx || 1e-6), sy = (r.h / 2 + pad) / Math.abs(dy || 1e-6), t = Math.min(sx, sy);
          return { x: c.x + dx * t, y: c.y + dy * t };
        };
        const p1 = edge(a, ca, cb), p2 = edge(b, cb, ca);
        const bend = parseFloat(el.dataset.curve ?? '0.18'), mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const qx = mx - (p2.y - p1.y) * bend, qy = my + (p2.x - p1.x) * bend;
        out.push(path(`M${p1.x},${p1.y} Q${qx},${qy} ${p2.x},${p2.y}`));
        const ang = Math.atan2(p2.y - qy, p2.x - qx), L = 22 + sw * 2;
        const h1 = { x: p2.x - L * Math.cos(ang - 0.45), y: p2.y - L * Math.sin(ang - 0.45) }, h2 = { x: p2.x - L * Math.cos(ang + 0.45), y: p2.y - L * Math.sin(ang + 0.45) };
        out.push(path(`M${h1.x},${h1.y} L${p2.x},${p2.y} L${h2.x},${h2.y}`));
        break;
      }
      default: console.warn('unknown sketch type', type);
    }
    return out;
  }
  // Animate strokes as if drawn by hand. Returns total duration in ms.
  function drawIn(nodes, { animate = true, delay = 0, budget = 1200 } = {}) {
    const paths = nodes.flatMap(n => (n.tagName === 'path' || n.tagName === 'rect' || n.tagName === 'ellipse' || n.tagName === 'circle' || n.tagName === 'line' || n.tagName === 'polyline' ? [n] : [...n.querySelectorAll('path,rect,ellipse,circle,line,polyline')]));
    if (!animate || reduced() || !paths.length) return 0;
    const lens = paths.map(p => { try { return p.getTotalLength(); } catch { return 200; } });
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    const speed = Math.max(total / budget, 1.4); // px per ms
    const durs = lens.map(L => clamp((L + 2) / speed, 90, 650));
    const natural = durs.reduce((a, d) => a + d * 0.82, 0);
    const squeeze = natural > budget ? budget / natural : 1; // overlap strokes more on busy drawings
    let t = delay;
    paths.forEach((p, j) => {
      const L = lens[j] + 2, dur = durs[j];
      const isFill = p.getAttribute('fill') && p.getAttribute('fill') !== 'none' && (!p.getAttribute('stroke') || p.getAttribute('stroke') === 'none');
      if (isFill) {
        p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: t, fill: 'backwards', easing: 'ease-out' });
      } else {
        p.style.strokeDasharray = `${L} ${L}`;
        const a = p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: dur, delay: t, fill: 'backwards', easing: 'cubic-bezier(.3,.1,.3,1)' });
        a.finished.then(() => { p.style.strokeDasharray = ''; }).catch(() => {});
        t += dur * 0.82 * squeeze;
      }
    });
    return t;
  }
  function sketchesFor(slide) {
    return [...slide.querySelectorAll('[data-sketch]')].map(el => ({
      el, step: parseFloat(el.dataset.sketchStep ?? el.dataset.step ?? el.closest('[data-step]')?.dataset.step ?? 0) || 0,
      types: el.dataset.sketch.split(/\s+/).filter(Boolean),
    }));
  }
  function syncSketches(slide, v, animate) {
    if (!slide._sketches) return;
    let delay = animate ? parseFloat(cssVar(slide, '--sketch-delay', '260')) : 0;
    for (const sk of slide._sketches) {
      const want = sk.step <= v;
      if (want && !sk.nodes) {
        sk.nodes = sk.types.flatMap(t => annotationPaths(slide, sk.el, t)).map(n => (n.tagName === 'g' ? splitSubpaths(n) : n));
        sk.nodes.forEach(n => ensureLayer(slide, n.classList?.contains('is-highlight') ? 'highlight' : 'marks').appendChild(n));
        if (animate && sk.step === v) {
          const end = drawIn(sk.nodes, { animate: true, delay, budget: 700 });
          if (end > delay) delay += (end - delay) * 0.7;
        }
      } else if (!want && sk.nodes) {
        sk.nodes.forEach(n => n.remove()); sk.nodes = null;
      }
    }
  }

  // rough.js draws a shape as one path with several subpaths; split them so a draw-on animation
  // traces each stroke in turn instead of growing every piece at once.
  function splitSubpaths(g) {
    (g.tagName === 'path' ? [g] : [...g.querySelectorAll('path')]).forEach(p => {
      const parts = (p.getAttribute('d') || '').split(/(?=M)/).filter(x => x.trim());
      if (parts.length < 2 || !p.parentNode) return;
      parts.forEach(d => { const q = p.cloneNode(false); q.setAttribute('d', d); p.parentNode.insertBefore(q, p); });
      p.remove();
    });
    return g;
  }
  // Convert authored SVG primitives inside <svg class="sketch"> (and charts) into rough.js drawings.
  function roughifySvg(s, isChart = false) {
    if (s._rough || !window.rough) return;
    s._rough = true;
    const rc = window.rough.svg(s);
    const host = s.closest('.slide') || body;
    const rough = parseFloat(cssVar(host, '--roughness', '1.4'));
    const prims = [...s.querySelectorAll('rect,circle,ellipse,line,polyline,polygon,path')].filter(p => !p.closest('defs,marker,clipPath,mask,pattern') && !p.dataset.clean);
    for (const p of prims) {
      const cs = getComputedStyle(p);
      const stroke = p.getAttribute('stroke') || (cs.stroke !== 'none' ? cs.stroke : 'none');
      const fillAttr = isChart ? cs.fill : p.getAttribute('fill'); // authored sketches: only an explicit fill
      const fill = fillAttr && fillAttr !== 'none' && !/rgba?\(0, 0, 0, 0\)/.test(fillAttr) ? fillAttr : undefined;
      const o = {
        stroke: stroke === 'none' ? (fill ? 'none' : cssVar(host, '--ink', '#222')) : stroke,
        strokeWidth: parseFloat(p.getAttribute('stroke-width') || cs.strokeWidth) || 3,
        roughness: parseFloat(p.dataset.roughness ?? rough), bowing: 1, seed: (seedCounter++ * 104729) % 2147483647,
        fill, fillStyle: p.dataset.fillStyle || (isChart ? 'hachure' : 'hachure'), hachureGap: parseFloat(p.dataset.hachureGap || (isChart ? 9 : 10)), fillWeight: parseFloat(p.dataset.fillWeight || 2.2),
      };
      let n = null; const a = k => parseFloat(p.getAttribute(k) || 0);
      const pts = () => (p.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).reduce((acc, v, j, arr) => (j % 2 ? acc : acc.concat([[v, arr[j + 1]]])), []);
      try {
        switch (p.tagName) {
          case 'rect': n = rc.rectangle(a('x'), a('y'), a('width'), a('height'), o); break;
          case 'circle': n = rc.circle(a('cx'), a('cy'), a('r') * 2, o); break;
          case 'ellipse': n = rc.ellipse(a('cx'), a('cy'), a('rx') * 2, a('ry') * 2, o); break;
          case 'line': n = rc.line(a('x1'), a('y1'), a('x2'), a('y2'), o); break;
          case 'polyline': n = rc.linearPath(pts(), o); break;
          case 'polygon': n = rc.polygon(pts(), o); break;
          case 'path': n = rc.path(p.getAttribute('d'), o); break;
        }
      } catch (e) { console.warn('roughify failed', e); }
      if (!n) continue;
      n.querySelectorAll('path').forEach(pp => { for (const k of ['stroke', 'fill', 'stroke-width']) { const v = pp.getAttribute(k); if (v != null) pp.style.setProperty(k, v); } });
      // outline first, then the fill (rough.js emits the hachure first): trace, then colour in
      [...n.querySelectorAll('path')].filter(pp => o.fill && !(pp.getAttribute('stroke') === o.stroke && parseFloat(pp.getAttribute('stroke-width')) === o.strokeWidth)).forEach(pp => { pp.classList.add('r-fill'); n.appendChild(pp); });
      for (const at of [...p.attributes]) if (/^(data-|class$|style$|transform$|opacity$|id$)/.test(at.name)) n.setAttribute(at.name, at.value);
      splitSubpaths(n);
      n.classList.add('rough-shape');
      if (p.dataset.step && !isChart) n.classList.add('rough-draw');
      p.replaceWith(n);
    }
  }

  /* ------------------------------------------------------------ data-fit */
  function fitText(el) {
    const max = parseFloat(el.dataset.fitMax || getComputedStyle(el).fontSize);
    const min = parseFloat(el.dataset.fitMin || 18);
    let lo = min, hi = max;
    el.style.fontSize = hi + 'px';
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    for (let j = 0; j < 14; j++) {
      const mid = (lo + hi) / 2; el.style.fontSize = mid + 'px';
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) lo = mid; else hi = mid;
    }
    el.style.fontSize = lo + 'px';
  }

  /* --------------------------------------------------------- slide prep */
  // Some work needs the slide rendered (display:block) to measure; do it lazily once.
  function prepare(slide) {
    if (slide._prepared) return;
    slide._prepared = true;
    slide.querySelectorAll('[data-fit]').forEach(fitText);
    slide.querySelectorAll('[data-step]').forEach(el => { if (getComputedStyle(el).display === 'inline') el.classList.add('is-inline'); });
    // A morph name only when the previous or next slide has a partner; otherwise the element
    // would fade on the browser's own clock, out of step with the slide.
    const idx = slides.indexOf(slide);
    slide.querySelectorAll('[data-morph]').forEach(el => {
      const name = el.dataset.morph;
      const partner = [slides[idx - 1], slides[idx + 1]].some(s => s && s.querySelector(`[data-morph="${CSS.escape(name)}"]`));
      if (!partner) { console.warn(`data-morph="${name}" on slide ${idx + 1} has no partner on a neighbouring slide`); return; }
      el.style.viewTransitionName = 'm-' + name.replace(/[^\w-]/g, '_');
      el.style.viewTransitionClass = 'morph';
    });
    slide.querySelectorAll('figure.chart').forEach(renderChart);
    if (sketchStyle(slide) === 'rough') slide.querySelectorAll('svg.sketch').forEach(s => roughifySvg(s));
    slide._sketches = sketchesFor(slide);
    measureSketches(slide);
    collectSteps(slide);
  }
  function chartsSync(slide, v, animate) {
    slide.querySelectorAll('figure.chart').forEach(fig => {
      const st = parseFloat(fig.dataset.step || 0) || 0;
      const want = st <= v;
      if (want === fig.classList.contains('is-drawn')) return;
      if (!want) { fig.classList.remove('is-drawn'); return; }
      if (sketchStyle(fig) === 'rough' && animate) {
        fig.classList.add('is-drawn');
        drawIn([...fig.querySelectorAll('.rough-shape')], { delay: 150, budget: 1300 });
      } else if (animate) {
        requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.add('is-drawn')));
      } else fig.classList.add('is-drawn');
    });
  }
  function roughDrawSync(slide, v, animate) {
    const entering = [];
    slide.querySelectorAll('.rough-draw').forEach(g => {
      const want = (parseFloat(g.dataset.step) || 0) <= v;
      if (want && !g.classList.contains('is-in')) { g.classList.add('is-in'); entering.push(g); }
      else if (!want) g.classList.remove('is-in');
    });
    // one chained draw-on, in document order: shafts before arrowheads, bodies before fins
    if (animate && entering.length) drawIn(entering, { delay: 80, budget: Math.min(1600, 600 + 250 * entering.length) });
  }
  function entryDraw(slide, animate) {
    // Whiteboard: un-stepped rough shapes draw themselves on entry, in document order.
    if (!animate || reduced()) { slide.querySelectorAll('.rough-shape.is-pending').forEach(sh => sh.classList.remove('is-pending')); return; }
    const shapes = [...slide.querySelectorAll('svg.sketch .rough-shape:not(.rough-draw)')];
    if (shapes.length) drawIn(shapes, { delay: 60, budget: Math.min(1600, 300 + shapes.length * 120) });
    shapes.forEach(sh => sh.classList.remove('is-pending')); // the draw-on's backwards fill now hides the strokes
  }

  /* ----------------------------------------------------------- count-up */
  // <span class="num" data-count>5,400</span>: counts up from zero when revealed.
  function countSpec(el) {
    const final = el.dataset.final || (el.dataset.final = el.textContent.trim());
    const m = final.match(/^(\D*?)(\d[\d.,\u00a0\u202f ]*\d|\d)(.*)$/s);
    if (!m) return { final };
    const [, pre, num, post] = m;
    const dm = num.match(/[.,](\d{1,2})$/);
    const decimals = dm ? dm[1].length : 0, decSep = dm ? num[num.length - decimals - 1] : '.';
    const intPart = decimals ? num.slice(0, -(decimals + 1)) : num;
    const thou = (intPart.match(/[^\d]/) || [''])[0];
    const target = parseInt(num.replace(/\D/g, ''), 10) / 10 ** decimals;
    const fmt = v => { let [i, f] = v.toFixed(decimals).split('.'); if (thou) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, thou); return pre + i + (decimals ? decSep + f : '') + post; };
    return { final, target, fmt, countable: target >= 10 }; // 0x, 1x, 2x reads as wrong data: small numbers never count
  }
  function countUp(el, animate) {
    const { final, target, fmt, countable } = countSpec(el);
    if (!countable || !animate || reduced()) { el.textContent = final; return; }
    const dur = parseFloat(el.dataset.countDur || cssVar(el, '--count-dur', '1000'));
    // The clock is a WAAPI animation of an inert custom property: QA and devtools can see, pause
    // and scrub it, and it never overrides the element's own opacity or transform.
    // start when the number becomes visible: after its (or its step's) reveal delay
    const host = el.closest('[data-step]') || el;
    const wait = Math.max(0, ...getComputedStyle(host).transitionDelay.split(',').map(v => parseFloat(v) * (v.includes('ms') ? 1 : 1000)).filter(Number.isFinite));
    const clock = el.animate([{ '--s2d-count': '0' }, { '--s2d-count': '1' }], { duration: dur, delay: wait, easing: 'linear' });
    el.style.fontFeatureSettings = '"tnum" 1';
    const step = () => {
      const p = clamp(((clock.currentTime || 0) - wait) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? fmt(target * e) : final;
      if (p < 1 && clock.playState !== 'finished') requestAnimationFrame(step); else { el.textContent = final; el.style.fontFeatureSettings = ''; }
    };
    clock.finished.then(() => { el.textContent = final; el.style.fontFeatureSettings = ''; }).catch(() => {});
    el.textContent = fmt(0); requestAnimationFrame(step);
  }
  function countSync(slide, animate, entry = false) {
    slide.querySelectorAll('[data-count]').forEach(el => {
      const host = el.closest('[data-step]');
      const visible = host ? host.classList.contains('is-in') : true;
      if (visible && !el._counted) { el._counted = true; countUp(el, animate && (entry ? !host : !!host)); }
      else if (!visible) { el._counted = false; }
    });
  }

  /* ------------------------------------------------------------ render */
  function applyState(slide, k, animate) {
    const v = stepValue(slide, k);
    slide.dataset.k = String(k); // CSS hook: .slide[data-k="2"] …
    if (!animate) slide.classList.add('no-anim');
    slide.querySelectorAll('[data-step]:not(.rough-draw)').forEach(el => el.classList.toggle('is-in', (parseFloat(el.dataset.step) || 0) <= v));
    slide.querySelectorAll('[data-step-out]').forEach(el => el.classList.toggle('is-out', parseFloat(el.dataset.stepOut) <= v));
    chartsSync(slide, v, animate);
    roughDrawSync(slide, v, animate);
    syncSketches(slide, v, animate);
    countSync(slide, animate);
    if (!animate) { void slide.offsetWidth; requestAnimationFrame(() => slide.classList.remove('no-anim')); }
  }

  function go(i, k = 0, opts = {}) {
    i = clamp(i | 0, 0, slides.length - 1);
    const to = slides[i], from = slides[state.i];
    if (!to._prepared) { const was = to.classList.contains('is-active'); to.classList.add('is-active'); prepare(to); if (!was && to !== from) to.classList.remove('is-active'); }
    k = k === Infinity ? to._steps.length : clamp(k | 0, 0, to._steps.length);
    const sameSlide = !!from && i === state.i && from.classList.contains('is-active') && !opts.force;
    if (sameSlide && k === state.k) return;
    const animate = !opts.instant && !reduced();
    if (sameSlide) {
      if (to.querySelector('.rough-shape.is-pending')) entryDraw(to, animate); // a quick second press: draw now
      applyState(to, k, animate && k === state.k + 1);
    } else {
      const forward = i > state.i;
      const update = () => {
        slides.forEach(s => { if (s !== to) s.classList.remove('is-active', 'is-entered', 'is-current'); });
        to.classList.add('is-active', 'is-current');
        root.dataset.dir = forward ? 'fwd' : 'back';
        // Arriving: everything up to k is shown; the arrival itself animates step-0 content.
        to.querySelectorAll('figure.chart').forEach(f => f.classList.remove('is-drawn'));
        to._sketches?.forEach(sk => { if (sk.nodes) { sk.nodes.forEach(n => n.remove()); sk.nodes = null; } });
        to.querySelectorAll('.rough-draw').forEach(g => g.classList.remove('is-in'));
        applyState(to, k, false);
        if (animate && forward && k === 0) {
          // step-0 charts/sketches/count-ups are reset here and animate in enter(), once the slide is visible
          to.querySelectorAll('figure.chart').forEach(f => { if (!(parseFloat(f.dataset.step) > 0)) f.classList.remove('is-drawn'); });
          to._sketches?.forEach(sk => { if (sk.step === 0 && sk.nodes) { sk.nodes.forEach(n => n.remove()); sk.nodes = null; } });
          to.querySelectorAll('[data-count]').forEach(el => { if (!el.closest('[data-step]')) { const c = countSpec(el); if (c.countable && !reduced()) el.textContent = c.fmt(0); } });
          to.querySelectorAll('svg.sketch .rough-shape:not(.rough-draw)').forEach(sh => sh.classList.add('is-pending'));
        } else to.querySelectorAll('.rough-shape.is-pending').forEach(sh => sh.classList.remove('is-pending'));
      };
      const enter = (delayed = false) => {
        to.classList.add('is-entered');
        if (animate && forward && k === 0) {
          // Entry animations wait until the incoming slide is visible (theme: --entry-delay).
          const wait = parseFloat(cssVar(to, '--entry-delay', '0')) || 0;
          if (wait && !delayed) { setTimeout(() => { if (slides[state.i] === to && state.k === 0) enter(true); else if (to.querySelector('.rough-shape.is-pending')) entryDraw(to, false); }, wait); return; }
          chartsSync(to, 0, true);
          syncSketches(to, 0, true);
          entryDraw(to, true);
          to.querySelectorAll('[data-count]').forEach(el => { if (!el.closest('[data-step]')) { el._counted = false; } });
          countSync(to, true, true);
        }
      };
      const useVT = animate && doc.startViewTransition && !state.overview && !opts.noTransition && root.dataset.transitions !== 'off';
      if (useVT) {
        try { activeVT?.skipTransition(); } catch {}
        const morph = [...to.querySelectorAll('[data-morph]')].some(el => from && from.querySelector(`[data-morph="${CSS.escape(el.dataset.morph)}"]`));
        const light = s => s && s.dataset.tone === 'light';
        const types = [forward ? 'fwd' : 'back'].concat(morph ? ['morph'] : [], light(from) && light(to) ? ['light-light'] : []);
        root.dataset.vt = types.join(' '); // for themes in browsers without transition types
        let t;
        try { t = doc.startViewTransition({ update, types }); } catch { t = doc.startViewTransition(update); }
        activeVT = t;
        t.ready.catch(() => {});
        t.updateCallbackDone.then(() => requestAnimationFrame(() => enter()), () => {});
        t.finished.catch(() => {}).finally(() => { if (activeVT === t) { activeVT = null; delete root.dataset.vt; } });
      } else { update(); requestAnimationFrame(() => enter()); }
    }
    state.i = i; state.k = k;
    chrome();
    if (!opts.noHash) writeHash();
    if (!opts.fromAudio) audioFollow();
    speakerPost();
  }
  let activeVT = null;
  function next() { const s = slides[state.i]; if (state.k < s._steps.length) go(state.i, state.k + 1); else if (state.i < slides.length - 1) go(state.i + 1, 0); }
  function prev() { if (state.k > 0) go(state.i, state.k - 1); else if (state.i > 0) go(state.i - 1, Infinity); }

  /* ------------------------------------------------------------- chrome */
  const chromeEl = doc.createElement('div');
  chromeEl.className = 'deck-chrome';
  chromeEl.innerHTML = `
    <div class="deck-progress"><i></i></div>
    <div class="deck-caption" aria-live="polite"></div>
    <div class="deck-player" role="group" aria-label="Listen along">
      <button class="play" title="Listen along (P)" aria-label="Play">▶</button>
      <span class="time">0:00</span>
      <div class="scrub" title="Seek"><div class="fill"></div></div>
      <button class="cc" title="Captions (C)" aria-label="Toggle captions">CC</button>
      <button class="rate" title="Playback speed" aria-label="Playback speed">1×</button>
    </div>
    <div class="deck-controls">
      <button class="prev" aria-label="Previous (←)">‹</button>
      <span class="deck-count"></span>
      <button class="next" aria-label="Next (→)">›</button>
      <button class="ov" aria-label="Overview (O)" title="Overview (O)">▦</button>
      <button class="fs" aria-label="Fullscreen (F)" title="Fullscreen (F)">⤢</button>
      <button class="help" aria-label="Keyboard shortcuts (?)" title="Shortcuts (?)">?</button>
    </div>`;
  body.appendChild(chromeEl);
  const help = doc.createElement('div');
  help.className = 'deck-help'; help.setAttribute('role', 'dialog'); help.setAttribute('aria-label', 'Keyboard shortcuts');
  help.innerHTML = `<h2>Shortcuts</h2><dl>
    <dt>→ Space PgDn</dt><dd>Next step / slide</dd><dt>← PgUp</dt><dd>Previous</dd>
    <dt>Home / End</dt><dd>First / last slide</dd><dt>12 Enter</dt><dd>Go to slide 12</dd>
    <dt>O / Esc</dt><dd>Overview</dd><dt>S</dt><dd>Speaker view</dd><dt>F</dt><dd>Fullscreen</dd>
    <dt>P</dt><dd>Listen along (play / pause)</dd><dt>C</dt><dd>Captions while listening</dd>
    <dt>B</dt><dd>Black screen</dd><dt>?</dt><dd>This help</dd></dl>`;
  body.appendChild(help);
  const black = doc.createElement('div'); black.className = 'deck-black'; body.appendChild(black);
  const toast = doc.createElement('div'); toast.className = 'deck-toast'; body.appendChild(toast);
  let toastT; const say = msg => { toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('is-on'), 1400); };

  const countEl = chromeEl.querySelector('.deck-count');
  function chrome() {
    const total = slides.reduce((a, s) => a + 1 + (s._steps?.length || 0), 0);
    let pos = 0; for (let j = 0; j < state.i; j++) pos += 1 + (slides[j]._steps?.length || 0);
    pos += state.k;
    root.style.setProperty('--progress', String(total > 1 ? pos / (total - 1) : 1));
    countEl.textContent = `${state.i + 1} / ${slides.length}`;
    slides.forEach((s, j) => s.classList.toggle('is-current', j === state.i));
  }
  let idleT;
  function wake() { body.classList.add('show-chrome'); clearTimeout(idleT); idleT = setTimeout(() => body.classList.remove('show-chrome'), 2200); }
  addEventListener('mousemove', wake, { passive: true });

  /* -------------------------------------------------- slide tracker/number */
  function decorate() {
    const sections = [];
    slides.forEach(s => { const sec = s.dataset.section; if (sec && !sections.includes(sec)) sections.push(sec); });
    slides.forEach((s, j) => {
      if (sections.length && s.dataset.section && !s.querySelector('.tracker') && s.dataset.tracker !== 'off') {
        const nav = doc.createElement('nav'); nav.className = 'tracker'; nav.setAttribute('aria-hidden', 'true');
        sections.forEach(sec => { const b = doc.createElement('span'); b.textContent = sec; if (sec === s.dataset.section) b.className = 'is-on'; nav.appendChild(b); });
        (s.querySelector('.slide-head') || s).prepend(nav);
      }
      if (!s.querySelector('.slide-num') && s.dataset.number !== 'off') {
        const n = doc.createElement('span'); n.className = 'slide-num'; n.textContent = String(j + 1); n.setAttribute('aria-hidden', 'true'); s.appendChild(n);
      }
      if (!s.hasAttribute('aria-label')) s.setAttribute('aria-label', `Slide ${j + 1}: ${s.dataset.title || s.querySelector('h1,h2')?.textContent?.trim() || ''}`);
      s.setAttribute('role', 'group'); s.setAttribute('aria-roledescription', 'slide');
    });
  }

  /* -------------------------------------------------------------- hash */
  function writeHash() { const h = `#/${state.i + 1}${state.k ? '/' + state.k : ''}`; if (location.hash !== h) history.replaceState(null, '', h); }
  function readHash() { const m = location.hash.match(/^#\/(\d+)(?:\/(\d+))?/); return m ? [parseInt(m[1], 10) - 1, parseInt(m[2] || '0', 10)] : null; }
  addEventListener('hashchange', () => { const h = readHash(); if (h) go(h[0], h[1], { noHash: true }); });

  /* ---------------------------------------------------------- overview */
  function overview(on = !state.overview) {
    state.overview = on;
    body.classList.toggle('is-overview', on);
    if (on) {
      slides.forEach(s => { if (!s._prepared) { s.classList.add('is-active'); prepare(s); s.classList.remove('is-active'); } });
      slides.forEach(s => { s.classList.add('no-anim'); applyState(s, s._steps.length, false); });
      requestAnimationFrame(() => slides[state.i].scrollIntoView({ block: 'center' }));
    } else {
      slides.forEach((s, j) => { if (j !== state.i) s.classList.remove('is-active'); });
      go(state.i, state.k, { instant: true, force: true });
    }
  }
  deckEl.addEventListener('click', e => {
    if (state.overview) { const s = e.target.closest('.slide'); if (s) { state.i = slides.indexOf(s); state.k = 0; overview(false); } return; }
    if (e.target.closest('a,button,input,audio,video,[data-no-advance]')) return;
    if (getSelection().toString()) return;
    e.clientX < innerWidth * 0.25 ? prev() : next();
  });

  /* ------------------------------------------------------------- input */
  let typed = '';
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    const key = e.key;
    if (help.classList.contains('is-open') && key !== '?') { help.classList.remove('is-open'); if (key === 'Escape') return; }
    if (/^\d$/.test(key)) { typed += key; return; }
    if (key === 'Enter' && typed) { go(parseInt(typed, 10) - 1, 0); typed = ''; return; }
    typed = '';
    switch (key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'n': e.preventDefault(); state.overview ? go(state.i + 1, 0) : next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': e.preventDefault(); state.overview ? go(state.i - 1, 0) : prev(); break;
      case 'Home': go(0, 0); break;
      case 'End': go(slides.length - 1, Infinity); break;
      case 'o': case 'O': overview(); break;
      case 'Escape': if (state.overview) overview(false); else overview(true); break;
      case 'f': case 'F': (doc.fullscreenElement ? doc.exitFullscreen() : root.requestFullscreen?.())?.catch?.(() => {}); break;
      case 'b': case 'B': case '.': body.classList.toggle('is-black'); break;
      case 's': case 'S': speakerOpen(); break;
      case 'p': case 'P': togglePlay(); break;
      case 'c': case 'C': toggleCaptions(); break;
      case '?': help.classList.toggle('is-open'); break;
      default: return;
    }
    wake();
  });
  chromeEl.querySelector('.prev').onclick = prev;
  chromeEl.querySelector('.next').onclick = next;
  chromeEl.querySelector('.ov').onclick = () => overview();
  chromeEl.querySelector('.fs').onclick = () => (doc.fullscreenElement ? doc.exitFullscreen() : root.requestFullscreen?.());
  chromeEl.querySelector('.help').onclick = () => help.classList.toggle('is-open');
  // touch: horizontal swipe
  let tx = null, ty = null;
  addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', e => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? next() : prev());
  }, { passive: true });
  // wheel / trackpad: one step per gesture
  let wheelLock = 0;
  addEventListener('wheel', e => {
    if (state.overview) return;
    const now = Date.now(); if (now < wheelLock || Math.abs(e.deltaY) < 30) return;
    wheelLock = now + 700; e.deltaY > 0 ? next() : prev();
  }, { passive: true });

  /* ----------------------------------------------------- listen-along */
  const segs = (DATA.transcript || []).map(s => (Array.isArray(s) ? { start: s[0], end: s[1], text: s[2] } : s));
  let audio = null, cues = [], audioReady = Promise.resolve();
  function buildCues() {
    cues = [];
    slides.forEach((s, i) => {
      if (!s._steps) collectSteps(s);
      if (s.dataset.cue !== undefined && s.dataset.cue !== '' && s.dataset.cue !== 'none') cues.push({ t: parseFloat(s.dataset.cue), i, k: 0 });
      s.querySelectorAll('[data-cue]').forEach(el => {
        const st = parseFloat(el.dataset.step || el.dataset.sketchStep || 0);
        const k = s._steps.indexOf(st) + 1;
        if (k > 0 && el.dataset.cue !== 'none') cues.push({ t: parseFloat(el.dataset.cue), i, k });
      });
    });
    cues.sort((a, b) => a.t - b.t || a.i - b.i || a.k - b.k);
    for (let j = 1; j < cues.length; j++) {
      const a = cues[j - 1], b = cues[j];
      if (b.i < a.i || (b.i === a.i && b.k < a.k)) console.warn('cue order goes backwards', a, b);
    }
  }
  function cueAt(t) { let c = null; for (const q of cues) { if (q.t <= t + 0.05) c = q; else break; } return c; }
  function cueFor(i, k) {
    let best = null;
    for (const q of cues) if (q.i === i && q.k <= k && (!best || q.k >= best.k)) best = q;
    return best;
  }
  const playBtn = chromeEl.querySelector('.play'), timeEl = chromeEl.querySelector('.time'), scrub = chromeEl.querySelector('.scrub'), capEl = chromeEl.querySelector('.deck-caption');
  const fmtT = t => { t = Math.max(0, Math.floor(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function setupAudio() {
    const a = DATA.audio;
    if (!a || !(a.src || a.embedded)) return;
    audio = new Audio();
    audio.preload = 'metadata';
    if (a.embedded) {
      // Decode after first paint with the browser's own base64 decoder (fetch of a data: URL).
      const el = doc.getElementById('deck-audio');
      audioReady = new Promise(res => setTimeout(res, 300))
        .then(() => fetch(`data:${a.type || 'audio/mpeg'};base64,${el.textContent.trim()}`))
        .then(r => r.blob()).then(b => { audio.src = URL.createObjectURL(b); el.textContent = ''; })
        .catch(e => console.error('audio decode failed', e));
    } else { audio.src = a.src; audioReady = Promise.resolve(); }
    body.classList.add('has-audio');
    buildCues();
    const dur = () => audio.duration || DATA.duration || 1;
    const marks = () => { scrub.querySelectorAll('.mark').forEach(m => m.remove()); cues.filter(c => c.k === 0).forEach(c => { const m = doc.createElement('i'); m.className = 'mark'; m.style.left = `${100 * c.t / dur()}%`; scrub.appendChild(m); }); };
    audio.addEventListener('loadedmetadata', marks); marks();
    audio.addEventListener('play', () => { body.classList.add('is-playing'); playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Pause'); tick(); });
    audio.addEventListener('pause', () => { body.classList.remove('is-playing'); playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Play'); });
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onTime);
    playBtn.onclick = togglePlay;
    chromeEl.querySelector('.cc').onclick = toggleCaptions;
    const rates = [1, 1.25, 1.5, 0.75]; let ri = 0;
    chromeEl.querySelector('.rate').onclick = e => { ri = (ri + 1) % rates.length; audio.playbackRate = rates[ri]; e.currentTarget.textContent = rates[ri] + '×'; };
    scrub.onclick = e => { const r = scrub.getBoundingClientRect(); audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * dur(); onTime(true); };
    if (localStorage.getItem('deck-captions') === '1') body.classList.add('captions-on');
  }
  function tick() { if (!audio || audio.paused) return; onTime(); requestAnimationFrame(tick); }
  let lastCap = -1;
  function onTime(seek) {
    const t = audio.currentTime;
    root.style.setProperty('--t', String(t / (audio.duration || DATA.duration || 1)));
    scrub.style.setProperty('--t', String(t / (audio.duration || DATA.duration || 1)));
    timeEl.textContent = `${fmtT(t)} / ${fmtT(audio.duration || DATA.duration || 0)}`;
    if (!audio.paused || seek === true || (seek && seek.type === 'seeked')) {
      const c = cueAt(t);
      if (c && (c.i !== state.i || c.k !== state.k)) {
        const jump = !(c.i === state.i && c.k === state.k + 1) && !(c.i === state.i + 1 && c.k === 0);
        go(c.i, c.k, { fromAudio: true, instant: jump && c.i === state.i });
      }
    }
    let ci = -1; for (let j = 0; j < segs.length; j++) { if (segs[j].start <= t + 0.1) ci = j; else break; }
    if (ci !== lastCap) { lastCap = ci; capEl.textContent = ci >= 0 && t <= segs[ci].end + 1.5 ? segs[ci].text : ''; }
  }
  function audioFollow() {
    if (!audio || audio.paused) return;
    const c = cueFor(state.i, state.k);
    if (!c) { audio.pause(); say('This slide is a summary; listening paused'); return; }
    const cur = cueAt(audio.currentTime);
    if (!cur || cur.i !== c.i || cur.k !== c.k) audio.currentTime = c.t;
  }
  function togglePlay() {
    if (!audio) { say('No audio in this deck'); return; }
    if (audio.paused) {
      audioReady.then(() => {
        const c = cueFor(state.i, state.k);
        const cur = cueAt(audio.currentTime);
        if (c && (!cur || cur.i !== state.i)) audio.currentTime = c.t;
        audio.play().catch(err => say('Audio could not start: ' + err.message));
      });
    } else audio.pause();
  }
  function toggleCaptions() {
    body.classList.toggle('captions-on');
    const on = body.classList.contains('captions-on');
    localStorage.setItem('deck-captions', on ? '1' : '0');
    say(on ? 'Captions on' : 'Captions off');
  }

  /* ------------------------------------------------------- speaker view */
  let spk = null;
  const noteOf = s => s.querySelector('.notes')?.innerHTML || '<em>No notes.</em>';
  function excerpt(i) {
    const c = cues.filter(q => q.i === i);
    if (!c.length || !segs.length) return '';
    const t0 = c[0].t, nextCue = cues.find(q => q.i > i), t1 = nextCue ? nextCue.t : Infinity;
    return segs.filter(sg => sg.end > t0 + 0.2 && sg.start < t1 - 0.2).map(sg => sg.text).join(' '); // by overlap with the slide's span
  }
  function speakerOpen() {
    if (spk && !spk.closed) { spk.focus(); return; }
    spk = open('', 'deck-speaker', 'width=1280,height=800');
    if (!spk) { say('Allow pop-ups to open the speaker view'); return; }
    const styles = [...doc.querySelectorAll('style')].map(s => s.outerHTML).join('\n');
    spk.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Speaker view</title>${styles}
      <style>
        html,body{height:auto;overflow:auto;background:#141417;color:#eee;font:16px/1.5 system-ui,-apple-system,sans-serif}
        .sv{display:grid;grid-template-columns:3fr 2fr;grid-template-rows:auto 1fr;gap:18px;padding:18px;height:100vh}
        .sv .pane{position:relative;background:#000;border-radius:8px;overflow:hidden;aspect-ratio:16/9}
        .sv .pane .slide{display:block;position:absolute;left:0;top:0;transform-origin:0 0}
        .sv .pane .slide [data-step]{opacity:1;transform:none}
        .sv .side{display:flex;flex-direction:column;gap:12px}
        .sv .meta{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-size:22px}
        .sv .notes-box{grid-column:1/3;background:#1d1d22;border-radius:8px;padding:16px 20px;overflow:auto;font-size:20px;line-height:1.5}
        .sv .notes-box .said{margin-top:14px;padding-top:12px;border-top:1px solid #333;color:#aaa;font-size:16px}
        .sv h3{margin:0;font-size:13px;font-weight:600;color:#888;letter-spacing:.02em}
      </style></head><body>
      <div class="sv"><div><h3>Current</h3><div class="pane" id="cur"></div></div>
      <div class="side"><h3>Next</h3><div class="pane" id="nxt"></div><div class="meta"><span id="pos"></span><span id="clock"></span><span id="timer">0:00</span></div></div>
      <div class="notes-box" id="notes"></div></div></body></html>`);
    spk.document.close();
    const t0 = Date.now();
    spk.setInterval(() => {
      const d = spk.document; if (!d.getElementById('timer')) return;
      d.getElementById('timer').textContent = fmtT((Date.now() - t0) / 1000);
      d.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, 1000);
    spk.addEventListener('keydown', e => { if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) next(); if (['ArrowLeft', 'PageUp'].includes(e.key)) prev(); });
    speakerPost();
  }
  function paneSlide(pane, s, built) {
    pane.innerHTML = '';
    if (!s) return;
    const c = s.cloneNode(true);
    c.classList.add('is-active');
    if (!built) c.querySelectorAll('[data-step]').forEach(el => { if (!el.classList.contains('is-in')) el.style.opacity = '.18'; });
    pane.appendChild(c);
    const sc = pane.clientWidth / W; c.style.transform = `scale(${sc})`;
  }
  function speakerPost() {
    if (!spk || spk.closed) return;
    const d = spk.document; const cur = d.getElementById('cur'); if (!cur) return;
    paneSlide(cur, slides[state.i], false);
    paneSlide(d.getElementById('nxt'), slides[state.i + 1], true);
    d.getElementById('pos').textContent = `Slide ${state.i + 1}/${slides.length} · step ${state.k}/${slides[state.i]._steps.length}`;
    const ex = excerpt(state.i);
    d.getElementById('notes').innerHTML = noteOf(slides[state.i]) + (ex ? `<div class="said"><b>In the recording:</b> ${ex.replace(/</g, '&lt;')}</div>` : '');
  }

  /* -------------------------------------------------------------- print */
  addEventListener('beforeprint', () => {
    slides.forEach(s => { if (!s._prepared) { s.classList.add('is-active'); prepare(s); s.classList.remove('is-active'); } applyState(s, s._steps.length, false); });
  });

  /* --------------------------------------------------------------- boot */
  async function boot() {
    if (reduced()) root.classList.add('reduce-motion');
    reduceMQ.addEventListener?.('change', () => root.classList.toggle('reduce-motion', reduced()));
    decorate();
    // Slides are display:none at boot, so fonts.ready resolves before any face is used: load them all.
    try { await Promise.race([Promise.all([...doc.fonts].map(f => f.load().catch(() => {}))), new Promise(r => setTimeout(r, 3000))]); } catch {}
    slides.forEach(collectSteps);
    setupAudio();
    if (!cues.length) buildCues();
    const h = readHash();
    const [i, k] = h || [0, 0];
    state.i = clamp(i, 0, slides.length - 1);
    slides.forEach(s => s.classList.remove('is-active'));
    go(state.i, k, { instant: true, force: true, noTransition: true });
    state.ready = true;
    root.classList.add('deck-ready');
    wake();
  }

  window.deck = {
    get state() { return { i: state.i, k: state.k, overview: state.overview, ready: state.ready }; },
    get slides() { return slides; },
    steps: i => { const s = slides[i]; if (!s._prepared) { s.classList.add('is-active'); prepare(s); if (i !== state.i) s.classList.remove('is-active'); } return s._steps.length; },
    go, next, prev, overview,
    get cues() { return cues; },
    get audio() { return audio; },
    get audioReady() { return audioReady; },
    data: DATA,
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
