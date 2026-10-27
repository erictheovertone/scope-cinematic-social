#!/usr/bin/env bash
# ── Brief V1 §3 — EDIT & POST video fixtures (canonical, H.264) ───────────────
# Generates 1080×1920 (portrait, the device case that breaks) H.264 MP4 clips at
# 20s / 45s / 90s into public/test-fixtures/ (gitignored). 12 Mbps ≈ the device
# bitrate, so byte size scales with duration the way a real iPhone clip does:
#   20s ≈ 30 MB · 45s ≈ 68 MB · 90s ≈ 135 MB (the "~150MB" Eric reported).
#
# Requires ffmpeg (brew install ffmpeg). The spec (test/video-editpost.spec.ts)
# serves whatever fixtures exist; run this once before the harness, or run
# gen-fixtures-browser.mjs when ffmpeg is unavailable (H.264 via headless Chrome).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/public/test-fixtures"
mkdir -p "$OUT"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found — install it (brew install ffmpeg) or run gen-fixtures-browser.mjs" >&2
  exit 1
fi

for d in 20 45 90; do
  echo "→ v-${d}s.mp4 (1080x1920 H.264, ${d}s)"
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "testsrc2=size=1080x1920:rate=30:duration=${d}" \
    -c:v libx264 -pix_fmt yuv420p -profile:v high -b:v 12M -movflags +faststart \
    "$OUT/v-${d}s.mp4"
done
echo "done → $OUT"
ls -lh "$OUT"/v-*.mp4
