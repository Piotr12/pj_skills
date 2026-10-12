#!/usr/bin/env python3
"""Transcribe an audio/video file with a locally installed whisper.cpp.

Writes into OUT_DIR:
  transcript.json  segments with start/end seconds (the source of truth)
  transcript.md    readable transcript, one timestamped line per segment
  speech.wav       16 kHz mono copy used for recognition (deleted unless --keep-wav)

Exit code 2 means the speech-to-text engine or model is missing; the message
on stderr tells the user exactly how to install it.

Usage: transcribe.py INPUT OUT_DIR [--language auto|en|pl|...] [--model PATH]
       transcribe.py INPUT --clip START DURATION [--language xx]   (re-check a passage; prints absolute times)
       transcribe.py INPUT --pauses START DURATION                (speech onsets after pauses, for exact cues)
       transcribe.py INPUT --find "phrase" --transcript OUT/transcript.json   (exact time a phrase starts)
       transcribe.py --check
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys

MODEL_DIRS = [
    os.environ.get("WHISPER_MODEL_DIR", ""),
    "~/.local/share/whisper.cpp/models",
    "~/.cache/whisper.cpp",
    "~/.cache/whisper",
    "~/models/whisper",
    "~/models",
    "/opt/homebrew/share/whisper-cpp/models",
    "/opt/homebrew/share/whisper.cpp/models",
    "/usr/local/share/whisper-cpp/models",
]
# Best first. large-v3 is the default recommendation: 99 languages and the best
# accuracy of the local options on non-English speech (e.g. Polish).
MODEL_PREFERENCE = [
    "ggml-large-v3.bin",
    "ggml-large-v3-q8_0.bin",
    "ggml-large-v3-turbo.bin",
    "ggml-large-v3-turbo-q8_0.bin",
    "ggml-large-v2.bin",
    "ggml-medium.bin",
]

# A short, well punctuated prompt in the spoken language. Without it, whisper.cpp
# with VAD tends to emit lowercase text with no punctuation, which ruins quotes.
PROMPTS = {
    "en": "Good evening, everyone. Thank you. This is a recorded talk, transcribed with proper punctuation.",
    "pl": "Dzień dobry, witam wszystkich. Dziękuję. To jest nagranie wystąpienia, z poprawną interpunkcją.",
    "de": "Guten Abend, meine Damen und Herren. Vielen Dank. Dies ist eine Rede mit korrekter Zeichensetzung.",
    "fr": "Bonsoir à tous. Merci. Ceci est un discours enregistré, avec une ponctuation correcte.",
    "es": "Buenas tardes a todos. Gracias. Esta es una charla grabada, con la puntuación correcta.",
    "it": "Buonasera a tutti. Grazie. Questo è un discorso registrato, con la punteggiatura corretta.",
    "pt": "Boa noite a todos. Obrigado. Esta é uma palestra gravada, com a pontuação correta.",
    "nl": "Goedenavond allemaal. Dank u wel. Dit is een opgenomen toespraak, met correcte interpunctie.",
    "cs": "Dobrý večer všem. Děkuji. Toto je nahraná přednáška se správnou interpunkcí.",
    "sk": "Dobrý večer všetkým. Ďakujem. Toto je nahraná prednáška so správnou interpunkciou.",
    "uk": "Добрий вечір усім. Дякую. Це запис виступу з правильною пунктуацією.",
    "ru": "Добрый вечер всем. Спасибо. Это запись выступления с правильной пунктуацией.",
    "sv": "God kväll allihop. Tack. Det här är ett inspelat föredrag, med korrekt interpunktion.",
}

INSTALL_HELP = """\
speech-to-deck needs whisper.cpp with the Whisper large-v3 model (about 3.1 GB,
runs comfortably on Apple Silicon with 16 GB+, fast on 32 GB+).

  # 1. engine (macOS; on Linux build from https://github.com/ggml-org/whisper.cpp)
  brew install whisper-cpp

  # 2. model + voice-activity model (VAD stops hallucinations in silences)
  mkdir -p ~/.local/share/whisper.cpp/models && cd ~/.local/share/whisper.cpp/models
  curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
  curl -L -O https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin

