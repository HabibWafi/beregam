import { config } from "./config.js";

/**
 * Log terstruktur untuk worker.
 *
 * ATURAN MUTLAK: nomor telepon lengkap TIDAK PERNAH ditulis ke log.
 *
 * Ini bukan kehati-hatian berlebihan. Nomor warga ikut terbawa di hampir
 * setiap objek pesan, dan `console.log(pesan)` yang tampak polos sudah
 * cukup untuk menumpahkan ribuan nomor ke berkas log yang lalu ikut
 * ter-backup, ter-copy, dan terbaca orang yang tidak berkepentingan.
 *
 * Karena itu penyamaran dilakukan di lapisan log, bukan diserahkan kepada
 * kedisiplinan setiap pemanggil.
 */

const TINGKAT = { debug: 10, info: 20, warn: 30, error: 40 } as const;
const AMBANG = TINGKAT[config.LOG_LEVEL];

/**
 * Menyamarkan nomor telepon.
 *
 *   6285169881015  ->  62851****015
 */
export function samarkanNomor(nomor: string | null | undefined): string {
  if (!nomor) return "(kosong)";
  const angka = String(nomor).replace(/[^0-9]/g, "");
  if (angka.length < 8) return "***";
  return `${angka.slice(0, 5)}****${angka.slice(-3)}`;
}

/** Pola yang menyerupai nomor telepon Indonesia atau waId WhatsApp. */
const POLA_NOMOR = /\b(?:62|0)\d{8,15}\b/g;

/**
 * Menyapu nomor telepon dari teks apa pun.
 *
 * Jaring pengaman terakhir: dipakai pada setiap pesan dan setiap objek
 * tambahan sebelum ditulis, sehingga nomor yang lolos dari pemanggil tetap
 * tersamar.
 */
function sapuNomor(teks: string): string {
  return teks.replace(POLA_NOMOR, (n) => samarkanNomor(n));
}

function tulis(tingkat: keyof typeof TINGKAT, pesan: string, tambahan?: unknown): void {
  if (TINGKAT[tingkat] < AMBANG) return;

  const waktu = new Date().toISOString();
  const baris = `${waktu} [${tingkat.toUpperCase()}] ${sapuNomor(pesan)}`;

  if (tambahan === undefined) {
    console.log(baris);
    return;
  }

  let ekor: string;
  try {
    ekor = sapuNomor(typeof tambahan === "string" ? tambahan : JSON.stringify(tambahan));
  } catch {
    ekor = "(tidak bisa diserialkan)";
  }
  console.log(`${baris} ${ekor}`);
}

export const log = {
  debug: (pesan: string, tambahan?: unknown) => tulis("debug", pesan, tambahan),
  info: (pesan: string, tambahan?: unknown) => tulis("info", pesan, tambahan),
  warn: (pesan: string, tambahan?: unknown) => tulis("warn", pesan, tambahan),
  error: (pesan: string, tambahan?: unknown) => tulis("error", pesan, tambahan),
};
