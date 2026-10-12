# Style: minimal

A classic product keynote: a dark stage with a soft spotlight, one idea per slide, words so few and so large they are read in a glance, numbers in silver, slow dissolves, and elements that glide from one slide to the next. The speaker is the show; the slides are punctuation.

## Identity

- **Stage**: near-black with a soft radial spotlight from the top (`#2E3035` to black). Occasional `data-tone="light"` slides (white to light grey) for contrast at a turning point, two or three per deck at most. `data-tone="black"` for a pure black pause.
- **Type**: the system font (San Francisco on Apple devices; Inter is embedded as the fallback elsewhere). Statements 150 px bold with tight tracking (−0.035 em), titles 96 px, secondary lines 44–52 px in grey `#8E8E93`. Numbers 200–320 px bold with a silver gradient.
- **Colour**: white `#F5F5F7` and grey only, plus **one accent** (default blue `#2997FF`; change `--accent` in the deck CSS to suit the subject) used on one word or one number at a turning point. Never two accents.
- **Alignment**: centred by default; `.left` on a slide or `.slide-body` for lists and quotes that read better ragged right.

## Structure

1. Title: the topic in a few words, a quiet subtitle, the byline in grey.
2. A rhythm of statement, number, quote, pause. Every slide answers one question. Several slides in a row may share an element that moves (`data-morph`) to show continuity: a number that shrinks into a corner while its meaning appears, a word that moves up to become the title of the next point.
3. The single most quotable line gets its own slide, nearly alone.
4. Close on the speaker's last line or the one idea to remember.

No tracker, no page numbers, no sources on slides (put sources and timestamps in the notes).

## Compositions

- **Statement**: `.statement` (1–8 words). `.statement .dim` greys out the setup so the payoff stands out: `<p class="statement"><span class="dim">Not because they are easy,</span> but because they are hard.</p>`.
- **The number**: `.stat` with `.num` (use `data-count` on the hero numbers) and a `.label` of 3–8 words. `.num.accent` for the turning point.
- **Two numbers**: `.compare` with `.big` numbers and a thin arrow, or `.stats` with two.
- **List**: `.bullets` with at most three items, each a short phrase, revealed one per step; optional `small` line under each.
- **Quote**: `blockquote.quote` 84 px semibold, `cite` with name and year.
- **Chart**: the simplest possible; one highlighted bar or slice in the accent, everything else dark grey; no axes beyond a baseline.
- **Photo** (only if the user opted in): `img.photo-full` + `.scrim` + `.over-photo` text, with `.credit`. Or a product-style object with `.reflect`.

## Density

1–18 words per slide. If a slide needs more, split it into two slides with a `data-morph` link between them.

## Motion

Slow and soft, the signature of the style. Slide change: dissolve (0.55 s out, 0.7 s in, overlapping). Builds: fade in from a light blur with a barely visible scale (0.8 s, ease). Numbers count up once or twice per deck. `data-morph` is the hero: use it two to four times per deck where an element genuinely continues (same number, same word, same object). Nothing bounces, slides or spins. Cue builds to the speaker's words; often a slide has no build at all and the dissolve itself is the event.

## Avoid

- Titles plus bullets plus a picture: that is a different style.
- Gradients other than the stage spotlight and the silver numerals; glows; shadows.
- Thin grey text on dark under 32 px (contrast).
- All-caps labels, eyebrow labels above titles, icons.
- Using the accent for decoration.
