#!/usr/bin/env python3
"""Assemble a self-contained HTML deck from an authored slides fragment.

WORKDIR must contain:
  slides.html   the <section class="slide"> elements (optionally preceded by one <style> block
                with deck-specific CSS). Local images referenced there are inlined.
  deck.json     {"title", "subtitle", "speaker", "date", "lang", "style", "audio", "transcript"}
                (paths relative to WORKDIR; style = consulting | whiteboard | minimal)

Writes WORKDIR/deck.html (or --out). With --audio-mode file the audio is written next to it
as audio.mp3; with embed (default) everything is inside the one HTML file.

Usage: build.py WORKDIR [--style S] [--out PATH] [--audio-mode embed|file|none]
"""
import argparse
import base64
import html
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(SKILL, "assets")
STYLES = ("consulting", "whiteboard", "minimal")
FONTS = {"consulting": ["sourceserif4", "plexsans"], "whiteboard": ["kalam"], "minimal": ["inter"]}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def font_css(style):
    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(ASSETS, "fonts", "manifest.tsv"), encoding="utf-8") if l.strip()]
    out = []
    for fname, family, fstyle, weight, subset, urange in rows:
        if not any(fname.startswith(p) for p in FONTS[style]):
            continue
        with open(os.path.join(ASSETS, "fonts", fname), "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        out.append(
            f"@font-face{{font-family:'{family}';font-style:{fstyle};font-weight:{weight.replace('-', ' ')};"
            f"font-display:block;src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{urange};}}"
        )
    return "\n".join(out)


def inline_images(fragment, workdir, warnings):
    def repl(m):
        attr, q, src = m.group(1), m.group(2), m.group(3)
        if src.startswith(("data:", "#")):
            return m.group(0)
        if src.startswith(("http://", "https://", "//")):
            warnings.append(f"remote image left as a link (deck will not work offline): {src[:80]}")
            return m.group(0)
        path = os.path.join(workdir, src)
        if not os.path.isfile(path):
            warnings.append(f"image not found: {src}")
            return m.group(0)
        mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return f'{attr}={q}data:{mime};base64,{data}{q}'
    return re.sub(r'(src|href)=(["\'])([^"\']+)\2', repl, fragment)


QUOTES = {  # language: (open double, close double, open single, close single)
    "en": ("\u201c", "\u201d", "\u2018", "\u2019"),
    "pl": ("\u201e", "\u201d", "\u201a", "\u2019"),
    "de": ("\u201e", "\u201c", "\u201a", "\u2018"),
    "cs": ("\u201e", "\u201c", "\u201a", "\u2018"),
    "fr": ("\u00ab\u00a0", "\u00a0\u00bb", "\u2018", "\u2019"),
}


def smart_quotes(fragment, lang):
    """Typographic quotes and apostrophes in text nodes only (never in tags, CSS or JSON)."""
    od, cd, os_, cs = QUOTES.get(lang.split("-")[0], QUOTES["en"])
    parts = re.split(r"(<script\b.*?</script>|<style\b.*?</style>|<pre\b.*?</pre>|<code\b.*?</code>|<[^>]+>)", fragment, flags=re.S | re.I)
    prev = " "
    out = []
    for part in parts:
        if not part or part.startswith("<"):
            out.append(part)
            continue
        buf = []
        for idx, ch in enumerate(part):
            nxt = part[idx + 1] if idx + 1 < len(part) else " "
            if ch == '"':
                after_tag = idx == 0 and out and out[-1].startswith("<")
                opening = prev.isspace() or prev in "([{\u2014\u2013/" or prev in (od, os_)
                if after_tag and (nxt.isalnum() or nxt in "\u2026.'"):
                    opening = True  # e.g. </span>"All great…: a tag, then a quote that starts a word
                ch = od if opening else cd
            elif ch == "'":
                ch = cs if prev.isalnum() or prev in ".,!?" else (os_ if (prev.isspace() or prev in "([{\u2014\u2013") else cs)
            buf.append(ch)
            prev = ch[-1]
        out.append("".join(buf))
    return "".join(out)


SHORT_WORDS = {  # words that should not end a line in a headline (and, in Polish, must not)
    "en": "a an the of to in on at by is it we as or",
    "pl": "a i o u w z do na po od ze we za że to",
    "de": "der die das ein eine zu im am an in",
}


