#!/usr/bin/env bash
# Memeriksa kandidat image di Docker Hub sebelum dipakai.
cek() {
  echo "=== $1 ==="
  local info tags
  info=$(curl -s "https://hub.docker.com/v2/repositories/$1/")
  if echo "$info" | grep -q '"message"'; then
    echo "  TIDAK DITEMUKAN"
    echo ""
    return
  fi
  echo "$info" | grep -oE '"last_updated":"[^"]+"' | sed 's/^/  /'
  echo "$info" | grep -oE '"pull_count":[0-9]+' | sed 's/^/  /'
  echo "  tag terbaru:"
  tags=$(curl -s "https://hub.docker.com/v2/repositories/$1/tags?page_size=8&ordering=last_updated")
  echo "$tags" | grep -oE '"name":"[^"]+"' | sed 's/"name":"/    /;s/"$//' | head -8
  echo ""
}
cek "openwa/wa-automate"
cek "devlikeapro/waha"
