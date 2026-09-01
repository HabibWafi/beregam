import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";
import type { GroupParticipant, WaGateway } from "./gateway.js";
import { log } from "./logger.js";
import {
  bacaKonfigurasiPresensi,
  PESAN_DATANG_BAWAAN,
  PESAN_PULANG_BAWAAN,
  tambahRiwayatPresensi,
  type KonfigurasiPresensi,
} from "./presensi-store.js";

const ZONA_WIB = "Asia/Jakarta";
const JEDA_PERIKSA_MS = 10_000;

type JenisPresensi = "datang" | "pulang";

export interface SlotPresensi {
  kunci: string;
  tanggal: string;
  waktu: string;
  jenis: JenisPresensi;
}

interface BagianWaktu {
  tanggal: string;
  hari: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  waktu: string;
}

interface StatePresensi {
  version: 1;
  /**
   * Slot diklaim SEBELUM WAHA dipanggil. Ini sengaja memilih kemungkinan
   * satu pengingat terlewat ketika PC mati pada detik yang sangat sempit,
   * dibanding risiko tag-all terkirim dua kali setelah restart.
   */
  claimed: Record<string, string>;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_WIB,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const JADWAL_PAGI = new Set(["07:25", "07:29"]);
const JADWAL_SORE_SENIN_KAMIS = new Set(["16:00", "16:05", "16:10", "16:30"]);
const JADWAL_SORE_JUMAT = new Set(["16:30", "16:35", "16:40", "17:00"]);

function bagianWaktu(waktu: Date): BagianWaktu {
  const bagian = Object.fromEntries(
    formatter.formatToParts(waktu).map((item) => [item.type, item.value])
  );
  return {
    tanggal: `${bagian.year}-${bagian.month}-${bagian.day}`,
    hari: bagian.weekday as BagianWaktu["hari"],
    waktu: `${bagian.hour}:${bagian.minute}`,
  };
}

/** Fungsi murni agar seluruh kombinasi hari dan jam bisa diuji tanpa WAHA. */
export function slotPresensiPada(waktu: Date): SlotPresensi | null {
  const wib = bagianWaktu(waktu);
  if (wib.hari === "Sat" || wib.hari === "Sun") return null;

  let jenis: JenisPresensi | null = null;
  if (JADWAL_PAGI.has(wib.waktu)) {
    jenis = "datang";
  } else if (wib.hari === "Fri" && JADWAL_SORE_JUMAT.has(wib.waktu)) {
    jenis = "pulang";
  } else if (wib.hari !== "Fri" && JADWAL_SORE_SENIN_KAMIS.has(wib.waktu)) {
    jenis = "pulang";
  }

  if (!jenis) return null;
  return {
    kunci: `${wib.tanggal}T${wib.waktu}-${jenis}`,
    tanggal: wib.tanggal,
    waktu: wib.waktu,
    jenis,
  };
}

export function pesanPresensi(slot: SlotPresensi): string {
  return slot.jenis === "datang" ? PESAN_DATANG_BAWAAN : PESAN_PULANG_BAWAAN;
}

/** Memetakan nomor pilihan ke LID terkini; nomor yang sudah keluar dilewati. */
export function pilihMention(
  peserta: GroupParticipant[],
  pengaturan: Pick<KonfigurasiPresensi, "modeMention" | "nomorDipilih">
): string[] {
  const dipilih = new Set(pengaturan.nomorDipilih);
  return peserta
    .filter(
      (item) =>
        !item.isSelf &&
        (pengaturan.modeMention === "semua" || dipilih.has(item.phone))
    )
    .map((item) => item.id);
}

/**
 * WAHA/WhatsApp mensyaratkan ID juga tertulis sebagai @angka di teks;
 * array `mentions` saja diterima API tetapi diam-diam tidak menandai siapa pun.
 */
export function tokenMention(peserta: string[]): string {
  return peserta
    .map((id) => id.replace(/@(c\.us|lid)$/, ""))
    .filter((nomor) => /^\d+$/.test(nomor))
    .map((nomor) => `@${nomor}`)
    .join(" ");
}

async function bacaState(path: string): Promise<StatePresensi> {
  try {
    const isi = JSON.parse(await readFile(path, "utf8")) as Partial<StatePresensi>;
    if (isi.version === 1 && isi.claimed && typeof isi.claimed === "object") {
      return { version: 1, claimed: isi.claimed };
    }
  } catch (error) {
    const kode = (error as NodeJS.ErrnoException).code;
    if (kode !== "ENOENT") {
      log.warn("state pengingat presensi tidak dapat dibaca; dibuat ulang", { kode });
    }
  }
  return { version: 1, claimed: {} };
}

async function simpanState(path: string, state: StatePresensi): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const sementara = `${path}.tmp`;
  await writeFile(sementara, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(sementara, path);
}

function pangkasState(state: StatePresensi, sekarang: Date): void {
  const batas = sekarang.getTime() - 14 * 24 * 60 * 60 * 1000;
  for (const [kunci, diklaimPada] of Object.entries(state.claimed)) {
    if (new Date(diklaimPada).getTime() < batas) delete state.claimed[kunci];
  }
}

export class PengingatPresensi {
  private readonly pathState = resolve(config.PRESENSI_STATE_FILE);
  private groupId: string | null = config.PRESENSI_GROUP_ID || null;
  private berhenti = false;

