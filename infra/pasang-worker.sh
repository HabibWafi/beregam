#!/usr/bin/env bash
# =============================================================================
# Menyiapkan worker pesan: sinkron kontrak, pasang dependensi, build,
# lalu pasang layanan systemd.
#
#   bash ~/beregam/infra/pasang-worker.sh
#
# Aman dijalankan berulang - dipakai juga setiap kali kontrak API berubah.
# =============================================================================

set -euo pipefail

DIR_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR_WORKER="${DIR_REPO}/worker"

# Repositori pesta ada di drive Windows, bukan di sebelah repo ini.
: "${PESTA_REPO:=/mnt/d/Aplikasi dan Website/pesta}"
export PESTA_REPO

cd "$DIR_WORKER"

echo "=== 1. Kontrak API ==="
node skrip/sinkron-contracts.mjs

echo ""
echo "=== 2. Dependensi ==="
if [ -f package-lock.json ]; then
  npm ci --silent
else
  npm install --silent
fi

echo ""
echo "=== 3. Build ==="
npm run build

echo ""
echo "=== 4. Layanan systemd ==="
if [ ! -f "${DIR_WORKER}/.env" ]; then
  echo "  .env belum ada - layanan TIDAK dipasang."
  echo "  Salin .env.example menjadi .env lalu isi, kemudian jalankan skrip ini lagi."
  exit 0
fi

mkdir -p ~/.config/systemd/user
cp "${DIR_WORKER}/beregam-worker.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable beregam-worker >/dev/null 2>&1

# Tanpa linger, layanan pengguna berhenti begitu sesi login terakhir tertutup.
# Pada PC yang seharusnya melayani 24 jam, itu berarti bot mati diam-diam
# setiap kali jendela terminal ditutup.
#
# `sudo -n` wajib: tanpanya sudo meminta kata sandi dan skrip menggantung
# selamanya saat dijalankan tanpa terminal - misalnya dari Task Scheduler,
# tepat pada jalur autostart yang seharusnya dijamin skrip ini.
if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q "Linger=yes"; then
  echo "  Mengaktifkan linger agar layanan tetap jalan tanpa sesi login..."
  if sudo -n loginctl enable-linger "$USER" 2>/dev/null; then
    echo "  linger aktif."
  else
    echo "  PERINGATAN: butuh hak root. Jalankan sekali secara manual:"
    echo "      sudo loginctl enable-linger $USER"
    echo "  Sampai itu dilakukan, worker berhenti saat sesi WSL terakhir tertutup."
  fi
fi

systemctl --user restart beregam-worker
sleep 3

echo ""
echo "=== Hasil ==="
systemctl --user is-active beregam-worker | sed 's/^/  status: /'
echo ""
echo "Lihat log dengan:"
echo "  journalctl --user -u beregam-worker -f"
