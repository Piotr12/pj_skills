#!/usr/bin/env python3
"""Find a stroke icon for the doodle style (bundled Tabler and Lucide sets, about 7,400 icons).

  icons.py find rocket               every word must match the name or the tags
  icons.py find hand shake --set lucide --limit 20
  icons.py show tabler:rocket        the SVG body, to judge how many strokes it has

Use the printed id in slides.html: <g data-icon="tabler:rocket" data-x="200" data-y="120" data-size="220"/>
(a bare name looks in Tabler first, then Lucide).
"""
import argparse
import json
import os
import re
import sys

ICONS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icons")
SETS = ("tabler", "lucide")
_cache = {}


def load(name):
    if name not in _cache:
        with open(os.path.join(ICONS, f"{name}.json"), encoding="utf-8") as f:
            _cache[name] = json.load(f)
    return _cache[name]


def lookup(ref):
    """'tabler:rocket' or 'rocket' -> (set, name, body) or None."""
    ref = ref.strip().lower()
    sets, name = ((ref.split(":", 1)[0],), ref.split(":", 1)[1]) if ":" in ref else (SETS, ref)
    for s in sets:
        if s in SETS and name in load(s)["icons"]:
            return s, name, load(s)["icons"][name][0]
    return None


def find(words, only=None, limit=40):
    words = [w.lower() for w in words]
    hits = []
    for s in SETS:
        if only and s != only:
            continue
        for name, (body, tags) in load(s)["icons"].items():
            parts, tagset = name.split("-"), tags.split()
            score = 0
            for w in words:
                if w == name:
                    score += 12
                elif w in parts:
                    score += 6
                elif w in name:
                    score += 3
                elif w in tagset:
                    score += 2
                elif w in tags:
                    score += 1
                else:
                    score = -1
                    break
            if score > 0:
                strokes = len(re.findall(r"<\w", body))
                hits.append((-score, len(parts), name, s, strokes, tags))
    hits.sort()
    return hits[:limit]


def suggest(ref, n=6):
    name = ref.split(":")[-1].lower()
    out = [f"{s}:{nm}" for _, _, nm, s, _, _ in find(re.split(r"[-_\s]+", name), limit=n)]
    if not out:
        for w in re.split(r"[-_\s]+", name):
            out += [f"{s}:{nm}" for _, _, nm, s, _, _ in find([w], limit=3)]
    return out[:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("find")
    f.add_argument("words", nargs="+")
    f.add_argument("--set", choices=SETS)
    f.add_argument("--limit", type=int, default=40)
    s = sub.add_parser("show")
    s.add_argument("ref")
    args = ap.parse_args()
    if args.cmd == "find":
        hits = find(args.words, args.set, args.limit)
        if not hits:
            sys.exit("no icon matches all of: " + " ".join(args.words) + " (try one word, or a synonym)")
        for _, _, name, st, strokes, tags in hits:
            print(f"{st}:{name:<34} {strokes:>2} shapes  {tags[:90]}")
    else:
        hit = lookup(args.ref)
        if not hit:
            sys.exit(f"unknown icon {args.ref!r}; close: {', '.join(suggest(args.ref)) or 'none'}")
        print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{hit[2]}</svg>')


if __name__ == "__main__":
    main()
