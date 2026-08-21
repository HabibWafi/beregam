#!/usr/bin/env bash
# Memeriksa kondisi engine WhatsApp. Aman dijalankan kapan saja.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "${DIR}/.env"; set +a
API="http://127.0.0.1:${WAHA_PORT}"
K="X-Api-Key: ${WAHA_API_KEY}"

p() { printf '  %-46s %s\n' "$1" "$2"; }

echo "=== Kondisi engine ==="
p "status container" "$(docker inspect -f '{{.State.Health.Status}}' beregam-waha 2>/dev/null || echo 'tidak ada')"
p "health (dengan kunci API)" "$(curl -s -o /dev/null -w '%{http_code}' -H "$K" "$API/health")"
p "health (TANPA kunci - harus 401)" "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")"
echo ""
echo "=== Versi ==="
curl -s -H "$K" "$API/api/version" | head -c 300; echo ""
echo ""
echo "=== Sesi ==="
curl -s -H "$K" "$API/api/sessions?all=true" | head -c 500; echo ""
echo ""
echo "=== Keamanan: port TIDAK boleh terbuka ke jaringan kantor ==="
BIND=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{$p}} -> {{.HostIp}}:{{.HostPort}}{{end}}{{end}}' beregam-waha 2>/dev/null)
p "pemetaan port" "$BIND"
if echo "$BIND" | grep -q '0.0.0.0'; then
  echo "  BAHAYA: port terbuka ke seluruh jaringan kantor."
else
  echo "  AMAN: hanya bisa diakses dari dalam PC ini."
fi
