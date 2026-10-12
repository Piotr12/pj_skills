---
name: speech-to-deck
description: Turn an audio or video recording (speech, talk, lecture, pitch, podcast segment, voice memo) into a polished, self-contained HTML slide deck with keyboard/touch navigation, build animations, speaker notes, PDF export and a listen-along mode that plays the original audio with the slides in sync. Three design styles - consulting (default; strategy-firm storyline with action titles and exhibits), whiteboard (hand-drawn marker sketches) and minimal (classic product-keynote). Transcribes locally with whisper.cpp, then runs automated QA and an independent design and motion critique before delivering. Use whenever someone wants slides, a deck, a presentation or a visual summary made from a recording or its transcript, even if they do not say "deck".
---

# speech-to-deck

Turn a recording into a presentation people would believe a top designer made: a clear storyline, slides that look deliberate, animation that tracks what the speaker says, and nothing invented.

**For the human:** "Make a deck from `talk.m4a`" is enough. Add a style (`whiteboard`, `minimal`; default `consulting`), and say "with photos" if openly licensed photos are welcome. Everything below is addressed to the agent.

## What you deliver

One folder per run, by default next to the recording: `<recording-name>-deck-<style>/`

| File | What it is |
|---|---|
| `deck.html` | The deck. One file, works offline, audio embedded for listen-along. Open in any modern browser. |
| `transcript.md` / `transcript.json` | Timestamped transcript (the source of truth for every claim). |
| `outline.md` | Storyline: governing thought, sections, slide plan with timestamps, transcript corrections. |
| `critique.md` | Final review: scores, what was fixed, what remains. |
| `qa/` | Screenshots of every build step, motion filmstrips, contact sheet, `deck.pdf`, `report.md`. |
| `slides.html`, `deck.json` | Editable source; rebuild with `scripts/build.py`. |

## Options (infer; ask only if the recording itself is missing)

- **style**: `consulting` (default when none is given), `whiteboard`, `minimal`. Several styles: build them one after another, sharing the transcript and outline.
- **language**: detected from the audio. The deck uses the language of the speech unless the user asks otherwise.
- **photos**: off by default. Only when the user opts in, use openly licensed images (public domain, CC0, CC BY) found on the web, embed them, and credit each one on its slide and in full on a credits slide at the end, after one blank slide. Never use photos of private individuals; prefer the subject matter (places, objects, events).
- **audio**: embedded by default (about 0.36 MB per minute). `--audio-mode file` writes `audio.mp3` next to the deck instead; `none` drops listen-along.
- **length**: derived from the recording (see `references/storyline.md`); honour an explicit slide count.
- **metadata**: title, speaker, date, venue come from the user, the file's metadata or the recording itself. Never guess them. What the recording itself shows may be stated: if it is evidently an excerpt or edited (see `references/storyline.md` §1), say so on the cover byline ("Recording excerpt, 9 min 55 s").

## Workflow

Paths below are relative to this skill's directory (`SKILL_DIR`). Work in the output folder (`OUT`); keep scratch files (clips, test renders) in `OUT/.work/`, never in a shared temp folder, because several runs may work in parallel.

### 1. Transcribe

```bash
python3 SKILL_DIR/scripts/transcribe.py --check            # toolchain present?
python3 SKILL_DIR/scripts/transcribe.py INPUT OUT [--language pl] [--prompt "names, jargon"]
```

- Exit code 2 means whisper.cpp, the model or ffmpeg is missing. Show the user the printed install instructions (Homebrew `whisper-cpp` plus the Whisper **large-v3** model, about 3.1 GB, best quality for 32 GB+ machines) and stop. Do not substitute a cloud service or a smaller model without asking.
- Segment starts are snapped to where speech resumes after applause or music (listed under warnings).
- Speed on Apple Silicon: roughly 30 s per 10 min of audio. Run it in the background for long recordings.
- If the user already has a transcript with timestamps, convert it to the same `transcript.json` shape (`segments: [{start, end, text}]`) and skip recognition. Without timestamps, listen-along is impossible; say so.
- Pass `--prompt` with names and terms the speaker uses when you know them (from the user or file name); it improves spelling.
- For exact step cues: `transcribe.py INPUT --find "words the step shows" --transcript OUT/transcript.json` prints the time the phrase starts (word-level alignment, approximate to about 1–2 s, so confirm next to repeated phrases); `transcribe.py INPUT --pauses START SECONDS` lists where speech resumes after each pause; a build lands on the word that carries it, which is often seconds after its segment starts.
- To check a doubtful passage: `transcribe.py INPUT --clip START SECONDS` re-transcribes just that stretch (padded) and prints absolute times. Run it two or three times (with and without `--prompt`) and accept a correction only when the passes agree.

