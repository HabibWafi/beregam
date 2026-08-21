#!/usr/bin/env bash
# =============================================================================
# Mencari alamat PESTA yang benar-benar terjangkau dari dalam WSL.
#
#   bash ~/beregam/infra/cek-jalur-pesta.sh [port]
#
# Alamat host Windows dari WSL2 berbeda-beda tergantung mode jaringan:
#   - NAT (bawaan)       -> gateway default, berganti setiap kali WSL restart
#   - networkingMode=mirrored -> cukup 127.0.0.1
# Karena itu alamatnya dicari, bukan ditebak.
# =============================================================================

set -uo pipefail

PORT="${1:-3000}"

GATEWAY="$(ip route 2>/dev/null | awk '/^default/ {print $3; exit}')"
DNS="$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf 2>/dev/null)"
HOSTNM="$(getent hosts host.docker.internal 2>/dev/null | awk '{print $1; exit}')"

echo "Kandidat alamat host:"
echo "  gateway default        : ${GATEWAY:-(tidak ada)}"
echo "  nameserver resolv.conf : ${DNS:-(tidak ada)}"
echo "  host.docker.internal   : ${HOSTNM:-(tidak ada)}"
echo ""
echo "Menguji port ${PORT}:"

DITEMUKAN=""
for H in 127.0.0.1 "$GATEWAY" "$DNS" "$HOSTNM"; do
  [ -z "$H" ] && continue
  if timeout 2 bash -c "echo > /dev/tcp/${H}/${PORT}" 2>/dev/null; then
    echo "  ${H}:${PORT}  TERBUKA"
    [ -z "$DITEMUKAN" ] && DITEMUKAN="$H"
  else
    echo "  ${H}:${PORT}  tertutup"
  fi
done

echo ""
if [ -z "$DITEMUKAN" ]; then
  echo "Tidak ada yang menjawab. Periksa:"
  echo "  1. PESTA sudah jalan di Windows? (npm run dev)"
  echo "  2. Firewall Windows mengizinkan koneksi dari WSL ke port ${PORT}?"
  exit 1
fi

echo "Pakai ini di worker/.env :"
echo "  PESTA_BASE_URL=http://${DITEMUKAN}:${PORT}"
