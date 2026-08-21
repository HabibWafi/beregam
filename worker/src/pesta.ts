import { config } from "./config.js";
import { log } from "./logger.js";
import {
  CONTRACTS_VERSION,
  HEADER_API_KEY,
  HEADER_CONTRACTS_VERSION,
  HEADER_WORKER_ID,
  type AckRequest,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type OutboxItem,
} from "./generated/contracts.js";

/**
 * Klien HTTP ke PESTA.
 *
 * Seluruh komunikasi berarah KELUAR: worker yang mendatangi PESTA, bukan
 * sebaliknya. Itu sebabnya PC ini tidak butuh IP publik, port forwarding,
 * maupun tunnel - dan tidak punya permukaan serangan dari internet.
 */

export class KontrakTidakCocok extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "KontrakTidakCocok";
  }
}

interface Hasil<T> {
  ok: boolean;
  data: T | null;
  status: number;
}

async function panggil<T>(
  jalur: string,
  opsi: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<Hasil<T>> {
  const res = await fetch(`${config.PESTA_BASE_URL}/api/beregam${jalur}`, {
    method: opsi.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      [HEADER_API_KEY]: config.BEREGAM_API_KEY,
      [HEADER_WORKER_ID]: config.WORKER_ID,
      // Jabat tangan versi. Menangkap worker lama yang masih berjalan di PC
      // sementara PESTA sudah ter-deploy versi baru - kegagalan yang tanpa
      // ini tampak seperti "bot tiba-tiba tidak membalas".
      [HEADER_CONTRACTS_VERSION]: CONTRACTS_VERSION,
    },
    ...(opsi.body ? { body: JSON.stringify(opsi.body) } : {}),
    signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
  });

  // 409 berarti versi kontrak tidak cocok. Ini bukan gangguan sementara -
  // mencoba ulang tidak akan pernah berhasil, jadi dilemparkan agar worker
  // berhenti dengan pesan yang jelas alih-alih berputar sia-sia.
  if (res.status === 409) {
    const isi = (await res.json().catch(() => ({}))) as { message?: string };
    throw new KontrakTidakCocok(isi.message ?? "Versi kontrak API tidak cocok.");
  }

  const teks = await res.text();
  const data = teks ? (JSON.parse(teks) as T) : null;

  return { ok: res.ok, data, status: res.status };
}

/** Mengambil dan mengunci antrean kirim. */
export async function ambilOutbox(limit = 5): Promise<OutboxItem[]> {
  const hasil = await panggil<{ items: OutboxItem[] }>(`/outbox?limit=${limit}`);
  if (!hasil.ok) {
    log.warn("gagal mengambil outbox", { status: hasil.status });
    return [];
  }
  return hasil.data?.items ?? [];
}

/** Mengonfirmasi hasil pengiriman satu pesan. */
export async function ackOutbox(id: number, isi: AckRequest): Promise<void> {
  const hasil = await panggil(`/outbox/${id}/ack`, { method: "POST", body: isi });
  if (!hasil.ok) {
    log.warn("gagal mengirim konfirmasi", { id, status: hasil.status });
  }
}

/**
 * Mengirim denyut nadi.
 *
 * Responsnya menentukan dua hal penting: apakah bot sedang dinyalakan, dan
 * apakah worker ini pemegang sewa. Keduanya harus dipatuhi - mengabaikannya
 * berarti mengirim pesan saat admin sudah mematikan bot, atau mengirim
 * dobel bersama PC cadangan.
 */
export async function kirimHeartbeat(isi: HeartbeatRequest): Promise<HeartbeatResponse | null> {
  const hasil = await panggil<HeartbeatResponse>("/heartbeat", { method: "POST", body: isi });
  if (!hasil.ok) {
    log.warn("heartbeat ditolak", { status: hasil.status });
    return null;
  }
  return hasil.data;
}
