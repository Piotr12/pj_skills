# Critique: design review and motion/technical review

Automated QA catches what can be measured. The critique catches what a demanding creative director and a front-end lead would send back. Two reviewers, independent of each other and of the author, judge the built deck against the brief: the style guide, the storyline and the transcript.

## Process

1. Prerequisite: `qa/report.md` has no blockers. Run QA again after any rebuild.
2. Run both reviewers in parallel. With subagents available, give each one the prompt below (fill in the paths). Without subagents, do two separate passes yourself, design first, and look at the images in each pass; do not reuse conclusions between passes.
3. Merge the findings. Fix every blocker and major finding, and the minors that are cheap. When a fix corrects a claim (a hedge, a tense, a number), search every title, the executive summary and the notes for the same claim and correct it everywhere. A fix that contradicts the style guide or the content rules is not a fix; reject it and note why.
4. Record your merge decisions (what you fixed, what you rejected and why, deliberate trade-offs) at the top of `critique-roundN.md`, and give that file to the next round's reviewers so they do not undo deliberate choices. Rebuild, rerun QA, run the reviewers again on the new screenshots (round 2). Stop when both pass, or after round 3; anything left goes into `critique.md` as open.
5. Write `OUT/critique.md` (template at the end).

Reviewers may make scratch builds and run live browser probes (real-time playback, opacity sampling) inside `OUT/.work/`; some defects only show in real time. A major that appears after the last round only because the skill's assets changed may be closed by the author with a QA rerun and filmstrip check, and is then listed as open in `critique.md`.

Wait for both reviewers to finish before rebuilding: QA rewrites `qa/` and the reviewers read it. Each reviewer typically takes 8–20 minutes.

**Pass** = no blocker or major findings, every rubric score at least 4, none below 3.

## Evidence the reviewers get

- `qa/contact.jpg` (all slides fully built), `qa/shots/sNN-kK.jpg` (every build step), `qa/motion/sNN.jpg` (filmstrips: one row per transition or step, frames at 10, 30, 55 and 100 % of the animation), `qa/overview.jpg`, `qa/report.md` and `qa/report.json` (measured findings, animation timings, interaction checks).
- `slides.html`, `deck.json`, `outline.md`, `transcript.json`.
- `references/style-<style>.md`, `references/storyline.md`, `references/authoring.md`.

Reviewers must open the images, not only the reports.

## Rubric A: design (creative director)

Score each 1–5 (5 = would ship to a demanding client unchanged).

1. **Storyline and titles**: the titles alone, in order, tell the argument; one idea per slide; titles follow the style's rules (consulting: conclusion sentences, at most 2 lines).
2. **Hierarchy and typography**: one focal point per slide; type scale respected; no widows or orphaned single words on titles; sensible line lengths; quotes typographic.
3. **Layout and space**: elements align to a grid; margins consistent; balanced use of the canvas (no crowding, no accidental voids, no content jammed into a corner); consistent placement of recurring elements.
4. **Colour and contrast**: accent used on the one thing that matters; colour meanings consistent; everything legible.
5. **Visuals and data**: the right chart or diagram for the point; highlight on the key element; labels and units clear; diagrams show a relationship, not decoration.
6. **Style fidelity and distinctiveness**: unmistakably the requested style as described in its guide; none of its "Avoid" items; does not look like a generic template.
7. **Content integrity**: spot-check at least five quotes and every number against `transcript.json`; verbatim quotes, numbers as stated, sources or notes with time ranges, nothing from outside the recording.
8. **Rhythm across the deck**: layouts vary with purpose; pacing of dense and light slides; strong opening and close.

## Rubric B: motion and technical (front-end lead)

1. **Purpose**: every build reveals something in the order the speaker says it or the logic needs; nothing animates for decoration; the slide transition suits the style.
2. **Timing and easing**: durations inside the style's budget (see the style guide and QA flags); natural easing; staggers short; nothing sluggish, nothing so fast it flickers. Judge from the filmstrips.
3. **Choreography**: the first frames of each transition show a clean state (no flashes of final content, no layout jumps, no elements appearing then vanishing); draw-on order logical (whiteboard); morphs (minimal) connect genuinely shared elements.
4. **Listen-along sync**: spot-check at least six cues (slide and step) against `transcript.json`: each reveal happens when its words are spoken (within about 2 s). Slides change when the speech moves on. Only synthesis slides are uncued. Cues never go backwards.
5. **Build granularity**: never reveal a line before it is said (this beats "avoid trivial reveals"); no slide with more than about 8 steps; enumerations spoken one by one are built one by one; trivial reveals avoided; a statement or quote may have no build.
6. **Robustness**: QA interaction checks pass (keyboard, URL, overview, resize, reduced motion, PDF, audio); no console errors; works offline (no remote URLs); the file size is reasonable.
7. **Source hygiene**: `slides.html` uses the shared components; custom CSS is small and scoped; inline styles only for one-off spacing; no hard-coded hacks that break at another step; unique ids; valid HTML structure.

## Reviewer prompt (fill in and send to each reviewer)

```
You are the {design | motion and technical} reviewer for an HTML slide deck generated from a
recording. Be demanding and specific; you are paid to find what is wrong, not to praise.
Do not edit any files.

Deck folder: {OUT}. Style: {style}. Round {n}.
The user's brief: {brief}
Deliberate decisions by the author (do not re-flag unless they cause a defect): {decisions}
Temporary files: only in {OUT}/.work/. To check a cue or a quote against the audio:
{SKILL_DIR}/scripts/transcribe.py {recording} --clip START SECONDS
Read: {SKILL_DIR}/references/critique.md (your rubric is Rubric {A|B}),
{SKILL_DIR}/references/style-{style}.md, {SKILL_DIR}/references/authoring.md,
{OUT}/outline.md, {OUT}/qa/report.md, {OUT}/slides.html.
Look at images with your file-reading tool: {OUT}/qa/contact.jpg, then
{design: every final-step shot qa/shots/sNN-k<last>.jpg, and intermediate steps where the build matters}
{motion: every qa/motion/sNN.jpg filmstrip, and qa/report.json motion timings}.
Verify against {OUT}/transcript.json: {design: quotes and numbers} {motion: cue times}.
{Round 2+: the previous round's findings are in {OUT}/critique-round{n-1}.md; check each was fixed.}

Return exactly:
## {Design | Motion and technical} review, round {n}
Scores: <criterion> n/5; … ; verdict PASS or REVISE
Findings, most severe first, each one line:
- [blocker|major|minor] slide N (step K): what is wrong, with evidence (image name or measured
  value) → the concrete fix in terms of the markup, CSS or content
Keep: the 2–4 things that work and must not be lost in revision.
```

## critique.md template

```markdown
# Critique: <deck title> (<style>)

| Round | Design | Motion and technical | Blockers / majors fixed |
|---|---|---|---|
| 1 | 3.6 REVISE | 4.1 REVISE | 2 / 7 |
| 2 | 4.4 PASS | 4.6 PASS | 0 / 2 |

## Final scores
Design: storyline 5, hierarchy 4, … Motion: purpose 5, timing 4, …

## What changed after review
- Slide 9: title cut from three lines to two; donut label resized to fit.
- …

## Open items
- … (or "None.")

## Reviewer notes worth keeping
- …
```

Keep each round's raw reviews as `critique-round1.md`, `critique-round2.md` in `OUT`.
