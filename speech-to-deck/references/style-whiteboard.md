# Style: whiteboard

The talk explained by a sharp person with four markers and a whiteboard: big handwriting, quick diagrams, things circled, crossed out and connected with arrows while they talk. Warm, energetic, informal, but never messy. It teaches.

## Identity

- **Board**: cool white with faint ghosting of old marker, in a thin aluminium frame. Dark wall around the board.
- **Type**: Kalam (handwriting) for everything. Title 74 px bold, body 38 px, sticky notes 34 px, notes and sources 24–28 px light. Big words and numbers 110–150 px bold.
- **Markers**: black `#1F2328` (main writing), blue `#2453C6` (structure, labels), red `#D3302C` (emphasis, the answer, rejection), green `#1E8449` (good, chosen, growth), orange `#E07A1F` (warning, secondary), highlighter yellow `#FFE34D`. Use colour like a teacher: black for content, one colour per meaning, consistent through the deck.
- **Signature devices**: hand-drawn diagrams (`svg.sketch`), annotations drawn in time with the speech (`data-sketch`: circle, underline, cross, strike, arrow, highlight), sticky notes for ideas, marker numbers circled in red.

## Structure

1. Title: the topic in big handwriting, underlined or circled (`data-sketch`), with a small doodle in `svg.sketch` that captures the subject (a moon and a rocket arc, a bridge, a graph going up: simple primitives, under 8 shapes).
2. Content slides in the speech's order, most of them a diagram or a composition, not a list.
3. A recap board near the end: the whole argument as a single map (boxes and arrows), revealed step by step. This is the whiteboard's executive summary and may be uncued.
4. Close: the speaker's last line, big, with one mark (underline or circle).

No section dividers; no tracker; page numbers are small and light.

## Compositions that work

- **Mind map / argument map**: central idea in an ellipse, three to five branches with arrows to labels. Build one branch per step.
- **Before → after**: two clusters, a big curved arrow between; the rejected one gets `data-sketch="cross"` or `strike` at the moment the speaker rejects it.
- **The number**: one big red number with `circle`, a label in black, a short note in blue. Add a second number and an arrow if the speaker compares.
- **Stickies**: three or four `.sticky` notes (yellow default; pink/blue/green for a different category) in a loose row, slapped on one per step.
- **Timeline**: a hand-drawn line (`<path>` with a slight wobble) with tick marks and handwritten dates; the key event circled.
- **Scale / comparison**: hand-drawn bars (`figure.chart` renders hachured bars in whiteboard) or boxes of different sizes.
- **Process**: boxes connected by arrows (`data-sketch="arrow" data-to="#id"` between HTML boxes, or `<path>` arrows in SVG).
- **Quote**: large handwriting, red opening quote mark from the theme, key phrase `highlight`ed when spoken.

Leave air: a third of the board empty is normal. Align loosely to a grid but let one element sit off-axis.

## Density

10–45 words per slide. Bullets are rare; when used, three items, short. Labels are two to five words. If you need sentences, it belongs in the notes.

## Drawing well

- Draw with primitives in a viewBox the size of the area (e.g. `0 0 1660 700`). Keep coordinates on a loose grid so things line up.
- Arrows: a gentle curve (`Q` or `C` path) plus the arrowhead from `data-sketch="arrow"`; or two short lines forming a head in SVG.
- Fill only to show category or emphasis (hachure fill, a few shapes per deck).
- Do not draw what text says better. A diagram must show a relationship: cause, sequence, part of, versus, more than.
- Text in SVG for labels only; keep paragraphs in HTML. For labels placed on a drawing, use `.board` with `.at` labels (see authoring.md).
- Blocks are written on left to right; inline words that may wrap fade in instead. Orange is for strokes; orange text uses the darker `--marker-orange-ink` automatically via `.orange`.

## Motion

The board is drawn live. Slide change: the old board blurs and fades (about 0.35 s), the new one appears and its unstepped shapes draw themselves in order (budget about 1.5 s). Steps: text appears as if written left to right (clip wipe, 0.7 s), stickies are slapped on (a quick overshoot), shapes and marks draw stroke by stroke. One thing per step, cued to the speech; at most about 8 steps on a slide. Marks follow the text they mark by a beat (the engine handles the delay).

## Avoid

- Neat corporate layouts in handwriting (a table of bullets in Kalam is not a whiteboard).
- More than three marker colours on one slide; rainbow colouring.
- Shapes for decoration; scribbles; clip-art doodles that need more than about 8 primitives.
- Tiny handwriting: nothing under 24 px.
- Highlighting everything. Two or three marks per slide.