def bind_title_words(fragment, lang):
    """Non-breaking spaces in titles: after short words, and between a number and its unit,
    so balanced wrapping never leaves "a / year" or "$5.4 / billion"."""
    words = set(SHORT_WORDS.get(lang.split("-")[0], SHORT_WORDS["en"]).split())

    def fix_text(text):
        text = re.sub(r"(?<![\w])(%s) (?=\S)" % "|".join(sorted(map(re.escape, words), key=len, reverse=True)),
                      lambda m: m.group(1) + "\u00a0", text, flags=re.I)
        return re.sub(r"(\d[\d.,]*\S?) (?=(?:billion|million|thousand|percent|years?|months?|days?|miles?|cents?|feet|ft|mph|km|kg|mld|mln|tys|lat|proc)\b)",
                      lambda m: m.group(1) + "\u00a0", text, flags=re.I)

    def fix_heading(m):
        inner = re.sub(r">([^<]+)<", lambda t: ">" + fix_text(t.group(1)) + "<", ">" + m.group(2) + "<")[1:-1]
        return m.group(1) + inner + m.group(3)
    return re.sub(r'(<h[12][^>]*class="[^"]*\b(?:title|statement)\b[^"]*"[^>]*>)(.*?)(</h[12]>)', fix_heading, fragment, flags=re.S)


def check_slides(fragment, transcript_dur, warnings):
    sections = re.findall(r'<section\b([^>]*)>', fragment)
    slides = [a for a in sections if re.search(r'class=["\'][^"\']*\bslide\b', a)]
    cues, steps_total = [], 0
    for n, attrs in enumerate(slides, 1):
        if "data-title=" not in attrs:
            warnings.append(f"slide {n}: no data-title (used for overview and navigation)")
        m = re.search(r'data-cue=["\']([^"\']*)["\']', attrs)
        if m and m.group(1) not in ("", "none"):
            try:
                cues.append((n, float(m.group(1))))
            except ValueError:
                warnings.append(f"slide {n}: data-cue is not a number: {m.group(1)}")
    for n, (attrs, body) in enumerate(re.findall(r'<section\b([^>]*class=["\'][^"\']*\bslide\b[^>]*)>(.*?)</section>', fragment, re.S), 1):
        m = re.search(r'data-cue=["\']([\d.]+)["\']', attrs)
        own = float(m.group(1)) if m else None
        steps = []
        for tag in re.findall(r'<[^>]*data-cue=["\'][\d.]+["\'][^>]*>', body):
            st = re.search(r'data-(?:sketch-)?step=["\']([\d.]+)["\']', tag)
            if st:
                steps.append((float(st.group(1)), float(re.search(r'data-cue=["\']([\d.]+)', tag).group(1))))
        steps.sort()
        for (s1, c1), (s2, c2) in zip(steps, steps[1:]):
            if c2 < c1:
                warnings.append(f"slide {n}: step {s2:g} is cued at {c2}s, before step {s1:g} at {c1}s")
        if own is not None and steps and steps[0][1] < own:
            warnings.append(f"slide {n}: step {steps[0][0]:g} cue {steps[0][1]}s is before the slide's own cue {own}s")
    for (a, ta), (b, tb) in zip(cues, cues[1:]):
        if tb < ta:
            warnings.append(f"slide {b} cue {tb}s is earlier than slide {a} cue {ta}s; listen-along would jump backwards")
    if transcript_dur:
        for n, t in cues:
            if t > transcript_dur + 1:
                warnings.append(f"slide {n} cue {t}s is past the end of the recording ({transcript_dur:.0f}s)")
    for v in re.findall(r'data-step=["\']([^"\']*)["\']', fragment):
        try:
            float(v); steps_total += 1
        except ValueError:
            warnings.append(f"data-step must be a number, got {v!r}")
    if re.search(r'<script(?![^>]*application/json)', fragment):
        warnings.append("slides.html contains <script>; the engine is the only script a deck should need")
    return len(slides), len(cues), steps_total


