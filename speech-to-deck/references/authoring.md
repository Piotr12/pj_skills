# Authoring reference: the deck HTML contract

You write two files; `scripts/build.py` turns them into one self-contained `deck.html` (fonts, engine, theme, transcript and audio inlined). Never edit `deck.html` by hand.

## deck.json

```json
{
  "title": "We choose to go to the Moon",
  "subtitle": "Address on the nation's space effort",
  "speaker": "John F. Kennedy", "date": "12 September 1962", "venue": "Rice University, Houston",
  "lang": "en",
  "style": "consulting",
  "transcript": "transcript.json",
  "audio": "../recordings/rice.mp3",
  "audio_mode": "embed"
}
```

Paths are relative to the folder holding `deck.json`. `audio_mode`: `embed` (default), `file`, `none`. `"smart_quotes": false` turns off automatic typographic quotes (on by default; they follow `lang`: “…” for English, „…” for Polish and so on, so type plain `"` and `'`).

## slides.html

An optional `<style>` block first (deck-specific CSS, scope it to classes you add), then one `<section class="slide">` per slide. No `<html>`, `<head>`, `<body>` or `<script>` (except chart data, below).

```html
<style>
  .s-costs .chart { height: 470px; }      /* tweak only what the theme lacks */
</style>

<section class="slide" data-title="What it costs" data-section="Cost" data-cue="894">
  <header class="slide-head">
    <h2 class="title">The space budget has tripled to $5.4 billion a year, yet it is less than the nation spends on tobacco</h2>
  </header>
  <div class="slide-body">
    … layout and content …
  </div>
  <footer class="slide-foot"><p class="source">J. F. Kennedy, Rice University address, recording 14:54–15:58</p></footer>
  <aside class="notes">What the speaker is doing here; corrections; context the slide leaves out.</aside>
</section>
```

### The canvas

Every slide is a fixed **1920 × 1080 px** canvas, scaled to fit any screen. Design in those pixels. The theme sets padding and type sizes; `.slide-body` is the content area (consulting about 1696 × 640 below the title, whiteboard about 1660 × 700, minimal centred in 1600 × 840). Content must fit without scrolling; QA flags overflow, overlap and text off the canvas.

### Slide attributes

| Attribute | Meaning |
|---|---|
| `data-title` | Short name for the overview, speaker view and QA. Always set it. |
| `data-section` | Section name. In consulting it builds the tracker at top right (use 3–6 short section names). |
| `data-layout` | `title`, `section`, `closing` switch to the theme's cover treatment in consulting (navy); in minimal and whiteboard the default centred stage already serves. `quote` centres the body (consulting); `summary` relaxes the word budget; `content` pins the head to the top (minimal). `blank` and `credits` end a deck that uses photos (see Images). |
| `data-cue` | Seconds into the recording where this slide's passage starts; `none` for synthesis slides. |
| `data-tone` | Minimal only: `light` (white stage) or `black` (flat black). |
| `data-tracker="off"`, `data-number="off"` | Hide the tracker or page number on one slide. |

### Builds (step-by-step reveals)

- `data-step="1"`, `"2"`, … on any element: hidden until that step. Several elements may share a step. Steps can be nested (a list revealed at step 2 with its key item at step 3).
- `data-cue="seconds"` on the same element: listen-along reveals the step when the speaker reaches it.
- `data-step-out="3"`: the element disappears at step 3 (replace one thing with another; place both in the same grid cell).
- Elements without `data-step` are visible as soon as the slide appears.
- The active slide carries `data-k` = the current step, a CSS hook for effects that depend on progress (`.slide[data-k="3"] .setup { color: var(--muted) }`).
- Print and the overview show every slide in its final state (replaced elements stay replaced).
- Hidden steps keep their space (no layout jump when they appear). A box whose rows build one by one therefore shows its empty remainder until the last row arrives; size such boxes to their content or build the whole box at once.
- Builds should mirror the speech: reveal a point when it is spoken. Do not build every slide by default; a quote or a statement often lands best with no build.

### Emphasis and hand-drawn marks: `data-sketch`

Draws an annotation around, under or through an element when it appears. Works in every style; whiteboard draws rough marker strokes, the others draw clean strokes.

