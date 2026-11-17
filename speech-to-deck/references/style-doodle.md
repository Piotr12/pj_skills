# Style: doodle

The talk drawn while it is told. A marker draws simple line art and writes a few words on white paper, stroke by stroke, in step with the speaker. The picture carries the idea; words only name things. It is made for listen-along and for the exported video; presented by hand, each step is drawn in about three seconds.

How it differs from whiteboard: whiteboard is a board of handwriting and diagrams that are revealed; doodle is a drawing that is made. Nothing appears, slides or fades in. Everything is drawn or written by one pen, in order.

## Identity

- **Paper**: plain white, no frame, nothing printed on it.
- **Line**: black, 4 px, one steady pass with a slight hand wobble. Colour carries meaning, never decoration: blue (structure, a second actor), red (the point, danger, rejection), green (good, chosen, growth), orange (warning), yellow (highlighter and hatched fills). At most three colours on a page, black included.
- **Type**: Kalam (handwriting). Page title 60 px bold on one line. Labels `.lbl-s` 32, `.lbl` 40, `.lbl-l` 52; big words `.mk` 72, `.mk-xl` 128. Nothing under 28 px.
- **The pen**: in the browser a marker follows the tip of every stroke and every written line, wearing the colour it draws in. The engine draws it; you do not. The exported video never shows it: there the line simply appears as it is drawn.

## The page

Every page is a board: one drawing with handwriting placed on it. A short title is optional.

```html
<section class="slide" data-title="The big launch" data-cue="4.09">
  <header class="slide-head"><h2 class="title">One big launch a year</h2></header>
  <div class="slide-body">
    <div class="board">                                    <!-- 1700 x 800 px -->
      <svg class="sketch" viewBox="0 0 1700 800">
        <g data-icon="tabler:rocket" data-x="120" data-y="140" data-size="360"/>
        <g data-icon="lucide:calendar-days" data-x="700" data-y="170" data-size="250" class="blue" data-step="1" data-cue="7.42"/>
      </svg>
      <p class="at c lbl" style="--x: 300px; --y: 560px; --w: 420px">one big rocket</p>
      <p class="at c lbl blue" style="--x: 825px; --y: 480px; --w: 420px" data-step="1">months of building</p>
    </div>
  </div>
  <aside class="notes">Recording 0:04–0:14.</aside>
</section>
```

- With a title the board is **1700 × 800**; without one use `<div class="slide-body full">` and a `viewBox="0 0 1700 940"` board (title page, close, a scene that needs the room).
- `.at` places a label by its left edge, `.at.r` by its right edge, `.at.c` by its centre (needs `--w`); coordinates are board pixels, the same as the drawing's `viewBox`.
- Sources go in the notes. No tracker, no section dividers.

## What you draw with

1. **Icons** for objects and metaphors: about 7,400 stroke icons, redrawn by hand and drawn on.
   `python3 SKILL_DIR/scripts/icons.py find rocket` lists matches with their number of shapes; then
   `<g data-icon="tabler:rocket" data-x="120" data-y="140" data-size="360"/>` (top-left corner and size in board pixels; `data-flip` mirrors, `data-rotate="15"` turns; a colour class on the `<g>`).
   Take the simplest icon that reads (few shapes draw faster and look more like a hand made them). Size 160–400 px: smaller than 160 is a pictogram, not a drawing. An icon's shapes are drawn longest first, so its outline comes before its details.
2. **Figures** for people: `<g data-figure="point" data-face="smile" data-x="900" data-y="200" data-size="400"/>`. The box is `size/2` wide and `size` tall, placed by its top-left corner; arms may reach outside it.
   Poses: `stand`, `wave`, `point`, `present`, `cheer`, `think`, `shrug`, `hips`, `walk`, `run`, `sit`, `carry`. Faces: `smile` (default), `happy`, `neutral`, `sad`, `surprised`, `none`. Figures face and gesture to the right; `data-flip` turns them round. Figures are anonymous: a person, a team, a customer, never a likeness.
3. **Plain shapes and paths** for everything else: boxes, circles, ground lines, arrows, speech bubbles, a sun, a hill, a graph line. Colour classes `blue red green orange muted`, weights `thin` and `thick`, `fill="#FFE14A"` for a hatched fill.
4. **Handwriting**: `.at` labels on the board; the pen writes them left to right, line by line.
5. **Marks** on words: `data-sketch` (underline, circle, strike, cross, highlight, arrow between elements), drawn after the words they mark. A ring (`circle`) is larger than the words it rings and touches none of them: ring one to three words, best as a label of their own, and leave clear paper around them (about half the phrase's height above and below, a letter's width at each side), because the ring reaches past the phrase and must not touch the words next to it or the line above. QA flags a ring that runs through text.
6. **Charts** (`figure.chart`) only when the speaker gives comparable numbers; they are drawn as hatched sketches.

## Planning a page

Plan the scene before writing markup, in `outline.md`: what is drawn, in which order, on which words.

