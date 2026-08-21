#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "${DIR}/.env"; set +a
cd "$DIR"

echo "=== Restart bersih ==="
docker compose down >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1

for i in $(seq 1 12); do
  sleep 5
  kode=$(docker exec beregam-waha curl -s -m 3 -o /dev/null -w '%{http_code}' \
    -H "X-Api-Key: ${WAHA_API_KEY}" "http://localhost:3000/health" 2>/dev/null || echo 000)
  printf '  detik %-3s  dalam-container: %s\n' "$((i*5))" "$kode"
  if [ "$kode" = "200" ]; then break; fi
done

echo ""
echo "=== Setelah siap ==="
printf '  dari WSL 127.0.0.1:%s -> %s\n' "$WAHA_PORT" \
  "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "X-Api-Key: ${WAHA_API_KEY}" "http://127.0.0.1:${WAHA_PORT}/health")"
printf '  tanpa kunci (harus 401)  -> %s\n' \
  "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WAHA_PORT}/health")"