  constructor(
    private readonly gateway: WaGateway,
    private readonly botAktif: () => boolean
  ) {}

  async periksa(sekarang = new Date()): Promise<void> {
    if (!config.PRESENSI_ENABLED || !this.botAktif()) return;

    const pengaturan = await bacaKonfigurasiPresensi();
    if (!pengaturan.aktif) return;

    const slot = slotPresensiPada(sekarang);
    if (!slot) return;

    const state = await bacaState(this.pathState);
    if (state.claimed[slot.kunci]) return;

    if (!this.groupId) {
      this.groupId = await this.gateway.findGroupIdBySubject(config.PRESENSI_GROUP_NAME);
      if (!this.groupId) {
        log.warn("grup pengingat presensi belum ditemukan", {
          grup: config.PRESENSI_GROUP_NAME,
        });
        return;
      }
      log.info("grup pengingat presensi ditemukan", { grup: config.PRESENSI_GROUP_NAME });
    }

    const peserta = await this.gateway.groupParticipants(this.groupId);
    const mentions = pilihMention(peserta, pengaturan);
    const token = tokenMention(mentions);
    if (mentions.length === 0 || !token) {
      log.error("peserta grup tidak tersedia untuk mention pengingat presensi", {
        grup: config.PRESENSI_GROUP_NAME,
      });
      return;
    }

    // Klaim disimpan sebelum panggilan jaringan sebagai pengaman anti-duplikat.
    state.claimed[slot.kunci] = sekarang.toISOString();
    pangkasState(state, sekarang);
    await simpanState(this.pathState, state);

    try {
      const isiPesan =
        slot.jenis === "datang" ? pengaturan.pesanDatang : pengaturan.pesanPulang;
      const teks = `${isiPesan}\n\n📣 ${token}`;
      const messageId = await this.gateway.sendText(this.groupId, teks, { mentions });
      await tambahRiwayatPresensi({
        waktu: sekarang.toISOString(),
        jenis: slot.jenis,
        jadwalWib: slot.waktu,
        status: "terkirim",
        jumlahMention: mentions.length,
        pesan: isiPesan,
        adaMessageId: Boolean(messageId),
      });
      log.info("pengingat presensi terkirim", {
        jenis: slot.jenis,
        waktuWib: slot.waktu,
        grup: config.PRESENSI_GROUP_NAME,
        jumlahMention: mentions.length,
      });
    } catch (error) {
      // Status kirim bisa tidak pasti ketika HTTP timeout. Klaim sengaja
      // dipertahankan agar tag-all tidak berulang akibat percobaan otomatis.
      log.error("pengingat presensi gagal atau hasil kirim tidak pasti", {
        jenis: slot.jenis,
        waktuWib: slot.waktu,
        grup: config.PRESENSI_GROUP_NAME,
        pesan: error instanceof Error ? error.message : String(error),
      });
      await tambahRiwayatPresensi({
        waktu: sekarang.toISOString(),
        jenis: slot.jenis,
        jadwalWib: slot.waktu,
        status: "gagal",
        jumlahMention: mentions.length,
        pesan: slot.jenis === "datang" ? pengaturan.pesanDatang : pengaturan.pesanPulang,
        adaMessageId: false,
        galat: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      });
    }
  }

  async jalan(): Promise<void> {
    if (!config.PRESENSI_ENABLED) {
      log.info("pengingat presensi dinonaktifkan");
      return;
    }

    log.info("pengingat presensi aktif", {
      grup: config.PRESENSI_GROUP_NAME,
      zonaWaktu: ZONA_WIB,
    });

    while (!this.berhenti) {
      try {
        await this.periksa();
      } catch (error) {
        log.error("pemeriksaan jadwal presensi gagal", {
          pesan: error instanceof Error ? error.message : String(error),
        });
      }
      await new Promise((selesai) => setTimeout(selesai, JEDA_PERIKSA_MS));
    }
  }

  stop(): void {
    this.berhenti = true;
  }
}