- **Find the picture for each point.** First choice: the speaker's own image or metaphor. Second: the thing they name (a factory, a letter, a clock). Third: who does what to whom (figure, arrow, object). If a point has no picture, write its key phrase large and mark it. Never draw something that adds a claim the speaker did not make.
- **One scene per page, three to six drawn elements.** A new page when the subject changes, roughly every 40–60 s.
- **Drawing order is document order.** Shapes are drawn in the order they appear in the SVG, then the labels in the order they appear after it; put a label before the `<svg>` to write it first. Order it the way a person would explain it: the setting, the main subject, what changes, the result. Structure before detail, a drawing before its label, a mark after its words.
- **One step per spoken point.** A step is usually one drawn element plus its label, cued (`data-cue`) on the word that names it. A `data-step` on an icon, figure or `<g>` draws everything inside at that step.
- **Reserve the space.** Steps keep their place while hidden, so lay out the finished page and then assign steps. Read sequences left to right; leave about a third of the paper empty.
- **Two ideas on one page** sit as two islands with clear paper between them, drawn in the order they are spoken.

## Pacing: the pen and the speaker

The pen has a natural pace (about 1,000 px of line per second; 55 ms per letter at label size, more for big letters: a 60 px title takes about 1.2 times as long, a 128 px word 1.8 times). In listen-along and in the video it spends about 70 % of the time until the next cue on drawing, slowing down to half pace or speeding up to at most 3.3 times; then the page rests until the next point.

- Rules of thumb at natural pace: an icon at 250 px takes 1.5–3 s (a robot face or a brain is at the top of that range), a figure 1.5 s, a 20-letter label about 1 s, a 25-letter page title 1.7 s, an arrow half a second.
- **Cue a step on the word that names it, and split a step when its label would trail its word by more than 2 s.** Shapes are drawn before labels within a step, so a step with a big icon and a label writes the label last: give the icon its own step, or cue the step up to half a second early.
- Give each step **between half and all of its passage** in natural drawing time. A 6 s passage carries an icon and a label; it does not carry three icons.
- **If the drawing looks rushed, draw less.** QA lists every step's drawing time against the time available (`qa/report.md`, section Pen) and flags steps above 2.4 times the natural pace, steps that cannot finish before the next cue, and pages left idle for more than 20 s.
- **Start empty.** What is on the page from the start (no `data-step`) is drawn on entry, while the speaker sets the subject up: the title and the first element, not the finished scene.
- Something should be drawn at least every 15–20 s of speech.

## Drawing with paths

When no icon fits, draw it yourself from a few strokes.

- **Plan parts and order first** ("ground, trunk, crown, three apples"), then plot. Start with the most important part.
- **Open, single strokes in the order a hand draws them.** One `<path>` per stroke. Split a long outline into two or three short curves.
- Coordinates on a coarse grid (multiples of 10); two to four points per stroke are enough. Curves with `Q` or `C`; the engine adds the wobble.
- An arrow is two strokes: the shaft, then the head.
  `<path d="M520 380 C 640 330, 760 330, 880 380"/><path d="M842 346 L882 380 L836 400"/>`
- A speech bubble is one closed stroke with a tail:
  `<path d="M1100 100 h360 q20 0 20 20 v110 q0 20 -20 20 h-250 l-50 50 l8 -50 h-68 q-20 0 -20 -20 v-110 q0 -20 20 -20 z"/>`
- A ground line anchors figures and objects: `<path d="M80 720 C 500 708, 1100 730, 1620 716" class="muted"/>`.
- **The pen cannot draw**: dashed lines (the draw-on uses the dash pattern), `<use>`, images, markers, gradients, filters, or a scaled `<g>` (the wobble and the line width scale with it). `build.py` warns about these. Text is never drawn as paths; write it as a label.
- Look at the QA shots of every drawn page. A drawing that does not read at a glance is replaced by a simpler one or by an icon.
- An ellipse or a box you draw yourself round a label follows the same rule as a ring: larger than the text, with clear paper between the line and the letters on every side. For a label of `w × h` px, an ellipse needs at least `rx = 0.75 w`, `ry = 1.1 h` around the label's centre.

## Density

5–30 words on a page, title included. Labels are one to five words. No bullets, no sentences: if it needs a sentence, the speaker is already saying it.

## Motion

Page change: the old page fades, a clean one arrives, the pen starts (about 0.4 s). Then one sequence per step: strokes at a steady speed, the pen lifting between them, fills hatched in after their outline, labels written at their turn, marks last. There is no other animation: no count-ups, no fades, no morphs. With reduced motion, in print and in the overview every page shows its finished drawing.

## Video

The listen-along as an MP4, with the recording as its sound track:

```bash
SKILL_DIR/scripts/export.sh OUT/deck.html            # writes OUT/deck.mp4; add --captions for burnt-in captions
```

Slides with `data-cue="none"` are not in the video, so a doodle deck has no uncued pages. The video shows neither the pen nor page numbers, and page changes are cuts. Its sound is the original recording when `deck.json` next to the deck still points at it, else the copy embedded in the deck.

## Avoid

- Pages of words: a doodle page without a drawing is a whiteboard page.
- Decoration: an icon that stands for nothing the speaker said; rows of icons as a list.
- Logos, brand marks, flags as shorthand for a company or a country the speaker did not name.
- Dense icons (more than about eight shapes) and big drawings on short passages.
- Everything on entry: a finished scene that the speaker then talks through.
- More than three colours on a page; colour without a meaning.
- A ring, ellipse or box that cuts through the words it surrounds, or through their neighbours.
- Sticky notes, photos, count-ups, morphs: they cannot be drawn.
