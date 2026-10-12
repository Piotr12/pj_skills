#!/usr/bin/env bash
# Run the automated deck QA. Installs playwright-core (no browser download; it drives the
# installed Google Chrome) into a private cache the first time.
# Usage: qa.sh DECK.html [OUT_DIR] [--no-motion] [--no-pdf]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${SPEECH_TO_DECK_CACHE:-$HOME/.cache/speech-to-deck}"
if ! command -v node >/dev/null; then
  echo "QA needs Node.js 18+ (brew install node)." >&2; exit 2
fi
if [ ! -d "$CACHE/node_modules/playwright-core" ]; then
  mkdir -p "$CACHE"
  npm install --silent --no-audit --no-fund --prefix "$CACHE" playwright-core@1 >&2
fi
NODE_PATH="$CACHE/node_modules" exec node "$HERE/qa.cjs" "$@"
