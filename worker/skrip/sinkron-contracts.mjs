#!/usr/bin/env node
/**
 * Menyalin kontrak API dari repositori pesta.
 *
 *   npm run contracts:sync
 *   PESTA_REPO=/mnt/d/Aplikasi\ dan\ Website/pesta npm run contracts:sync
 *
 * KENAPA DISALIN, BUKAN DIIMPOR
 *
 * Kedua sisi sistem ini ada di repositori berbeda: sisi server di `pesta`
 * (ter-deploy ke Hostinger), sisi PC di `beregam` (tidak pernah ter-deploy).
 * Pemisahan itu membuat butir checklist "folder worker tidak ikut ter-deploy"
 * terpenuhi dengan sendirinya.
 *
 * Harganya: tipe kontrak API tidak lagi otomatis sama. Skrip ini menutup
 * separuh masalahnya - menyamakan berkas saat compile.
 *
 * Separuh sisanya ditutup JABAT TANGAN VERSI saat runtime. Menyalin berkas
 * tidak menangkap kasus paling berbahaya: worker lama masih berjalan di PC
 * sementara PESTA sudah ter-deploy versi baru. PESTA membalas 409 dengan
 * pesan yang menyebut kedua versinya, sehingga penyebabnya langsung terbaca
 * di log worker - bukan tampak seperti "bot tiba-tiba tidak membalas".
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR_WORKER = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Kedua repositori diletakkan bersebelahan. Bisa ditimpa lewat PESTA_REPO
// bila susunannya berbeda, misalnya saat repo pesta ada di drive Windows
// sementara worker dijalankan dari dalam WSL.
const REPO_PESTA = process.env.PESTA_REPO ?? resolve(DIR_WORKER, "../../pesta");

const SUMBER = join(REPO_PESTA, "src/lib/beregam/contracts.ts");
const TUJUAN = join(DIR_WORKER, "src/generated/contracts.ts");

if (!existsSync(SUMBER)) {
  console.error(`Tidak menemukan kontrak di:\n  ${SUMBER}\n`);
  console.error("Pastikan repositori pesta ada di sebelah repositori ini,");
  console.error("atau tunjuk lokasinya secara eksplisit:\n");
  console.error("  PESTA_REPO=/path/ke/pesta npm run contracts:sync\n");
  process.exit(1);
}

mkdirSync(dirname(TUJUAN), { recursive: true });
copyFileSync(SUMBER, TUJUAN);

// Header peringatan supaya siapa pun yang membuka berkas ini tahu bahwa
// mengeditnya sia-sia - perubahannya akan tertimpa pada sinkronisasi
// berikutnya, dan versi di server tetap tidak berubah.
const isi = readFileSync(TUJUAN, "utf8");
const header = `// =============================================================================
// BERKAS INI DIBANGKITKAN OTOMATIS - JANGAN DIEDIT
//
// Disalin dari repositori pesta:
//   src/lib/beregam/contracts.ts
//
// Mengedit berkas ini tidak mengubah apa pun di server, dan perubahannya
// akan hilang saat \`npm run contracts:sync\` dijalankan lagi.
//
// Untuk mengubah kontrak API: ubah di repositori pesta, naikkan
// CONTRACTS_VERSION bila perubahannya merusak kompatibilitas, lalu jalankan
// sinkronisasi ini dan nyalakan ulang worker.
// =============================================================================

`;
writeFileSync(TUJUAN, header + isi, "utf8");

const versi = isi.match(/CONTRACTS_VERSION = "([^"]+)"/)?.[1] ?? "tidak terbaca";

console.log("Kontrak API tersinkron.");
console.log(`  dari    : ${SUMBER}`);
console.log(`  ke      : ${TUJUAN}`);
console.log(`  versi   : ${versi}`);
console.log("");
console.log("Nyalakan ulang worker agar versi barunya dipakai:");
console.log("  systemctl --user restart beregam-worker");