### 2. Read and clean (no shortcuts)

Read **all** of `transcript.md`. Note:
- who speaks when: the main speaker, hosts, introductions, Q&A, applause, music;
- automatic-transcription errors, especially names, numbers and jargon. Fix only what you are sure of (re-transcribe the passage alone when in doubt), and list every correction in `outline.md`. Mention a correction on a slide only when the corrected words are on that slide, always as: `“TIROS” corrected from the automatic transcript.` in the source line (consulting) or the notes (other styles);
- the speaker's own structure, best lines and every number they state.

If a correction given or verified by the user conflicts with your re-transcription, keep the user's version, keep that word off the slides, and flag it in `outline.md`.

Then write the corrected transcript back to `OUT/transcript.json` (keep the original as `transcript.raw.json`): fixed words, hallucinations removed, long segments split at sentence or build points, `[applause]` / `[music]` marked, other speakers prefixed (`Announcer: …`). Captions and the speaker view show this file to the audience.

### 3. Storyline → `outline.md`

Follow `references/storyline.md`. The deck is the speech's argument distilled, in the speech's order, so listen-along can follow it. Synthesis slides (executive summary, recap) are allowed and are skipped by listen-along. Decide the slide plan before writing any HTML: purpose, title, layout, content, transcript time range and cue times for each slide and build step.

### 4. Build → `slides.html`, `deck.json`, `deck.html`

1. Read `references/authoring.md` (the HTML contract) and `references/style-<style>.md` (the design system). Both, every time.
2. Write `OUT/deck.json` and `OUT/slides.html`.
3. Build: `python3 SKILL_DIR/scripts/build.py OUT` and fix every warning it prints.

Copy the transcript and keep the recording path relative to `OUT` in `deck.json`.

### 5. Automated QA

```bash
SKILL_DIR/scripts/qa.sh OUT/deck.html          # ~1 min; needs Node 18+ and Google Chrome
```

Read `OUT/qa/report.md`. Fix every **blocker** and every **major** finding, rebuild, rerun until clean. Look at `qa/contact.jpg` and the shots of any slide you changed: a picture beats the numbers.

### 6. Critique and refine

Follow `references/critique.md`: two independent reviewers, one for **design** and one for **motion and technical quality**, each scoring against its rubric from the screenshots, filmstrips and source. Run them as parallel subagents when your environment has them; otherwise do two separate passes yourself, one rubric at a time, looking at the images. Apply the fixes, rebuild, rerun QA. Repeat until both reviewers pass (at most three rounds). Write `OUT/critique.md`.

### 7. Hand over

Tell the user, briefly: where the deck is, how to present it (arrow keys, `P` listen along, `S` speaker view, `O` overview, `F` fullscreen, print for PDF), the storyline in one sentence, transcript corrections, critique scores and anything left open. Offer the other styles.

## Content integrity (hard rules)

- **Only the recording.** Every claim, number and quote must be traceable to a transcript timestamp, plus title/speaker/date/venue metadata from the user or the file. No outside facts, no "context" from your own knowledge, no invented data in charts.
- **Quotes are verbatim** except for corrected transcription errors. Paraphrases never wear quotation marks.
- **The speaker's voice is verbatim too.** Text presented as the speaker speaking (minimal statements, quote slides, roll calls) is cut from their words, never reworded; mark omissions with "…". In listen-along a reworded line reads as a misquote. Text in the deck's own voice (consulting action titles, labels, captions) may paraphrase, but is never styled as the speaker.
- **Derived metadata is allowed and noted**: "Yesterday, December 7, 1941" gives the date December 8, 1941 (say so in `outline.md`). Venue only as far as the recording goes: a salutation to the Congress gives "Address to the Congress", not a building.
- **Numbers as stated.** Derived numbers (an index, a ratio) are allowed only when the arithmetic is shown or obvious from the label; never extrapolate.
- **Sources on content slides** (consulting) or in the notes (other styles): the recording time range.
- **No names of real consulting firms, products or brands** in style descriptions, notes or copy. The styles are described by what they look like.
- Multi-speaker recordings: attribute every quote to its speaker; if speakers are unclear, say "a speaker".

## Troubleshooting

- `qa.sh` cannot find a browser: install Google Chrome, or `npx playwright install chromium`.
- Wrong language detected: rerun with `--language xx`.
- Repeated or nonsense lines in the transcript: whisper hallucinations in silence or music; `transcribe.py` drops the obvious ones and lists them under warnings. Remove any others by hand and note it.
- A long recording (over an hour): plan sections from the transcript first, then build in passes; keep each slide's cue inside its section.