```html
<span data-sketch="underline">the hardest</span>
<span data-sketch="circle" data-sketch-color="red" data-sketch-step="2">$5.4 billion</span>
<li data-sketch="strike" data-step="3">Stay where we are</li>
<b data-sketch="highlight">not because they are easy</b>
<div id="cause" class="sticky">…</div><div class="sticky" data-sketch="arrow" data-to="#cause" data-curve="0.25">…</div>
```

- Types: `underline`, `double-underline`, `strike` (line through), `cross` (an X over a block: rejected), `box`, `circle` (ellipse around), `highlight` (marker behind text), `bracket-left`, `bracket-right`, `tick`, `arrow` (from this element to the `data-to` selector, curved by `data-curve`, default 0.18, negative bends the other way). Several types: `data-sketch="underline circle"`.
- `data-sketch-step="n"` draws at step n; otherwise it draws with the element's `data-step`, or on entry. An element with only `data-sketch-step` may carry its own `data-cue`, so a mark can land on the exact words (underline "military-industrial complex" as it is said).
- `data-sketch-color`: a marker name (`red`, `blue`, `green`, `orange`, `black`, `highlight`) or any CSS colour. `data-sketch-width`, `data-sketch-pad` (px) fine-tune.
- Inline elements that wrap get one underline/highlight per line.
- A mark inside a stepped element draws with that element's step; give it `data-sketch-step` only to draw it later (on its own words, with its own `data-cue`).
- Marks sit on the glyphs (baseline and cap height from the font), so `data-sketch-pad` is only for fine-tuning; never compensate with large negative pads.
- Use marks for emphasis the speaker gives: what they stress, reject, connect. Two or three per slide at most.

### Freehand diagrams: `<svg class="sketch">`

Draw with plain SVG primitives in a `viewBox`; in whiteboard the engine redraws each `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` and `path` as a rough marker stroke and animates it being drawn. In other styles the SVG renders as authored (use `data-step` for reveals).

```html
<svg class="sketch" viewBox="0 0 1600 600" style="height: 600px">
  <rect x="40" y="200" width="360" height="180" class="blue"/>
  <text x="220" y="300" text-anchor="middle">Old frontier</text>
  <path d="M420 290 C 600 200, 800 200, 980 290" class="red" data-step="1" data-cue="842"/>
  <ellipse cx="1220" cy="290" rx="220" ry="120" fill="#FFE34D" data-fill-style="hachure" data-step="2"/>
  <text x="1220" y="300" text-anchor="middle" class="big" data-step="2">New frontier</text>
</svg>
```

- Colour classes `blue`, `red`, `green`, `orange` set stroke (and fill for `text`). `fill="…"` on a shape gives a sketchy fill; `data-fill-style`: `hachure` (default), `solid`, `zigzag`, `cross-hatch`, `dots`.
- Shapes without `data-step` draw themselves in document order when the slide appears (keep it under about 12 shapes); stepped shapes draw at their step.
- `data-roughness="0.6"` on a shape makes it neater; `data-clean` keeps it untouched.
- Text inside SVG: `class="small"` or `class="big"`; keep to short labels. For handwriting placed on a drawing (wrapped, written on, markable), use a board instead:

```html
<div class="board">                                  <!-- 1660 x 700 px in whiteboard -->
  <svg class="sketch" viewBox="0 0 1660 700"> … shapes … </svg>
  <p class="at lbl" style="--x: 120px; --y: 300px; --w: 280px" data-step="1">Old frontier</p>
  <p class="at c mk red lag" style="--x: 1220px; --y: 270px; --w: 400px" data-step="2">New frontier</p>
</div>
```

  `.at` places a label by its left edge, `.at.r` by its right edge, `.at.c` by its centre (needs `--w`); sizes `.lbl-s`, `.lbl`, `.lbl-l`, `.mk`, `.mk-xl`; `.lag` makes a label wait for its drawing; `.nw` stops wrapping. Shapes on a board draw in document order; reorder the SVG to change the drawing order.

### Charts: `<figure class="chart">`

Charts render from JSON as SVG in the theme's colours and animate in (bars grow, lines draw, donut segments sweep; in whiteboard they are drawn as hachured sketches). Give the figure a height (theme default 520–560 px).

