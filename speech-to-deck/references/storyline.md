# Storyline: from transcript to slide plan

The deck is not a transcript with pictures. It is the speaker's argument, distilled until each slide says one thing, in an order a listener can follow with the original audio playing.

## 1. Understand the recording

Answer these in `outline.md` before planning slides:

1. **Kind of recording**: prepared speech, lecture, pitch, interview, meeting, voice memo or brain dump. Prepared speeches already have structure: follow it. Rambling recordings need you to find it.
2. **Audience and occasion**, as far as the recording reveals them.
3. **Governing thought**: one sentence the speaker would sign, the answer to "so what?". If the recording has no single point, say so and use its two or three main threads.
4. **Key messages**: three to six supporting messages, each in one sentence, each with its time range. These become sections.
5. **Evidence**: every number, example, comparison, story and quotable line, with timestamps.
6. **Is this the whole event?** Signs of an excerpt or an edit: digital silence at the head or tail, room tone starting exactly on the first word, joins where the topic jumps with no bridge. If so, label it (cover byline "Recording excerpt, mm min ss s", summary source line) and build only from what is there.
7. **Sections of the recording** that are not the speaker's argument: introductions, thanks, logistics, Q&A, applause, other speakers. They do not get content slides, but they keep their place in the timeline (the title slide covers the introduction).

## 2. Order

- **Default: the speech's order.** Group consecutive passages into slides. This lets listen-along play straight through.
- **Synthesis slides** may sit outside that order: an executive summary after the title (consulting), a recap, a closing "what this means". Give them `data-cue="none"`; listen-along skips them.
- **Voice memos and brain dumps**: reorganize by argument (that is the value you add). Slides whose content comes from several places get `data-cue="none"` or the cue of their main passage, and cues must still increase through the deck; drop cues that would go backwards. Tell the user listen-along is partial.
- Never let cues go backwards. `build.py` and QA both check this.

## 3. Slide budget

Count only the speaker's own talking time.

| Style | Roughly | 10 min talk | 20 min talk | Words per content slide |
|---|---|---|---|---|
| consulting | 1 slide per 1.5 min, plus title, summary, close | 8–10 | 13–16 | 40–110 |
| whiteboard | 1 slide per 1.5–2 min | 7–9 | 11–14 | 10–45 |
| minimal | 1 slide per 40–60 s | 12–16 | 20–28 | 1–20 |

Think in **beats** (slides plus build steps), roughly one per spoken point. Minimal may give a short prepared speech of short sentences one slide per sentence; consulting folds several beats into one slide with builds. The budget is a guide, not a cap: a dense speech may run about 30 % over, and review may split a crowded slide. Very short recordings (under 3 min) still get at least a title, three to five content slides and a close. An explicit request for a slide count wins.

## 4. Slide types (pick per slide, vary them)

- **Title**: title, a subtitle that states the topic plainly, speaker / venue / date if known. Cue 0.
- **Executive summary** (consulting): the governing thought and key messages as numbered rows. Uncued.
- **Statement**: one sentence or phrase, large (minimal) or the action title alone with a single supporting element.
- **Quote**: the best line in the speaker's words, attributed, with its timestamp. One or two per deck; three at most for a speech famous for its lines.
- **Numbers**: one to four stated figures, each with a label that says what it counts.
- **Chart**: only when the speaker gives comparable numbers. Bar for comparisons, line for change over time with three or more points, donut for parts of a whole, waterfall for a build-up. Two numbers are better as a compare or stat layout than as a chart.
- **Compare**: before/after, them/us, option A/B, rejected/chosen.
- **Sequence**: process, timeline, steps. Only for content that really is a sequence.
- **Pillars / list**: three or four parallel ideas.
- **Diagram** (whiteboard especially): boxes and arrows, cause and effect, cycles, a map of the argument.
- **Section divider**: only for decks over about 15 slides, or the consulting tracker does the job.
- **Close**: the speaker's own ending, often a quote. Not "Thank you" or "Questions?".
- **Credits** (only when the deck uses photos): one blank slide after the close, then a credits slide in fine print (`references/authoring.md`, Images). Uncued, and outside the slide budget.

