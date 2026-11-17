#!/usr/bin/env python3
"""Maintainer tool: rebuild assets/icons/*.json from the icon sets' npm packages.

The doodle style draws stroke icons with a marker. Only pure stroke artwork can be drawn on,
so icons with fills or other elements are left out, and so are brand logos. Not needed to build a deck.

  npm pack @tabler/icons lucide-static        # then unpack each .tgz
  vendor_icons.py --tabler DIR/package --lucide DIR/package

Writes assets/icons/tabler.json, lucide.json ({"set", "version", "license", "icons": {name:
[svg body, tags]}}) and the two licence files that must travel with the icons.
"""
import argparse
import json
import os
import re
import shutil

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icons")
GEOMETRY = {
    "path": ("d",), "circle": ("cx", "cy", "r"), "ellipse": ("cx", "cy", "rx", "ry"),
    "rect": ("x", "y", "width", "height", "rx", "ry"), "line": ("x1", "y1", "x2", "y2"),
    "polyline": ("points",), "polygon": ("points",),
}


def body_of(svg_text):
    """The icon's shapes as minimal markup, or None when it is not pure 24x24 stroke artwork."""
    svg_text = re.sub(r"<!--.*?-->", "", svg_text, flags=re.S)
    root = re.search(r"<svg\b([^>]*)>(.*)</svg>", svg_text, re.S)
    if not root or 'viewBox="0 0 24 24"' not in root.group(1):
        return None
    out = []
    for tag, attrs in re.findall(r"<([a-zA-Z]+)\b([^>]*?)/?>", root.group(2)):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', attrs))
        if tag not in GEOMETRY:
            return None
        if a.get("stroke") == "none":
            continue  # Tabler's invisible bounding box
        if a.get("fill", "none") != "none" or "stroke-dasharray" in a or "transform" in a or "opacity" in a:
            return None
        keep = " ".join(f'{k}="{a[k]}"' for k in GEOMETRY[tag] if k in a)
        if not keep:
            return None
        out.append(f"<{tag} {keep}/>")
    return "".join(out) or None


def collect(icon_dir, tags_of):
    icons, skipped = {}, 0
    for fname in sorted(os.listdir(icon_dir)):
        if not fname.endswith(".svg"):
            continue
        name = fname[:-4]
        if name.startswith("brand-"):
            skipped += 1  # company logos are trademarks: a deck draws what the speaker said, not brands
            continue
        with open(os.path.join(icon_dir, fname), encoding="utf-8") as f:
            body = body_of(f.read())
        if body is None:
            skipped += 1
            continue
        icons[name] = [body, " ".join(dict.fromkeys(t.lower() for t in tags_of(name)))]
    return icons, skipped


def write(name, pkg, licence, icons):
    with open(os.path.join(pkg, "package.json"), encoding="utf-8") as f:
        meta = json.load(f)
    data = {"set": name, "package": meta["name"], "version": meta["version"], "license": licence, "icons": icons}
    with open(os.path.join(ASSETS, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    shutil.copyfile(os.path.join(pkg, "LICENSE"), os.path.join(ASSETS, f"{name}.LICENSE.txt"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tabler", required=True, help="unpacked @tabler/icons package")
    ap.add_argument("--lucide", required=True, help="unpacked lucide-static package")
    args = ap.parse_args()
    os.makedirs(ASSETS, exist_ok=True)

    with open(os.path.join(args.tabler, "icons.json"), encoding="utf-8") as f:
        tmeta = json.load(f)
    tabler, ts = collect(os.path.join(args.tabler, "icons", "outline"),
                         lambda n: [tmeta.get(n, {}).get("category", "")] + [str(t) for t in tmeta.get(n, {}).get("tags", [])])
    write("tabler", args.tabler, "MIT", tabler)

    with open(os.path.join(args.lucide, "tags.json"), encoding="utf-8") as f:
        ltags = json.load(f)
    lucide, ls = collect(os.path.join(args.lucide, "icons"), lambda n: ltags.get(n, []))
    write("lucide", args.lucide, "ISC", lucide)
    print(json.dumps({"tabler": len(tabler), "tabler_skipped": ts, "lucide": len(lucide), "lucide_skipped": ls}))


if __name__ == "__main__":
    main()
