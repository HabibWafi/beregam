import { konfig } from "./konfigurasi.js";

/**
 * Membaca keadaan Beregam dari PESTA.
 *
 * Semua data percakapan ada di database Hostinger, bukan di PC ini. Panel
 * hanya menampilkannya - tidak menyimpan salinan apa pun. Itu disengaja:
 * satu sumber kebenaran, dan tidak ada riwayat warga yang tertinggal di
 * komputer kantor.
 */

export interface StatusPesta {
  terjangkau: boolean;
  pesan?: string;
  botEnabled?: boolean;
  activeWorkerId?: string | null;
  leaseExpiresAt?: string | null;
  workerLastSeenAt?: string | null;
  waSessionStatus?: string | null;
  outbox?: {
    pending: number;
    locked: number;
    sent: number;
    failed: number;
    cancelled: number;
    tertuaDetik: number | null;
  };
  pesanHarian?: { masukHariIni: number; keluarHariIni: number };
  sesi?: { total: number; manual: number };
  alertTerbuka?: number;
  /** Waktu bolak-balik permintaan, milidetik. Penanda kualitas sambungan. */
  latensiMs?: number;
}

export async function statusPesta(): Promise<StatusPesta> {
  if (!konfig.PESTA_BASE_URL || konfig.BEREGAM_API_KEY.length < 32) {
    return { terjangkau: false, pesan: "PESTA_BASE_URL atau BEREGAM_API_KEY belum diisi." };
  }

  const mulai = Date.now();

  try {
    const res = await fetch(`${konfig.PESTA_BASE_URL}/api/beregam/status`, {
      headers: {
        "x-beregam-key": konfig.BEREGAM_API_KEY,
        "x-worker-id": `${konfig.WORKER_ID}-panel`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const latensiMs = Date.now() - mulai;

    // 404 berarti PESTA yang ter-deploy belum punya endpoint ini. Bukan
    // kesalahan pemakai, dan bukan alasan panel berhenti berfungsi - sisa
    // panel (penautan WhatsApp, kendali layanan, log) tetap berguna.
    if (res.status === 404) {
      return {
        terjangkau: false,
        latensiMs,
        pesan:
          "PESTA terjangkau, tapi belum punya endpoint /api/beregam/status. " +
          "Deploy ulang PESTA dari GitHub untuk melihat antrean pesan di sini.",
      };
    }

    if (res.status === 401) {
      return {
        terjangkau: false,
        latensiMs,
        pesan: "Kunci API ditolak. BEREGAM_API_KEY di PC ini berbeda dengan yang di hPanel.",
      };
    }

    if (res.status === 503) {
      return {
        terjangkau: false,
        latensiMs,
        pesan: "Modul Beregam belum dikonfigurasi di PESTA. Isi BEREGAM_API_KEY dan BEREGAM_WEBHOOK_HMAC di hPanel.",
      };
    }

    if (!res.ok) {
      return { terjangkau: false, latensiMs, pesan: `PESTA membalas ${res.status}.` };
    }

    const data = (await res.json()) as Record<string, never>;
    const d = data as unknown as {
      botEnabled: boolean;
      activeWorkerId: string | null;
      leaseExpiresAt: string | null;
      workerLastSeenAt: string | null;
      waSessionStatus: string | null;
      outbox: StatusPesta["outbox"];
      pesan: { masukHariIni: number; keluarHariIni: number };
      sesi: { total: number; manual: number };
      alertTerbuka: number;
    };

    return {
      terjangkau: true,
      latensiMs,
      botEnabled: d.botEnabled,
      activeWorkerId: d.activeWorkerId,
      leaseExpiresAt: d.leaseExpiresAt,
      workerLastSeenAt: d.workerLastSeenAt,
      waSessionStatus: d.waSessionStatus,
      ...(d.outbox ? { outbox: d.outbox } : {}),
      pesanHarian: d.pesan,
      sesi: d.sesi,
      alertTerbuka: d.alertTerbuka,
    };
  } catch (error) {
    const latensiMs = Date.now() - mulai;
    return {
      terjangkau: false,
      latensiMs,
      pesan:
        error instanceof Error && error.name === "TimeoutError"
          ? "PESTA tidak menjawab dalam 15 detik. Periksa sambungan internet."
          : "PESTA tidak terjangkau. Periksa sambungan internet dan alamat PESTA_BASE_URL.",
    };
  }
}
