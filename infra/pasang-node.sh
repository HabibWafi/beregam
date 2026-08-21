#!/usr/bin/env bash
# =============================================================================
# Memasang Node.js 22 LTS di WSL2 Ubuntu, untuk menjalankan worker pesan.
#
# Jalankan sebagai root:
#   wsl -d Ubuntu-24.04 -u root bash ~/beregam/infra/pasang-node.sh
#
# Aman dijalankan berulang.
#
# Memakai NodeSource, bukan paket bawaan Ubuntu: paket `nodejs` di repositori
# Ubuntu 24.04 masih versi 18, sedangkan worker memakai fitur Node 22
# (fetch bawaan yang stabil, AbortSignal.timeout).
# =============================================================================

set -euo pipefail

VERSI_MAYOR="${1:-22}"

if command -v node >/dev/null 2>&1; then
  TERPASANG="$(node -v)"
  echo "Node sudah terpasang: ${TERPASANG}"
  if [[ "$TERPASANG" == v${VERSI_MAYOR}.* ]]; then
    echo "Versinya sudah sesuai. Tidak ada yang perlu dilakukan."
    exit 0
  fi
  echo "Versi berbeda dari yang diinginkan (v${VERSI_MAYOR}). Melanjutkan pemasangan..."
fi

export DEBIAN_FRONTEND=noninteractive

echo "=== 1. Prasyarat ==="
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg

echo "=== 2. Kunci NodeSource ==="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod a+r /etc/apt/keyrings/nodesource.gpg

echo "=== 3. Repositori ==="
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${VERSI_MAYOR}.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list

apt-get update -qq

echo "=== 4. Node.js ==="
apt-get install -y -qq nodejs

echo ""
echo "=== Hasil ==="
echo "  node : $(node -v)"
echo "  npm  : $(npm -v)"