def encode_audio(src):
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    # Mono 48 kbps MP3 keeps speech clear at ~0.36 MB per minute and plays everywhere.
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1",
                    "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", tmp.name], check=True)
    return tmp.name


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workdir")
    ap.add_argument("--style", choices=STYLES)
    ap.add_argument("--out")
    ap.add_argument("--audio-mode", choices=("embed", "file", "none"), default=None)
    args = ap.parse_args()

    wd = os.path.abspath(args.workdir)
    meta = json.loads(read(os.path.join(wd, "deck.json")))
    style = args.style or meta.get("style") or "consulting"
    if style not in STYLES:
        sys.exit(f"unknown style {style!r}; choose one of {', '.join(STYLES)}")
    out = os.path.abspath(args.out or os.path.join(wd, "deck.html"))
    warnings = []

    fragment = read(os.path.join(wd, "slides.html"))
    deck_css = ""
    m = re.match(r'\s*<style[^>]*>(.*?)</style>', fragment, re.S)
    if m:
        deck_css, fragment = m.group(1).strip(), fragment[m.end():]
    fragment = inline_images(fragment, wd, warnings)
    if meta.get("smart_quotes", True):
        fragment = smart_quotes(fragment, meta.get("lang", "en"))
    fragment = bind_title_words(fragment, meta.get("lang", "en"))

    transcript, duration = [], None
    tpath = meta.get("transcript")
    if tpath:
        t = json.loads(read(os.path.join(wd, tpath)))
        transcript = [[s["start"], s["end"], s["text"]] for s in t["segments"]]
        duration = t.get("duration")
    n_slides, n_cues, n_steps = check_slides(fragment, duration, warnings)

    audio, audio_b64 = None, ""
    mode = args.audio_mode or meta.get("audio_mode") or "embed"
    if meta.get("audio") and mode != "none":
        src = os.path.join(wd, meta["audio"])
        if not os.path.isfile(src):
            warnings.append(f"audio not found: {meta['audio']} (deck built without listen-along)")
        else:
            enc = encode_audio(src)
            if mode == "embed":
                with open(enc, "rb") as f:
                    audio_b64 = base64.b64encode(f.read()).decode()
                audio = {"embedded": True, "type": "audio/mpeg"}
            else:
                target = os.path.join(os.path.dirname(out), "audio.mp3")
                os.replace(enc, target)
                enc = None
                audio = {"src": "audio.mp3", "type": "audio/mpeg"}
            if enc:
                os.remove(enc)
        if audio and not n_cues:
            warnings.append("audio included but no slide has data-cue; listen-along cannot follow the speech")

    data = {
        "generator": "speech-to-deck 1.0",
        "title": meta.get("title", ""), "subtitle": meta.get("subtitle", ""),
        "speaker": meta.get("speaker", ""), "date": meta.get("date", ""), "venue": meta.get("venue", ""),
        "lang": meta.get("lang", "en"), "style": style, "duration": duration,
        "transcript": transcript, "audio": audio,
    }
    vendor = ""
    if style == "whiteboard" or meta.get("rough"):
        # MIT: the copyright and permission notice must travel with every copy of rough.js.
        notice = "/*!\n" + read(os.path.join(ASSETS, "vendor", "rough.LICENSE.txt")).strip().replace("*/", "* /") + "\n*/\n"
        vendor = "<script>\n" + (notice + read(os.path.join(ASSETS, "vendor", "rough.min.js"))).replace("</script", "<\\/script") + "\n</script>"

    import hashlib
    stamp = hashlib.sha1("".join(read(os.path.join(ASSETS, *p)) for p in (("engine", "deck.js"), ("engine", "deck.css"), ("themes", f"{style}.css"))).encode()).hexdigest()[:10]
    data["build"] = stamp  # which engine and theme built this deck
    page = read(os.path.join(ASSETS, "template.html"))
    parts = {
        "{{LANG}}": html.escape(data["lang"]),
        "{{THEME}}": style,
        "{{TITLE}}": html.escape(data["title"] or "Deck"),
        "{{FONT_CSS}}": font_css(style),
        "{{ENGINE_CSS}}": read(os.path.join(ASSETS, "engine", "deck.css")),
        "{{THEME_CSS}}": read(os.path.join(ASSETS, "themes", f"{style}.css")),
        "{{DECK_CSS}}": deck_css,
        "{{SLIDES}}": fragment.strip(),
        "{{DATA_JSON}}": json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
        "{{VENDOR_JS}}": vendor,
        "{{AUDIO_B64}}": audio_b64,
        "{{ENGINE_JS}}": read(os.path.join(ASSETS, "engine", "deck.js")).replace("</script", "<\\/script"),
    }
    # Single pass so placeholder-looking text inside slides or data is never re-substituted.
    page = re.sub(r"\{\{[A-Z0-9_]+\}\}", lambda mm: parts.get(mm.group(0), mm.group(0)), page)
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)

    report = {"out": out, "style": style, "assets": stamp, "slides": n_slides, "cued_slides": n_cues, "build_steps": n_steps,
              "audio": (mode if audio else "none"), "size_kb": round(os.path.getsize(out) / 1024), "warnings": warnings}
    print(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
