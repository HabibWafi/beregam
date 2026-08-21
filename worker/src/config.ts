import * as z from "zod";

/**
 * Konfigurasi worker, dibaca dari environment dan divalidasi Zod.
 *
 * Gagal cepat saat start bila ada yang kurang. Worker yang jalan dengan
 * konfigurasi setengah jadi jauh lebih sulit didiagnosa daripada worker
 * yang menolak start dengan pesan jelas - apalagi bila yang membacanya
 * nanti adalah rekan kerja yang belum pernah membuka kode ini.
 */

const skema = z.object({
  /** URL PESTA, tanpa garis miring di akhir. */
  PESTA_BASE_URL: z.string().url().transform((u) => u.replace(/\/$/, "")),

  /** Kunci yang dikirim di header X-Beregam-Key. */
  BEREGAM_API_KEY: z.string().min(32, "BEREGAM_API_KEY minimal 32 karakter"),

  /** Alamat engine WhatsApp di dalam PC ini. */
  WAHA_BASE_URL: z.string().url().default("http://127.0.0.1:3001"),
  WAHA_API_KEY: z.string().min(1, "WAHA_API_KEY wajib diisi"),
  WAHA_SESSION: z.string().default("default"),

  /**
   * Penanda worker ini.
   *
   * Dipakai untuk sewa kepemilikan: hanya pemegang sewa yang boleh memproses
   * outbox. PC cadangan WAJIB memakai nilai yang berbeda - kalau sama,
   * keduanya akan saling merebut sewa dan warga bisa menerima pesan dobel.
   */
  WORKER_ID: z.string().min(1).max(64).default("worker-pc-utama"),

  /** Jeda antar polling outbox, milidetik. */
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(3000),

  /** Jeda antar heartbeat, milidetik. */
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),

  /** Batas waktu setiap permintaan HTTP, milidetik. */
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(3000).default(15_000),

  /**
   * Jeda acak sebelum mengirim, dalam detik.
   *
   * Bagian dari aturan anti-blokir, dan sengaja tidak bisa dimatikan lewat
   * konfigurasi. Mengirim tanpa jeda adalah jalur tercepat menuju nomor
   * yang diblokir WhatsApp.
   */
  JEDA_MIN_DETIK: z.coerce.number().int().min(1).default(3),
  JEDA_MAX_DETIK: z.coerce.number().int().min(1).default(8),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof skema>;

function baca(): Config {
  const hasil = skema.safeParse(process.env);

  if (!hasil.success) {
    console.error("\nKonfigurasi worker belum lengkap:\n");
    for (const i of hasil.error.issues) {
      console.error(`  - ${i.path.join(".") || "(akar)"}: ${i.message}`);
    }
    console.error("\nIsi berkas .env di folder worker/. Contohnya ada di .env.example.");
    console.error("Bangkitkan nilai rahasia dengan: openssl rand -hex 32\n");
    process.exit(1);
  }

  if (hasil.data.JEDA_MIN_DETIK > hasil.data.JEDA_MAX_DETIK) {
    console.error("JEDA_MIN_DETIK tidak boleh lebih besar dari JEDA_MAX_DETIK.");
    process.exit(1);
  }

  return hasil.data;
}

export const config = baca();

/** Jeda acak dalam milidetik, sesuai aturan anti-blokir. */
export function jedaAcakMs(): number {
  const { JEDA_MIN_DETIK: min, JEDA_MAX_DETIK: maks } = config;
  return (min + Math.random() * (maks - min)) * 1000;
}
