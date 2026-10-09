#!/bin/sh
# 사용: scripts/img2webp.sh <png가 있는 폴더> <slug>
# png → webp(q82, 가로 1200 이하)로 변환해 assets/images/insight/<slug>/ 에 저장
set -e
SRC="$1"; SLUG="$2"
[ -d "$SRC" ] && [ -n "$SLUG" ] || { echo "사용: $0 <폴더> <slug>"; exit 1; }
OUT="$(dirname "$0")/../assets/images/insight/$SLUG"
mkdir -p "$OUT"
for f in "$SRC"/*.png "$SRC"/*.jpg; do
  [ -e "$f" ] || continue
  b=$(basename "$f"); b="${b%.*}"
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}')
  if [ "$w" -gt 1200 ]; then cwebp -quiet -q 82 -resize 1200 0 "$f" -o "$OUT/$b.webp"; else cwebp -quiet -q 82 "$f" -o "$OUT/$b.webp"; fi
done
ls -la "$OUT"
