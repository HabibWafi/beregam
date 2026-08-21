#!/usr/bin/env bash
# =============================================================================
# Memasang Docker Engine di WSL2 Ubuntu.
#
# Docker ENGINE, bukan Docker Desktop. Docker Desktop butuh lisensi berbayar
# untuk organisasi di atas ukuran tertentu; Engine berlisensi Apache 2.0 dan
# bebas dari persoalan itu untuk instansi pemerintah.
#
# Jalankan sebagai root di dalam WSL:
#   wsl -d Ubuntu-24.04 -u root bash /mnt/d/Aplikasi\ dan\ Website/Beregam/infra/pasang-docker.sh
#
# Aman dijalankan berulang.
# =============================================================================

set -euo pipefail

PENGGUNA="${1:-beregam}"

echo "=== 1. Paket dasar ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg

echo "=== 2. Kunci dan repositori Docker ==="
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq

echo "=== 3. Docker Engine ==="
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== 4. Nyalakan layanan ==="
systemctl enable --now docker
systemctl enable --now containerd

echo "=== 5. Izinkan pengguna memakai docker tanpa sudo ==="
if id "$PENGGUNA" >/dev/null 2>&1; then
  usermod -aG docker "$PENGGUNA"
  echo "  ${PENGGUNA} ditambahkan ke grup docker"
else
  echo "  PERINGATAN: pengguna ${PENGGUNA} tidak ada, dilewati"
fi

echo ""
echo "=== Hasil ==="
docker --version
docker compose version
systemctl is-active docker | sed 's/^/  layanan docker: /'
echo ""
echo "Selesai. Uji dengan:"
echo "  docker run --rm hello-world"
