#!/usr/bin/env bash
# =============================================================================
# Menyalakan seluruh komponen Beregam di PC kantor.
#
# Dipanggil otomatis oleh Task Scheduler Windows saat pengguna login.
# Bisa juga dijalankan manual:  ~/beregam/infra/start-beregam.sh
#
# Aman dijalankan berulang - komponen yang sudah hidup dibiarkan.
# =============================================================================

set -uo pipefail

DIR_INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="${DIR_INFRA}/data/start-beregam.log"

mkdir -p "${DIR_INFRA}/data"

catat() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

catat "==================== Menyalakan Beregam ===================="

# --- 1. Prasyarat ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  catat "GAGAL: docker tidak ditemukan. Lihat SETUP-PC.md langkah 4."
  exit 1
fi

if [ ! -f "${DIR_INFRA}/.env" ]; then
  catat "GAGAL: ${DIR_INFRA}/.env belum ada. Salin dari .env.example lalu isi."
  exit 1
fi

# Periksa nilai yang wajib terisi. Gagal di sini jauh lebih baik daripada
# container hidup dengan konfigurasi setengah jadi.
for kunci in OPENWA_IMAGE OPENWA_API_KEY PESTA_BASE_URL BEREGAM_WEBHOOK_HMAC; do
  nilai="$(grep -E "^${kunci}=" "${DIR_INFRA}/.env" | cut -d= -f2- | tr -d '"' | xargs || true)"
  if [ -z "$nilai" ]; then
    catat "GAGAL: ${kunci} belum diisi di .env"
    exit 1
  fi
done

# --- 2. Engine WhatsApp ------------------------------------------------------
catat "Menjalankan engine OpenWA..."
cd "$DIR_INFRA" || exit 1
docker compose up -d >>"$LOG" 2>&1

# --- 3. Tunggu engine siap ---------------------------------------------------
catat "Menunggu engine siap (maksimal 3 menit)..."
siap=0
for _ in $(seq 1 36); do
  if curl -fsS --max-time 5 http://127.0.0.1:2785/health >/dev/null 2>&1; then
    siap=1
    break
  fi
  sleep 5
done

if [ "$siap" -eq 1 ]; then
  catat "Engine siap di 127.0.0.1:2785"
else
  catat "PERINGATAN: engine belum menjawab setelah 3 menit."
  catat "  Periksa: docker compose logs --tail 50"
  # Sengaja tidak keluar - worker tetap dinyalakan supaya ia bisa
  # mengirim heartbeat dan kondisi ini terlihat di dashboard PESTA.
fi

# --- 4. Worker pesan ---------------------------------------------------------
if systemctl --user list-unit-files beregam-worker.service >/dev/null 2>&1; then
  catat "Menjalankan worker pesan..."
  systemctl --user start beregam-worker >>"$LOG" 2>&1
  sleep 2
  if systemctl --user is-active --quiet beregam-worker; then
    catat "Worker pesan berjalan"
  else
    catat "PERINGATAN: worker pesan gagal start."
    catat "  Periksa: journalctl --user -u beregam-worker -n 50"
  fi
else
  catat "Worker pesan belum dipasang - dilewati. (Dibuat pada Tahap 10.)"
fi

# --- 5. AI worker (Fase 2) ---------------------------------------------------
if systemctl --user list-unit-files beregam-ai-worker.service >/dev/null 2>&1; then
  catat "Menjalankan AI worker..."
  systemctl --user start beregam-ai-worker >>"$LOG" 2>&1
else
  catat "AI worker belum dipasang - dilewati. (Fase 2.)"
fi

catat "Selesai."
catat ""
