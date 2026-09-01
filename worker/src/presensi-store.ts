import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type JenisPresensi = "datang" | "pulang";
export type ModeMention = "semua" | "pilihan";

export const PESAN_DATANG_BAWAAN = [
  "⏰ *PENGINGAT PRESENSI DATANG*",
  "",
  "Selamat pagi Bapak/Ibu 👋",
  "Jangan lupa melakukan presensi datang dan pastikan presensi sudah berhasil tercatat.",
  "",
  "Terima kasih. Semangat beraktivitas! 🙏",
].join("\n");

export const PESAN_PULANG_BAWAAN = [
  "⏰ *PENGINGAT PRESENSI PULANG*",
  "",
  "Bapak/Ibu, jangan lupa melakukan presensi pulang dan pastikan presensi sudah berhasil tercatat.",
  "",
  "Terima kasih. Hati-hati di perjalanan! 🙏",
].join("\n");

export interface KonfigurasiPresensi {
  version: 1;
  aktif: boolean;
  modeMention: ModeMention;
  /** Nomor asli tanpa tanda, misalnya 628123456789. */
  nomorDipilih: string[];
  pesanDatang: string;
  pesanPulang: string;
  updatedAt: string | null;
}

export interface RiwayatPresensi {
  waktu: string;
  jenis: JenisPresensi;
  jadwalWib: string;
  status: "terkirim" | "gagal";
  jumlahMention: number;
  pesan: string;
  adaMessageId: boolean;
  galat?: string;
}

export interface SimpanKonfigurasiPresensi {
  aktif: boolean;
  modeMention: ModeMention;
  nomorDipilih: string[];
  pesanDatang: string;
  pesanPulang: string;
}

const BATAS_PESAN = 2_000;
const BATAS_RIWAYAT = 100;

function pathKonfigurasi(): string {
  return resolve(process.env.PRESENSI_CONFIG_FILE ?? ".data/presensi-config.json");
}

function pathRiwayat(): string {
  return resolve(process.env.PRESENSI_HISTORY_FILE ?? ".data/presensi-history.json");
}

export function konfigurasiBawaan(): KonfigurasiPresensi {
  return {
    version: 1,
    aktif: true,
    modeMention: "semua",
    nomorDipilih: [],
    pesanDatang: PESAN_DATANG_BAWAAN,
    pesanPulang: PESAN_PULANG_BAWAAN,
    updatedAt: null,
  };
}

function nomorValid(nomor: unknown): nomor is string {
  return typeof nomor === "string" && /^\d{8,15}$/.test(nomor);
}

export function validasiKonfigurasi(input: unknown): SimpanKonfigurasiPresensi {
  if (!input || typeof input !== "object") throw new Error("Konfigurasi tidak dikenali.");
  const data = input as Record<string, unknown>;
  const modeMention = data.modeMention;
  if (modeMention !== "semua" && modeMention !== "pilihan") {
    throw new Error("Mode penerima tidak dikenali.");
  }

  const pesanDatang = typeof data.pesanDatang === "string" ? data.pesanDatang.trim() : "";
  const pesanPulang = typeof data.pesanPulang === "string" ? data.pesanPulang.trim() : "";
  if (!pesanDatang || !pesanPulang) throw new Error("Pesan datang dan pulang wajib diisi.");
  if (pesanDatang.length > BATAS_PESAN || pesanPulang.length > BATAS_PESAN) {
    throw new Error(`Setiap pesan maksimal ${BATAS_PESAN} karakter.`);
  }

  const mentah = Array.isArray(data.nomorDipilih) ? data.nomorDipilih : [];
  if (!mentah.every(nomorValid)) throw new Error("Ada nomor penerima yang tidak valid.");

  return {
    aktif: data.aktif === true,
    modeMention,
    nomorDipilih: [...new Set(mentah)],
    pesanDatang,
    pesanPulang,
  };
}

async function tulisAtomik(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const sementara = `${path}.${process.pid}.tmp`;
  await writeFile(sementara, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(sementara, path);
}

export async function bacaKonfigurasiPresensi(): Promise<KonfigurasiPresensi> {
  try {
    const data = JSON.parse(await readFile(pathKonfigurasi(), "utf8")) as unknown;
    const valid = validasiKonfigurasi(data);
    const updatedAt =
      data && typeof data === "object" && typeof (data as Record<string, unknown>).updatedAt === "string"
        ? ((data as Record<string, unknown>).updatedAt as string)
        : null;
    return { version: 1, ...valid, updatedAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return konfigurasiBawaan();
    throw error;
  }
}

export async function simpanKonfigurasiPresensi(
  input: unknown
): Promise<KonfigurasiPresensi> {
  const valid = validasiKonfigurasi(input);
  const hasil: KonfigurasiPresensi = {
    version: 1,
    ...valid,
    updatedAt: new Date().toISOString(),
  };
  await tulisAtomik(pathKonfigurasi(), hasil);
  return hasil;
}

export async function bacaRiwayatPresensi(): Promise<RiwayatPresensi[]> {
  try {
    const data = JSON.parse(await readFile(pathRiwayat(), "utf8")) as unknown;
    return Array.isArray(data) ? (data as RiwayatPresensi[]).slice(0, BATAS_RIWAYAT) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function tambahRiwayatPresensi(item: RiwayatPresensi): Promise<void> {
  const riwayat = await bacaRiwayatPresensi();
  await tulisAtomik(pathRiwayat(), [item, ...riwayat].slice(0, BATAS_RIWAYAT));
}