Also needs ffmpeg (brew install ffmpeg). Set WHISPER_MODEL=/path/to/ggml-*.bin to
use a model stored elsewhere."""


def die_missing(what):
    print(f"MISSING: {what}\n\n{INSTALL_HELP}", file=sys.stderr)
    sys.exit(2)


def find_binary():
    for name in ("whisper-cli", "whisper-cpp", "whisper.cpp"):
        path = shutil.which(name)
        if path:
            return path
    die_missing("whisper.cpp command line tool (whisper-cli)")


def candidate_dirs():
    for d in MODEL_DIRS:
        if d:
            d = os.path.expanduser(d)
            if os.path.isdir(d):
                yield d


def find_model(explicit):
    if explicit:
        if os.path.isfile(explicit):
            return explicit
        die_missing(f"model file {explicit}")
    env = os.environ.get("WHISPER_MODEL")
    if env and os.path.isfile(env):
        return env
    for name in MODEL_PREFERENCE:
        for d in candidate_dirs():
            p = os.path.join(d, name)
            if os.path.isfile(p) and os.path.getsize(p) > 50_000_000:
                return p
    die_missing("a Whisper ggml model (ggml-large-v3.bin recommended)")


def find_vad():
    env = os.environ.get("WHISPER_VAD_MODEL")
    if env and os.path.isfile(env):
        return env
    for d in candidate_dirs():
        hits = sorted(glob.glob(os.path.join(d, "ggml-silero-*.bin")))
        if hits:
            return hits[-1]
    return None


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def duration_of(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", path]).stdout.strip()
    return float(out)


def detect_language(binary, model, wav, total, threads):
    # Sample from 30% into the recording: intros are often music or a host.
    start = max(0.0, min(total * 0.3, total - 30))
    clip = wav + ".lang.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.1f}",
         "-t", "30", "-i", wav, "-c", "copy", clip])
    try:
        res = subprocess.run([binary, "-m", model, "-l", "auto", "-dl", "-t", str(threads),
                              "-f", clip], capture_output=True, text=True)
        m = re.search(r"auto-detected language: (\w+)", res.stderr + res.stdout)
        return m.group(1) if m else "en"
    finally:
        os.remove(clip)


def vad_speech(vad, wav):
    """Speech spans (seconds) from the Silero VAD tool that ships with whisper.cpp, or [] if unavailable."""
    tool = shutil.which("whisper-vad-speech-segments")
    if not (tool and vad):
        return []
    res = subprocess.run([tool, "-vm", vad, "-f", wav, "-np"], capture_output=True, text=True)
    return [(float(a) / 100, float(b) / 100) for a, b in re.findall(r"start = ([\d.]+), end = ([\d.]+)", res.stdout + res.stderr)]


def snap_to_speech(segments, spans, warnings):
    """Segments after applause or music start where the noise starts; move each start that falls
    outside detected speech to where speech actually resumes (if that is inside the segment)."""
    if not spans:
        return
    for s in segments:
        inside = any(a - 0.3 <= s["start"] <= b + 0.3 for a, b in spans)
        if inside:
            continue
        nxt = next((a for a, b in spans if a > s["start"]), None)
        if nxt is not None and nxt < s["end"] - 0.3 and nxt - s["start"] <= 40:
            warnings.append(f"segment start {fmt(s['start'])} moved to {fmt(nxt)} (speech resumes after applause or music)")
            s["start"] = round(nxt, 2)


def norm_words(text):
    return re.findall(r"[\w']+", text.lower())


def find_phrase(binary, model, args):
    """Locate a phrase: find its segment in the transcript, re-transcribe that stretch word by word
    (DTW token alignment) and print when the phrase's first word starts."""
    import tempfile
    if not args.transcript:
        sys.exit("--find needs --transcript OUT/transcript.json")
    segs = json.load(open(args.transcript, encoding="utf-8"))["segments"]
    want = norm_words(args.find)
    hits = [s for s in segs if " ".join(want[:3]) in " ".join(norm_words(s["text"]))] or \
           [s for s in segs if want and want[0] in norm_words(s["text"])]
    if not hits:
        sys.exit(f"phrase not found in transcript: {args.find}")
    lang = args.language if args.language != "auto" else json.load(open(args.transcript, encoding="utf-8")).get("language", "en")
    results = []
    for s in hits[:4]:
        start = max(0.0, s["start"] - 1.0)
        end = max(s["end"], s["start"] + 0.45 * len(want) + 6) + 1.0  # room for the whole phrase
        with tempfile.TemporaryDirectory(prefix="s2d-find-") as tmp:
            wav = os.path.join(tmp, "c.wav")
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}",
                 "-i", args.input, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
            cmd = [binary, "-m", model, "-l", lang, "-ml", "1", "-sow", "-oj", "-of", os.path.join(tmp, "w"), "-np", "-f", wav]
            if "large-v3" in os.path.basename(model):
                cmd += ["-dtw", "large.v3"]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:  # older builds without DTW for this model
                subprocess.run([c for c in cmd if c not in ("-dtw", "large.v3")], check=True, capture_output=True)
            words = [(start + w["offsets"]["from"] / 1000.0, w["text"].strip()) for w in json.load(open(os.path.join(tmp, "w.json")))["transcription"] if w["text"].strip()]
        toks = [(t, nw) for t, w in words for nw in norm_words(w)]  # "25,000" -> "25", "000" at the same time
        best, found = 0, None
        for i in range(len(toks)):
            run_len = 0
            while i + run_len < len(toks) and run_len < len(want) and toks[i + run_len][1] == want[run_len]:
                run_len += 1
            if run_len > best:
                best, found = run_len, toks[i][0]
        results.append((best, found, s))
    results.sort(key=lambda r: -r[0])
    for best, found, s in results:
        line = s["text"][:80]
        if found is not None and best >= min(2, len(want)):
            ons = [o for o in onsets(args.input, max(0, found - 1.5), 2.2) if o <= found + 0.4]
            near = f", nearest speech onset {ons[-1]:.2f}" if ons else ""
            print(f"{found:8.2f}  {best}/{len(want)} words match{near}  (segment {s['start']:.2f}: {line})")
        else:
            print(f"   ?      not matched word by word; segment {s['start']:.2f}–{s['end']:.2f}: {line}")


