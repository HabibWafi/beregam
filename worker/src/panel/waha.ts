import { konfig } from "./konfigurasi.js";

/**
 * Penautan dan pemantauan sesi WhatsApp.
 *
 * Berkas ini yang membuat panel ada. Engine terikat ke 127.0.0.1 di dalam
 * WSL dan TIDAK bisa dijangkau dari Hostinger, jadi menautkan ulang nomor
 * mustahil dilakukan dari halaman admin PESTA - harus dari PC ini.
 */

export interface HasilWaha<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  pesan?: string;
}

async function panggil<T>(
  jalur: string,
  opsi: { method?: string; body?: unknown; teksMentah?: boolean } = {}
): Promise<HasilWaha<T>> {
  if (!konfig.WAHA_API_KEY) {
    return { ok: false, status: 0, data: null, pesan: "WAHA_API_KEY belum diisi di berkas .env." };
  }

  try {
    const res = await fetch(`${konfig.WAHA_BASE_URL}${jalur}`, {
      method: opsi.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": konfig.WAHA_API_KEY,
      },
      ...(opsi.body ? { body: JSON.stringify(opsi.body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });

    const teks = await res.text();
    let data: T | null = null;
    if (teks) {
      try {
        data = JSON.parse(teks) as T;
      } catch {
        data = teks as unknown as T;
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      ...(res.ok ? {} : { pesan: ringkasGalat(data, res.status) }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      pesan:
        error instanceof Error && error.name === "TimeoutError"
          ? "Engine tidak menjawab dalam 20 detik."
          : "Engine tidak terjangkau. Periksa apakah kontainer sedang jalan.",
    };
  }
}

function ringkasGalat(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; error?: unknown };
    if (typeof d.message === "string") return d.message;
    if (typeof d.error === "string") return d.error;
  }
  if (typeof data === "string" && data.trim()) return data.slice(0, 200);
  return `Engine membalas ${status}.`;
}

// ---------------------------------------------------------------------------
// Membaca keadaan
// ---------------------------------------------------------------------------

export interface RingkasSesi {
  ada: boolean;
  nama: string;
  /** WORKING, SCAN_QR_CODE, STARTING, STOPPED, FAILED, ... */
  status: string | null;
  /** Nomor yang tertaut, bila sudah tertaut. */
  nomor: string | null;
  namaAkun: string | null;
  pesan?: string;
}

export async function statusSesi(): Promise<RingkasSesi> {
  const nama = konfig.WAHA_SESSION;
  const hasil = await panggil<{
    name?: string;
    status?: string;
    me?: { id?: string; pushName?: string } | null;
  }>(`/api/sessions/${encodeURIComponent(nama)}`);

  if (hasil.status === 404) {
    return { ada: false, nama, status: null, nomor: null, namaAkun: null };
  }
  if (!hasil.ok) {
    return {
      ada: false,
      nama,
      status: null,
      nomor: null,
      namaAkun: null,
      ...(hasil.pesan ? { pesan: hasil.pesan } : {}),
    };
  }

  const me = hasil.data?.me ?? null;
  return {
    ada: true,
    nama,
    status: hasil.data?.status ?? null,
    // Bentuknya "6285169881015@c.us"; yang berguna hanya angkanya.
    nomor: me?.id ? me.id.split("@")[0] ?? null : null,
    namaAkun: me?.pushName ?? null,
  };
}

export async function versiEngine(): Promise<{ versi: string; engine: string } | null> {
  const hasil = await panggil<{ version?: string; engine?: string }>("/api/server/version");
  if (!hasil.ok || !hasil.data) return null;
  return { versi: hasil.data.version ?? "?", engine: hasil.data.engine ?? "?" };
}

// ---------------------------------------------------------------------------
// Menautkan
// ---------------------------------------------------------------------------

/**
 * Memastikan sesi ada dan sedang berjalan.
 *
 * Dipanggil sebelum meminta QR atau kode pairing: keduanya hanya bisa
 * dilayani engine setelah sesinya hidup dan berada di keadaan SCAN_QR_CODE.
 */
export async function pastikanSesiJalan(): Promise<HasilWaha> {
  const nama = konfig.WAHA_SESSION;
  const jalur = `/api/sessions/${encodeURIComponent(nama)}`;
  const sekarang = await statusSesi();

  if (!sekarang.ada) {
    return panggil(`/api/sessions`, { method: "POST", body: { name: nama, start: true } });
  }

  if (sekarang.status === "WORKING" || sekarang.status === "SCAN_QR_CODE") {
    return { ok: true, status: 200, data: null };
  }

  // FAILED tidak bisa dipulihkan dengan /start saja.
  //
  // Engine sampai ke keadaan itu setelah memaksa berhenti - biasanya karena
  // kode penautan kedaluwarsa sebelum sempat dimasukkan di HP. Memanggil
  // /start di atas sesi yang sudah FAILED hanya menghasilkan FAILED lagi,
  // dan dari luar tampak seperti "tombolnya tidak berfungsi". Harus
  // dihentikan dulu supaya keadaannya bersih.
  if (sekarang.status === "FAILED") {
    await panggil(`${jalur}/stop`, { method: "POST" });
    await new Promise((r) => setTimeout(r, 1500));
  }

  return panggil(`${jalur}/start`, { method: "POST" });
}

export async function hentikanSesi(): Promise<HasilWaha> {
  return panggil(`/api/sessions/${encodeURIComponent(konfig.WAHA_SESSION)}/stop`, {
    method: "POST",
  });
}

/**
 * Memutus tautan nomor dari PC ini.
 *
 * Tindakan yang paling berat di panel: setelah ini bot berhenti total sampai
 * ada yang menautkan ulang dengan HP. Karena itu pemanggilnya wajib
 * mengirim penegasan - lihat index.ts.
 */
export async function putusTautan(): Promise<HasilWaha> {
  return panggil(`/api/sessions/${encodeURIComponent(konfig.WAHA_SESSION)}/logout`, {
    method: "POST",
  });
}

/** QR sebagai data URL, siap ditempel ke <img src>. */
export async function ambilQr(): Promise<{ ok: boolean; dataUrl?: string; pesan?: string }> {
  const siap = await pastikanSesiJalan();
  if (!siap.ok) return { ok: false, ...(siap.pesan ? { pesan: siap.pesan } : {}) };

  const hasil = await panggil<{ mimetype?: string; data?: string }>(
    `/api/${encodeURIComponent(konfig.WAHA_SESSION)}/auth/qr?format=image`
  );

  if (!hasil.ok) {
    return {
      ok: false,
      pesan: hasil.pesan ?? "QR belum tersedia. Coba lagi beberapa detik.",
    };
  }

  const d = hasil.data;
  if (d && typeof d === "object" && typeof d.data === "string") {
    return { ok: true, dataUrl: `data:${d.mimetype ?? "image/png"};base64,${d.data}` };
  }

  return { ok: false, pesan: "Engine memberi QR dalam bentuk yang tidak dikenali." };
}

/**
 * Kode pairing 8 karakter, dimasukkan di HP.
 *
 * Lebih baik daripada QR untuk pemakaian sehari-hari: tidak perlu layar PC
 * dihadapkan ke kamera, dan bisa didiktekan lewat telepon kalau yang
 * memegang HP sedang tidak di ruangan yang sama.
 */
export async function kodePairing(
  nomor: string
): Promise<{ ok: boolean; kode?: string; pesan?: string }> {
  const bersih = nomor.replace(/[^0-9]/g, "");
  if (bersih.length < 10 || bersih.length > 15) {
    return { ok: false, pesan: "Nomor tidak masuk akal. Tulis lengkap dengan kode negara, mis. 6285169881015." };
  }
  if (bersih.startsWith("0")) {
    return { ok: false, pesan: "Ganti angka 0 di depan dengan 62. Contoh: 085169881015 menjadi 6285169881015." };
  }

  const siap = await pastikanSesiJalan();
  if (!siap.ok) return { ok: false, ...(siap.pesan ? { pesan: siap.pesan } : {}) };

  const hasil = await panggil<{ code?: string }>(
    `/api/${encodeURIComponent(konfig.WAHA_SESSION)}/auth/request-code`,
    { method: "POST", body: { phoneNumber: bersih } }
  );

  if (!hasil.ok) {
    return { ok: false, pesan: hasil.pesan ?? "Engine menolak permintaan kode." };
  }

  const kode = hasil.data?.code;
  if (!kode) return { ok: false, pesan: "Engine tidak mengembalikan kode." };

  return { ok: true, kode };
}
