#!/usr/bin/env bash
# Render a deck's listen-along as an MP4 (slides drawn in time with the recording, recording as
# the sound track). Uses the same private playwright-core cache as qa.sh; needs Chrome and ffmpeg.
# Usage: export.sh DECK.html [OUT.mp4] [--fps 25] [--from S] [--to S] [--captions] [--width 1920] [--crf 20]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${SPEECH_TO_DECK_CACHE:-$HOME/.cache/speech-to-deck}"
if ! command -v node >/dev/null; then
  echo "Export needs Node.js 18+ (brew install node)." >&2; exit 2
fi
if [ ! -d "$CACHE/node_modules/playwright-core" ]; then
  mkdir -p "$CACHE"
  npm install --silent --no-audit --no-fund --prefix "$CACHE" playwright-core@1 >&2
fi
NODE_PATH="$CACHE/node_modules" exec node "$HERE/export.cjs" "$@"