def onsets(path, start, dur):
    """Speech onsets (absolute seconds) in a stretch; word timestamps drift, pause ends do not."""
    vol = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", path,
                          "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.search(r"mean_volume: (-?[\d.]+) dB", vol)
    noise = f"{(float(m.group(1)) - 6) if m else -30:.1f}dB"
    res = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", path,
                          "-af", f"silencedetect=noise={noise}:d=0.15", "-f", "null", "-"], capture_output=True, text=True)
    return [start + float(e) for e in re.findall(r"silence_end: ([\d.]+)", res.stderr)]


def list_onsets(path, start, dur, noise=None, min_pause=0.15):
    """Speech onsets = ends of short silences (ffmpeg silencedetect). Whisper's word times drift by
    1-2 s; a pause end is where a carrying word actually starts. The silence threshold adapts to the
    recording (old broadcasts have a high noise floor): 6 dB under the passage's mean loudness."""
    if noise is None:
        vol = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", path,
                              "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
        m = re.search(r"mean_volume: (-?[\d.]+) dB", vol)
        noise = f"{(float(m.group(1)) - 6) if m else -30:.1f}dB"
    res = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", path,
                          "-af", f"silencedetect=noise={noise}:d={min_pause}", "-f", "null", "-"],
                         capture_output=True, text=True)
    found = re.findall(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", res.stderr)
    print(f"speech onsets between {start:.1f}s and {start + dur:.1f}s (pause >= {min_pause}s, quieter than {noise}); "
          f"longer pauses are likelier phrase starts:")
    for end, length in found:
        print(f"  {start + float(end):8.2f}   after a {float(length):.2f}s pause{'  <' if float(length) >= 0.4 else ''}")


def clip_check(binary, model, vad, args):
    """Re-transcribe one passage, padded by 1.5 s each side, in a private temp dir; print absolute times.
    Run it two or three times (with and without --prompt) and trust words that agree."""
    import tempfile
    start, dur = max(0.0, args.clip[0] - 1.5), args.clip[1] + 3.0
    with tempfile.TemporaryDirectory(prefix="s2d-clip-") as tmp:
        wav = os.path.join(tmp, "clip.wav")
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}",
             "-i", args.input, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
        lang = args.language if args.language != "auto" else "en"
        cmd = [binary, "-m", model, "-l", lang, "-sow", "-ml", "1" if args.words else "120", "-oj", "-of", os.path.join(tmp, "out"), "-np", "-f", wav]
        prompt = args.prompt or PROMPTS.get(lang)
        if prompt:
            cmd += ["--prompt", prompt]
            if vad:
                cmd += ["--vad", "-vm", vad]
        run(cmd)
        with open(os.path.join(tmp, "out.json"), encoding="utf-8") as f:
            raw = json.load(f)
    for item in raw.get("transcription", []):
        a = start + item["offsets"]["from"] / 1000.0
        b = start + item["offsets"]["to"] / 1000.0
        print(f"{a:8.2f}–{b:8.2f}  {item['text'].strip()}")


