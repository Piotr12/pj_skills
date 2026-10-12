# Style: consulting (default)

The deck a top-tier strategy firm would hand a board: every slide argues one conclusion, the title states it, the body proves it, a source line keeps it honest. Calm, exact, dense where the content is dense, never decorated.

## Identity

- **Page**: white, generous margins (112 px), one hairline under the title. Cover, section and closing slides (and the blank slide after the close) are deep navy.
- **Type**: Source Serif 4 semibold for titles, big numbers and quotes; IBM Plex Sans for everything else. Title 54 px, body 28 px, labels 22–25 px, sources 17 px. Nothing under 16 px.
- **Colour**: navy ink `#0E2235`, slate body `#2B3A4A`, muted `#687584`, hairlines `#D3DAE2`, **one cobalt accent `#1F5BD8`** for the thing to look at, teal `#0F8A7E` for a positive second series, burnt orange `#B8461B` for risk or a gap, pale cobalt `#EEF3FB` behind the so-what box. Accent on at most one or two elements per slide.
- **Signature devices**: the action title; the section tracker at top right (built from `data-section`); the "So what" callout; "Source:" line bottom left; page number bottom right; navy chevrons for processes; neutral-grey charts with one highlighted bar.

## Structure of a deck

1. Cover (`data-layout="title"`): title, plain-language subtitle, byline (speaker, venue, date).
2. Executive summary (`ol.exec`, uncued): the governing thought as the title, 3–5 numbered rows, each a bold message and one line of support. This is the most important slide; write it last.
3. Content slides grouped into 3–6 tracker sections, in the speech's order.
4. Closing (`data-layout="closing"`): the speaker's own last word or best line, as a quote.

Section dividers only for decks over about 15 slides.

## Action titles

- A full sentence stating the conclusion, not the topic. "The space budget has tripled to $5.4 billion a year, yet it is less than the nation spends on cigarettes and cigars", not "Space budget". Check the direction of every comparison against the transcript ("rising to more than 50 cents" is not "under 50 cents").
- At most two lines (about 15 words, 110 characters). QA flags three. No full stop.
- The body must prove the title; if it cannot, change the title. Every element on the slide should support the title's claim; evidence for a different point belongs on another slide.
- Tense matters: what the speaker says *will* happen is not what *has* happened. Do not upgrade expectations into results.
- Consecutive titles must not make the same point twice. Speak as the deck, not about the speaker ("The Moon is the goal because it is hard", not "Kennedy answers that…").
- Read the titles alone, in order: they must tell the whole story. Check this before building.

## Layout recipes

**Chart + takeaways** (the workhorse): `.slide-body.split-40` with the chart left (`figure.chart`, height 470–520) and a `.stack` of two or three `.stat`s or bullets right. Or `.split-60` with chart right.

**Numbers**: `.stats` with 2–4 `.stat`; vertical hairlines separate them. Put the one that matters in `.num.accent`. A `.lead` quote above when the speaker framed the numbers.

**Contrast rows**: `.contrast` with two `.h` headers, then `.no` / `.yes` pairs (one pair per step) for "not this, but this" statements; `.yes.is-key` for the decisive one.

**Key-value table**: `dl.kv` for dated or itemized facts (8 rows maximum, `is-key` on the punchline row), often in `.split-60` with a `.lead` and a `.callout` on the right.

**Compare**: `.compare` (from grey, to navy) for a rejected view versus the speaker's view; or two `dl.kv` columns headed by `.exhibit` labels for paired contrasts.

**Pillars**: three or four reasons/benefits; `h3` with a small `span.k` category above it, one or two sentences each.

**Process**: `ol.process` chevrons for a real sequence; `li.is-key` makes the destination cobalt.

**Quote slide**: action title above, `blockquote.quote` vertically centred, `cite` with the timestamp.

**Callout**: one per slide at most, at the bottom or right, starting with `.callout-title` ("So what", "Implication", "The condition", "The decision").

A slide is usually: title + one main element + optionally one callout. Three different components on one slide is too many.

**Fill the page deliberately.** The body is 640 px tall. Use `.slide-body.flow` (stacked, the closing callout pinned to the bottom) or `.slide-body.middle` (content block centred) rather than leaving 250 px of white under a top-aligned block; QA flags bodies under 60 % filled. Components size to their content; add `.fill` to `.pillars`/`.compare` only when they should stretch.

**Callouts keep their weight only if rare** and always arrive last on their slide (an aside the speaker makes mid-slide goes in the notes): at most one per slide and on fewer than half the slides. A speaker's framing line before the content is a `.lead` (or `.lead.is-quote` when verbatim), not a callout. A callout that repeats the title is cut.

**Accent**: cobalt is reserved for the key element (`.is-key`, `.accent`, a highlighted bar). Labels, kickers, bullet markers and callout titles stay in ink or grey.

## Density

40–110 words per content slide (QA flags over 110; the executive summary may reach about 150). Bullets are full thoughts with a bold lead-in, at most five per slide, one line or two. If a quote is long, cut with "…" rather than shrink.

## Charts

- Bars for comparisons, horizontal when labels are long; line only with three or more time points; donut for a share of a whole; waterfall for a build-up.
- Grey bars, cobalt for the highlighted one; values on the bars, no gridlines, no legends when labels can sit on the data.
- `.exhibit` above a chart only when there are several exhibits worth numbering; caption below says what is measured ("Space budget, indexed to January 1961").
- Never chart numbers with different units or time bases together; use `.stats`.

## Motion

Restrained and functional. The slide change fades out then in (0.18 s out, then 0.28 s in; never both titles on screen at once). Builds fade up 10 px in 0.42 s with an ease-out; chart bars grow from the axis with a 50 ms stagger; the donut sweeps. Build what the speaker reveals in sequence (the rows of an argument, a chart then its implication), not every element. One callout per slide arrives last. `data-sketch` marks are rare in this style: a clean cobalt `box` or `underline` on the single number the speaker hammers, at most once or twice a deck. No `data-morph`; at most one count-up in the whole deck, on a hero number of 10 or more.

## Avoid

- Topic titles ("Background", "Benefits"), questions as titles, titles over two lines.
- Decorative icons, gradients, shadows, rounded cards, coloured backgrounds on content slides.
- More than one accent colour doing emphasis on one slide.
- Bullets without a bold lead-in on dense slides; centred body text.
- Inventing a "framework" (2×2, pyramid) the speaker did not imply. A 2×2 needs two real axes from the content.
- Any real firm's name, logo, colour name or slogan.
