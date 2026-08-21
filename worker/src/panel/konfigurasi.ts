/**
 * Konfigurasi panel kendali.
 *
 * SENGAJA TIDAK MEMAKAI src/config.ts.
 *
 * Konfigurasi worker gagal cepat: kalau ada yang kurang, prosesnya berhenti
 * dengan pesan jelas. Itu benar untuk worker - worker yang jalan setengah
 * jadi lebih sulit didiagnosa daripada worker yang menolak start.
 *
 * Untuk panel, aturan itu justru terbalik. Panel adalah alat yang dibuka
 * orang ketika ada yang tidak beres, dan "berkas .env kurang satu baris"
 * adalah salah satu penyebab yang paling sering. Panel yang ikut mati saat
 * konfigurasinya bermasalah tidak bisa memberi tahu apa yang bermasalah.
 *
 * Jadi di sini: baca apa adanya, catat apa yang kurang, tetap jalan.
 */

export interface KonfigPanel {
  PESTA_BASE_URL: string;
  BEREGAM_API_KEY: string;
  WAHA_BASE_URL: string;
  WAHA_API_KEY: string;
  WAHA_SESSION: string;
  WORKER_ID: string;
  /** Port panel. Selalu didengarkan di 127.0.0.1 saja. */
  PANEL_PORT: number;
  /** Nama layanan systemd worker, untuk start/stop/restart dan baca log. */
  NAMA_LAYANAN: string;
  /** Nama kontainer engine WhatsApp. */
  NAMA_KONTAINER: string;
}

export interface Kekurangan {
  kunci: string;
  pesan: string;
}

function ambil(kunci: string, bawaan = ""): string {
  return (process.env[kunci] ?? bawaan).trim();
}

export const konfig: KonfigPanel = {
  PESTA_BASE_URL: ambil("PESTA_BASE_URL").replace(/\/$/, ""),
  BEREGAM_API_KEY: ambil("BEREGAM_API_KEY"),
  WAHA_BASE_URL: ambil("WAHA_BASE_URL", "http://127.0.0.1:3001").replace(/\/$/, ""),
  WAHA_API_KEY: ambil("WAHA_API_KEY"),
  WAHA_SESSION: ambil("WAHA_SESSION", "default"),
  WORKER_ID: ambil("WORKER_ID", "worker-pc-utama"),
  PANEL_PORT: Number(ambil("PANEL_PORT", "3100")) || 3100,
  NAMA_LAYANAN: ambil("NAMA_LAYANAN", "beregam-worker"),
  NAMA_KONTAINER: ambil("NAMA_KONTAINER", "beregam-waha"),
};

/**
 * Apa saja yang kurang, untuk ditampilkan di panel.
 *
 * Dikembalikan sebagai daftar, bukan dilemparkan sebagai galat - supaya
 * panel bisa menampilkan seluruhnya sekaligus alih-alih satu per satu
 * setiap kali dicoba ulang.
 */
export function periksaKonfig(): Kekurangan[] {
  const kurang: Kekurangan[] = [];

  if (!konfig.PESTA_BASE_URL) {
    kurang.push({
      kunci: "PESTA_BASE_URL",
      pesan: "Alamat PESTA belum diisi. Panel tidak bisa membaca antrean pesan.",
    });
  }
  if (konfig.BEREGAM_API_KEY.length < 32) {
    kurang.push({
      kunci: "BEREGAM_API_KEY",
      pesan: "Kunci API PESTA kosong atau kurang dari 32 karakter. Harus sama persis dengan yang di hPanel.",
    });
  }
  if (!konfig.WAHA_API_KEY) {
    kurang.push({
      kunci: "WAHA_API_KEY",
      pesan: "Kunci engine WhatsApp belum diisi. Panel tidak bisa menautkan atau memeriksa sesi.",
    });
  }

  return kurang;
}