```html
<figure class="chart" data-chart="bar" data-step="1" data-cue="898">
  <script type="application/json">{"labels":["January 1961","1962"],"values":[1,3],"highlight":1,"suffix":"×"}</script>
  <figcaption>Space budget, indexed to January 1961</figcaption>
</figure>
```

| `data-chart` | JSON keys |
|---|---|
| `bar` | `labels`, `values`, optional `orientation: "h"` (horizontal, best for long labels), `highlight` (index or list), `max`, `prefix`, `suffix`, `decimals`, `labelWidth`, `barWidth` (0–1) |
| `waterfall` | `labels`, `values` (signed changes), `total` (`false` to omit the total bar), `totalLabel`, `prefix`, `suffix` |
| `line` | `labels`, `series: [{"name","values"}]` (or `values`), `highlight` (series index), `min`, `max`, `prefix`, `suffix` |
| `donut` | `labels`, `values`, `highlight`, `center` (short text in the hole), `thickness` (0–1), `legend: false` when the centre text and caption already say it all |
| `dots` | `total`, `highlight` (how many of them light up), optional `columns`, `size` (0–1): a unit chart, "40 of 45" |

Highlight the one bar or slice the slide is about; everything else stays neutral. The title states what the chart shows; the caption says what is measured and in what unit.

### Moving elements between slides: `data-morph`

`data-morph="moon-number"` on an element on two consecutive slides: during the transition it glides and resizes from its old place to its new one (Magic Move). Use the same name on exactly one element per slide; a name without a partner on the neighbouring slide is ignored (and logged). Put it on a tight token, not a full-width block (the glide is between the two boxes): `<span class="morph" data-morph="cost">$5.4B</span>`. For a clean glide keep the two elements alike: same text, same number of lines, same weight and tracking, `line-height: 1` (a `span.morph` wrapper helps). Themes can style the pair with `::view-transition-group(*.morph)` and morph arrivals with `:root:active-view-transition-type(morph)` (or `:root[data-vt~="morph"]`). Best in minimal; use sparingly elsewhere.

### Numbers that count up: `data-count`

`<span class="num" data-count>240,000</span>` counts from zero when it appears (keeps prefix and suffix: `$5.4B`, `25,000 mph`). Numbers under 10 never count (0×, 1×, 2× reads as wrong data). One or two per deck at most (consulting: one), on the numbers that matter; the duration comes from the theme.

### Fitting text: `data-fit`

`data-fit` on a box with a fixed width and height shrinks its font until the content fits (`data-fit-min="40"`). A safety net for big statements, not a substitute for editing.

## Shared components

All three themes style these, each in its own way. Prefer them to custom CSS.

