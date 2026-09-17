#!/usr/bin/env bash
# Full 1920x1080 / 60fps render. Everything interesting lives in capture.js;
# this is just the one-liner you actually type.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-out/periodic-table.mp4}"
node render/capture.js --out "$OUT" --fps 60 --crf "${CRF:-17}" "$@"
ls -lh "$OUT"
