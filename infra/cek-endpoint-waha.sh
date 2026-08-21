#!/usr/bin/env bash
# Menguji satu per satu endpoint WAHA yang akan dipakai panel kendali,
# supaya bentuk API tidak ditebak. Dipakai sekali saat membangun panel,
# dan berguna lagi kalau nanti versi WAHA dinaikkan.
set -uo pipefail

ENVF="$HOME/beregam/infra/.env"
[ -f "$ENVF" ] || ENVF="/mnt/d/Aplikasi dan Website/Beregam/infra/.env"
KEY="$(grep -E '^WAHA_API_KEY=' "$ENVF" | cut -d= -f2- | tr -d '\r')"
BASE="http://127.0.0.1:3001"
SESI="${1:-default}"

coba() {
  local metode="$1" jalur="$2"
  local kode
  kode="$(curl -s -o /tmp/waha-body -w '%{http_code}' -X "$metode" \
    -H "X-Api-Key: ${KEY}" -H 'Content-Type: application/json' \
    "${BASE}${jalur}" 2>/dev/null)"
  printf '  %-6s %-45s %s' "$metode" "$jalur" "$kode"
  if [ "$kode" = "200" ] || [ "$kode" = "201" ]; then
    printf '  %s' "$(head -c 160 /tmp/waha-body | tr -d '\n')"
  fi
  printf '\n'
}

echo "=== dasar ==="
coba GET /health
coba GET /api/server/version
coba GET /api/server/status

echo ""
echo "=== sesi ==="
coba GET "/api/sessions?all=true"
coba GET "/api/sessions/${SESI}"
coba GET "/api/sessions/${SESI}/me"

echo ""
echo "=== penautan (hanya diperiksa keberadaannya, TIDAK dijalankan) ==="
echo "  POST   /api/sessions                          buat sesi"
echo "  POST   /api/sessions/${SESI}/start              mulai"
echo "  POST   /api/sessions/${SESI}/stop               henti"
echo "  POST   /api/sessions/${SESI}/logout             putuskan tautan"
echo "  GET    /api/${SESI}/auth/qr?format=image        QR"
echo "  POST   /api/${SESI}/auth/request-code           kode pairing"
rm -f /tmp/waha-body