| Markup | Use |
|---|---|
| `h2.title`, `p.subtitle`, `p.lead` | headline, quiet subhead, larger intro sentence |
| `ul.bullets > li` (`<b>Lead-in:</b> text`) | lists; nested `ul` for sub-points (consulting) |
| `ol.exec > li > span > b + text` | executive summary rows (consulting) |
| `.stats > .stat > .num + .label (+ .note)` | one to four numbers side by side; `.num.accent` for the key one |
| `.callout > .callout-title + text` | the so-what (consulting), a takeaway (others); at most one per slide |
| `.lead.is-quote` (+ `cite`) | a verbatim framing line set in the quote face (consulting) |
| `.contrast > .h×2 + (.no + .yes)×n` | "not this, but this" rows (consulting) |
| `.slide-body.flow`, `.slide-body.middle` | stack with the last callout pinned to the bottom; centre the content block (consulting, whiteboard) |
| `blockquote.quote > p + cite` | a quotation; put the timestamp in `cite` |
| `.pillars > div > h3 (+ span.k) + p` | three or four parallel ideas |
| `ol.process > li > span.chev + p` (`li.is-key`) | a real sequence of steps |
| `ol.timeline > li > span.when + span.what` (`li.is-key`) | dated events |
| `dl.kv > dt + dd` (`.is-key`) | compact key-value rows: dates, specs, facts (consulting) |
| `.compare > .from + .arrow + .to` | before/after, rejected/chosen |
| `.matrix > .y-axis + .q×4 + .x-axis` (`.q.is-key`) | 2×2 |
| `.cols-2/3/4`, `.split-60`, `.split-40`, `.stack`, `.fill` | layout helpers; `.fill` stretches `.pillars`/`.compare` to the body height |
| `.cover > h1.title + p.subtitle + p.byline` | title slide |
| `.section-mark > span.no + h2.title + p` | section divider |
| `.sticky` (`.pink`, `.blue`, `.green`) | whiteboard sticky notes |
| `.statement` (`.medium`), `.photo-full + .scrim`, `.over-photo`, `.credit`, `.reflect` | minimal |
| `.kicker` (minimal) | a 34 px grey context line above a statement or number |
| `.compare .big.accent` (minimal) | compare numbers are silver; `.accent` marks the turning point |
| `.setup` | minimal: a 64 px grey set-up line before a statement (quieter than a statement, louder than `.lead`) |
| `.credits > h2 + ol > li` | the fine print on the credits slide (all styles; see Images) |
| `ol.ledger > li > span.when + span.what` (`li.grp` starts a group) | minimal: an enumeration read one by one (a roll call, a timetable), one `li` per step |
| `.lead.hang`, `.lead.above` | minimal: a grey line revealed under a statement without pushing it up; a grey line above a statement |
| `.exhibit` | chart label above a figure (consulting) |
| `.kicker` | small category label above a block (consulting; never above titles) |
| `.is-risk` (process, timeline), `.is-gap` (kv, contrast, stat num, bullet `b`) | the burnt-orange counterpart of `.is-key`: a gap, risk or warning (consulting) |
| `.stats.words` | a scorecard whose values are words, not numbers (consulting) |
| colour helpers | `.accent`, `.muted`; whiteboard `.blue .red .green .orange .black` |

## Images (only when the user opted in to photos)

`<img src="images/moon.jpg" alt="…">` with the file next to `slides.html`; `build.py` inlines it. Download with `curl` into `OUT/images/` and keep only public domain, CC0 or CC BY (not CC BY-SA: its share-alike terms can reach the whole deck). Record each photo's source URL, author and licence in `outline.md`. No remote URLs in the final deck.

Credit every photo twice: briefly on its slide (`<span class="credit">Photo: NASA, public domain</span>`), and in full on a credits slide that ends the deck, after one blank slide (a presenter who clicks past the close lands on an empty slide, not on fine print). One line per photo: slide number, what it shows, author, licence (with the licence URL for CC BY), source URL, and "cropped" or "edited" if you changed it. Write URLs as plain text without `https://`, not as links (`build.py` treats a remote `href` as a missing asset). Write the slide in the deck's language. Both slides are uncued, so listen-along stays on the close.

```html
<section class="slide" data-layout="blank" data-title="End" data-cue="none" data-number="off"></section>
<section class="slide" data-layout="credits" data-title="Credits" data-cue="none" data-number="off">
  <div class="credits">
    <h2>Photo credits</h2>
    <ol>
      <li>Slide 4: Saturn V on the launch pad. NASA, public domain. images.nasa.gov/details/…</li>
      <li>Slide 9: Rice Stadium from the air. Author Name, CC BY 4.0 (creativecommons.org/licenses/by/4.0), cropped. commons.wikimedia.org/wiki/File:…</li>
    </ol>
  </div>
</section>
```

## Rules that keep decks clean

- One idea per slide. If a slide needs two titles, it is two slides.
- Respect the theme's type scale; do not shrink fonts to make content fit. Cut words instead.
- Inline `style` is fine for one-off spacing (`margin-top`, a grid tweak); repeated tweaks go in the `<style>` block with a slide class (`<section class="slide s-costs">`).
- Do not add headings like "Overview", "Key takeaways", "Agenda" unless the content is exactly that.
- Number markers only for real sequences.
- No emoji, no stock icons, no clip art. Shapes, type and charts carry the visuals.
- Keyboard map (for your hand-over message): ←/→ or Space to move, `P` listen along, `C` captions, `S` speaker view, `O` overview, `F` fullscreen, `B` black screen, `?` help, number + Enter to jump; print gives one page per slide.