def fmt(t):
    t = int(round(t))
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?")
    ap.add_argument("out_dir", nargs="?")
    ap.add_argument("--pauses", nargs=2, type=float, metavar=("START", "DURATION"),
                    help="list speech onsets (ends of pauses) in this stretch; put step cues on these")
    ap.add_argument("--clip", nargs=2, type=float, metavar=("START", "DURATION"),
                    help="transcribe only this passage (seconds), padded, and print it with absolute times")
    ap.add_argument("--language", default="auto", help="ISO code, or auto (default)")
    ap.add_argument("--model", help="path to a ggml Whisper model")
    ap.add_argument("--prompt", help="override the punctuation prompt (e.g. add names/jargon)")
    ap.add_argument("--find", metavar="PHRASE", help="exact start time of a phrase (needs --transcript)")
    ap.add_argument("--transcript", help="transcript.json to search with --find")
    ap.add_argument("--words", action="store_true", help="with --clip: one line per word (timings are approximate)")
    ap.add_argument("--keep-wav", action="store_true")
    ap.add_argument("--check", action="store_true", help="only verify the toolchain and exit")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        die_missing("ffmpeg")
    binary = find_binary()
    model = find_model(args.model)
    vad = find_vad()
    if args.check:
        print(json.dumps({"whisper": binary, "model": model, "vad": vad}, indent=2))
        return
    if args.find and args.input:
        find_phrase(binary, model, args)
        return
    if args.pauses and args.input:
        list_onsets(args.input, *args.pauses)
        return
    if not args.input or (not args.out_dir and not args.clip):
        ap.error("INPUT and OUT_DIR are required (or INPUT --clip START DURATION)")
    if args.clip:
        clip_check(binary, model, vad, args)
        return

    os.makedirs(args.out_dir, exist_ok=True)
    wav = os.path.join(args.out_dir, "speech.wav")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", args.input,
         "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
    total = duration_of(wav)
    threads = str(min(8, os.cpu_count() or 4))

    lang = args.language
    if lang == "auto":
        lang = detect_language(binary, model, wav, total, threads)
    prompt = args.prompt or PROMPTS.get(lang)

    base = os.path.join(args.out_dir, "whisper_raw")
    # -ml 160 with -sow: sentence-sized segments with real timestamps (captions, cues, excerpts)
    cmd = [binary, "-m", model, "-l", lang, "-t", threads, "-sow", "-ml", "160", "-oj", "-of", base, "-np", "-f", wav]
    if prompt:
        cmd += ["--prompt", prompt]
    if vad and prompt:
        # VAD without a prompt loses punctuation, so only use it when we have one.
        cmd += ["--vad", "-vm", vad]
    print(f"transcribing {fmt(total)} of audio, language={lang}, model={os.path.basename(model)}, "
          f"vad={'on' if vad and prompt else 'off'}", file=sys.stderr)
    run(cmd)

    with open(base + ".json", encoding="utf-8") as f:
        raw = json.load(f)
    segments, warnings = [], []
    for item in raw.get("transcription", []):
        text = item["text"].strip()
        if not text:
            continue
        start = item["offsets"]["from"] / 1000.0
        end = item["offsets"]["to"] / 1000.0
        words = len(text.split())
        # Whisper hallucinations show up as text squeezed into a fraction of a second, or
        # the same line re-emitted at the same timestamp. Deliberate rhetorical repetition
        # ("We choose to go to the moon. We choose to go...") has its own time span, so keep it.
        if words >= 3 and words / max(end - start, 0.01) > 7:
            warnings.append(f"implausibly fast segment at {fmt(start)} dropped (likely hallucination): {text[:60]} "
                            f"-- real words may be missing here; re-check with: transcribe.py INPUT --clip {max(0, start - 8):.0f} 20")
            continue
        if segments and text == segments[-1]["text"] and start - segments[-1]["start"] < 0.6:
            warnings.append(f"duplicate segment at {fmt(start)} dropped (likely hallucination): {text[:60]}")
            continue
        segments.append({"id": len(segments), "start": round(start, 2), "end": round(end, 2), "text": text})

    snap_to_speech(segments, vad_speech(vad, wav), warnings)

    doc = {
        "source": os.path.abspath(args.input),
        "language": lang,
        "duration": round(total, 2),
        "model": os.path.basename(model),
        "vad": bool(vad and prompt),
        "warnings": warnings,
        "segments": segments,
    }
    with open(os.path.join(args.out_dir, "transcript.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out_dir, "transcript.md"), "w", encoding="utf-8") as f:
        f.write(f"# Transcript: {os.path.basename(args.input)}\n\n")
        f.write(f"Language `{lang}`, duration {fmt(total)}, model `{doc['model']}`. "
                f"Timestamps are [mm:ss] from the start of the recording.\n\n")
        for w in warnings:
            f.write(f"> warning: {w}\n")
        prev_end = 0.0
        for s in segments:
            if s["start"] - prev_end > 2.5:
                f.write("\n")  # paragraph break on a long pause
            f.write(f"[{fmt(s['start'])}] {s['text']}\n")
            prev_end = s["end"]
    os.remove(base + ".json")
    if not args.keep_wav:
        os.remove(wav)
    print(json.dumps({"language": lang, "duration": doc["duration"], "segments": len(segments),
                      "warnings": len(warnings)}))


if __name__ == "__main__":
    main()
