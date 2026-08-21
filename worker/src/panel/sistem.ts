import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { konfig } from "./konfigurasi.js";

const jalankan = promisify(execFile);

/**
 * Membaca dan mengendalikan proses di PC ini.
 *
 * Semua perintah dijalankan lewat execFile dengan argumen sebagai larik,
 * BUKAN exec dengan string. Bedanya penting: exec menyerahkan string ke
 * shell, sehingga nilai apa pun yang berasal dari permintaan HTTP bisa
 * menyelipkan perintah lain. execFile tidak pernah memanggil shell, jadi
 * argumen tetap argumen.
 */

async function cobaJalankan(
  perintah: string,
  argumen: string[],
  batasMs = 15_000
): Promise<{ ok: boolean; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(perintah, argumen, {
      timeout: batasMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, keluaran: (stdout || stderr || "").trim() };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      keluaran: (e.stdout || e.stderr || e.message || "gagal").trim(),
    };
  }
}

// ---------------------------------------------------------------------------
// Layanan worker
// ---------------------------------------------------------------------------

export type AksiLayanan = "start" | "stop" | "restart";

export async function statusLayanan(): Promise<{
  aktif: boolean;
  keadaan: string;
  sejak: string | null;
}> {
  const hasil = await cobaJalankan("systemctl", [
    "--user",
    "show",
    konfig.NAMA_LAYANAN,
    "--property=ActiveState",
    "--property=SubState",
    "--property=ActiveEnterTimestamp",
  ]);

  const nilai = new Map<string, string>();
  for (const baris of hasil.keluaran.split("\n")) {
    const pisah = baris.indexOf("=");
    if (pisah > 0) nilai.set(baris.slice(0, pisah), baris.slice(pisah + 1));
  }

  const active = nilai.get("ActiveState") ?? "unknown";
  return {
    aktif: active === "active",
    keadaan: `${active}${nilai.get("SubState") ? ` (${nilai.get("SubState")})` : ""}`,
    sejak: nilai.get("ActiveEnterTimestamp") || null,
  };
}

export async function kendalikanLayanan(aksi: AksiLayanan) {
  return cobaJalankan("systemctl", ["--user", aksi, konfig.NAMA_LAYANAN], 30_000);
}

export async function logLayanan(baris = 120): Promise<string> {
  const n = Math.min(Math.max(baris, 10), 1000);
  const hasil = await cobaJalankan("journalctl", [
    "--user",
    "-u",
    konfig.NAMA_LAYANAN,
    "-n",
    String(n),
    "--no-pager",
    "--output=short-iso",
  ]);
  return hasil.keluaran || "(log kosong)";
}

// ---------------------------------------------------------------------------
// Kontainer engine WhatsApp
// ---------------------------------------------------------------------------

export async function statusKontainer(): Promise<{
  ada: boolean;
  jalan: boolean;
  kesehatan: string;
  sejak: string | null;
  jumlahRestart: number;
}> {
  const hasil = await cobaJalankan("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}tanpa-pemeriksaan{{end}}|{{.State.StartedAt}}|{{.RestartCount}}",
    konfig.NAMA_KONTAINER,
  ]);

  if (!hasil.ok) {
    return { ada: false, jalan: false, kesehatan: "tidak ada", sejak: null, jumlahRestart: 0 };
  }

  const [jalan, kesehatan, sejak, restart] = hasil.keluaran.split("|");
  return {
    ada: true,
    jalan: jalan === "true",
    kesehatan: kesehatan ?? "tidak diketahui",
    sejak: sejak ?? null,
    jumlahRestart: Number(restart ?? 0),
  };
}

export async function kendalikanKontainer(aksi: "start" | "stop" | "restart") {
  return cobaJalankan("docker", [aksi, konfig.NAMA_KONTAINER], 60_000);
}

export async function logKontainer(baris = 120): Promise<string> {
  const n = Math.min(Math.max(baris, 10), 1000);
  const hasil = await cobaJalankan("docker", [
    "logs",
    "--tail",
    String(n),
    "--timestamps",
    konfig.NAMA_KONTAINER,
  ]);
  // Log WAHA memakai warna ANSI; dibuang supaya terbaca di HTML.
  return (hasil.keluaran || "(log kosong)").replace(/\[[0-9;]*m/g, "");
}

// ---------------------------------------------------------------------------
// Mesin
// ---------------------------------------------------------------------------

export async function keadaanMesin(): Promise<{
  uptime: string;
  memori: string;
  disk: string;
}> {
  const [up, mem, disk] = await Promise.all([
    cobaJalankan("uptime", ["-p"]),
    cobaJalankan("free", ["-h"]),
    cobaJalankan("df", ["-h", "/"]),
  ]);

  const barisMem = mem.keluaran.split("\n")[1]?.split(/\s+/) ?? [];
  const barisDisk = disk.keluaran.split("\n")[1]?.split(/\s+/) ?? [];

  return {
    uptime: up.keluaran || "tidak diketahui",
    memori: barisMem.length > 2 ? `${barisMem[2]} terpakai dari ${barisMem[1]}` : "tidak terbaca",
    disk: barisDisk.length > 4 ? `${barisDisk[2]} terpakai dari ${barisDisk[1]} (${barisDisk[4]})` : "tidak terbaca",
  };
}