## 5. Writing

- **Titles by style.** Consulting: an action title, a full sentence stating the slide's conclusion, at most 2 lines (about 15 words), no full stop. Minimal: a few words. Whiteboard: a short spoken-style phrase, like what you would write at the top of the board.
- Use the speaker's vocabulary. Their best phrases belong in the deck verbatim, in quotation marks.
- Plain words, active voice, sentence case. No filler labels ("Overview", "Key insights", "Introduction").
- Numbers: write them as the speaker meant them ("$5.4 billion", "from 40 cents to more than 50 cents per person per week"), units always visible, direction of change exactly as said.
- Read each quote you use against the audio's transcript **and** for sense: a line that does not parse ("and one we enjoy. We intend to win") is often a transcription split. Re-transcribe that passage alone with `scripts/transcribe.py INPUT --clip START SECONDS` (two or three passes; accept words the passes agree on) before quoting it, and log the correction. Word timestamps inside a segment are approximate; for cues, prefer segment starts and audible pauses.
- Speaker notes (`<aside class="notes">`): what the slide is for, context the slide leaves out, and anything you corrected. The speaker view also shows the transcript excerpt automatically.

## 6. Cue mapping (listen-along)

- Each slide that covers a passage gets `data-cue` = the start (seconds) of its first segment. Take times from `transcript.json`, not the rounded `[mm:ss]`.
- Each build step tied to a moment gets its own `data-cue` on the element carrying `data-step`: the start of the segment where the speaker says it. A step without a cue is revealed only by manual navigation; avoid that on cued slides.
- Within a slide, step cues increase with the step number. Across slides, slide cues increase with slide order.
- Leave the first content slide's cue at the start of the substance (after thanks and greetings); the title slide (cue 0) covers the opening.
- **Cue a slide where its subject starts**, not where the previous thought ends. If the speaker is still finishing the previous point, the previous slide's last step must stay up for at least 4 s; move the next slide's cue to the first sentence of the new subject.
- **Never leave the body empty on arrival.** If the speaker sets something up before the first point (a question, a story, "condense, if you will…"), that set-up is visible on entry (no `data-step`). An empty body with only a title for more than about 8 s is a defect (QA major); 4–8 s is acceptable when showing the element earlier would reveal it before it is said (QA minor).
- **Never reveal a line before it is said.** This beats "avoid trivial reveals": when the two conflict, keep the step and its cue.
- **Set-up and payoff**: the slide arrives at the start of the sentence with its set-up visible (a grey `.setup`/`.lead` line, the question, the frame); the payoff appears as a step cued on the word that carries it ("…a date which will live in **infamy**"). Step cues go on the carrying word, not on the start of its segment: find it with `transcribe.py INPUT --pauses START SECONDS`.
- **A step cue equal to its slide cue is a wasted click**: show that element on entry instead.
- **Keep it moving**: in listen-along, something should change at least every 60–90 s. If a passage runs longer, it is either a second slide or it has a point worth revealing (the line that proves the title).
- **One step per spoken point.** Do not group two bullets into one step when the speaker says them 20 s apart; and do not reveal a line before it is said.
- **Check every cue against `transcript.json`** (start of the segment containing the words); an interpolated time inside a long segment is fine, a cue 5 s early is not.
- Applause, a host or a second speaker at the end: no slide needed; the closing slide simply stays up.

## 7. The outline file

```markdown
# Outline: <title>
Recording: <file>, <duration>, language <xx>. Main speaker: <name or "unknown">.
Governing thought: <one sentence>
Sections: 1 <name> (mm:ss–mm:ss) · 2 … 
Transcript corrections: "TIRAS" → "TIROS" (12:28); …
Not covered: introduction by host (0:00–0:25), benediction (19:22–end).

| # | cue | layout | title | content (and steps with cues) | source range |
|---|-----|--------|-------|-------------------------------|--------------|
```
