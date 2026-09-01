import { config } from "./config.js";
import { log } from "./logger.js";

/**
 * Antarmuka engine WhatsApp.
 *
 * HANYA BERKAS INI yang tahu bentuk API engine. Seluruh worker lainnya
 * bicara lewat antarmuka di bawah.
 *
 * Ini bukan abstraksi demi kerapian. Rancangan sempat memilih OpenWA, lalu
 * berpindah ke WAHA setelah kondisi image-nya diperiksa. Perpindahan itu
 * hanya menyentuh berkas ini. Hal yang sama berlaku bila WAHA suatu saat
 * mengubah bentuk API-nya, atau bila nanti pindah ke Meta Cloud API.
 */
export interface WaGateway {
  /** Menandai pesan sudah dibaca. Bagian dari aturan anti-blokir. */
  sendSeen(chatId: string): Promise<void>;

  /** Menyalakan indikator "sedang mengetik". */
  startTyping(chatId: string): Promise<void>;

  /** Mematikan indikator "sedang mengetik". */
  stopTyping(chatId: string): Promise<void>;

  /** Mengirim pesan teks. Mengembalikan id pesan dari WhatsApp bila ada. */
  sendText(
    chatId: string,
    teks: string,
    opsi?: { mentions?: string[] }
  ): Promise<string | null>;

  /** Mencari ID grup dari nama yang sama persis. */
  findGroupIdBySubject(subject: string): Promise<string | null>;

  /** Mengambil JID peserta aktif untuk mention eksplisit di dalam grup. */
  groupParticipantMentions(groupId: string): Promise<string[]>;

  /** Mengambil identitas peserta grup untuk pemilihan penerima presensi. */
  groupParticipants(groupId: string): Promise<GroupParticipant[]>;

  /** Status sesi, mis. "WORKING". null bila tidak terbaca. */
  sessionStatus(): Promise<string | null>;
}

export interface GroupParticipant {
  /** JID utama untuk mention. Pada NOWEB umumnya berupa LID. */
  id: string;
  /** Nomor WhatsApp asli tanpa akhiran @c.us. */
  phone: string;
  role: string;
  isSelf: boolean;
}

interface OpsiPanggil {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Beberapa endpoint wajar mengembalikan galat; jangan penuhi log. */
  diamSaatGagal?: boolean;
}

/** Implementasi untuk WAHA (WhatsApp HTTP API). */
export class WahaGateway implements WaGateway {
  private readonly dasar = config.WAHA_BASE_URL.replace(/\/$/, "");
  private readonly sesi = config.WAHA_SESSION;

  private async panggil<T>(jalur: string, opsi: OpsiPanggil = {}): Promise<T | null> {
    try {
      const res = await fetch(`${this.dasar}${jalur}`, {
        method: opsi.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.WAHA_API_KEY,
        },
        ...(opsi.body ? { body: JSON.stringify(opsi.body) } : {}),
        signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (!opsi.diamSaatGagal) {
          log.warn(`engine menolak ${jalur}`, { status: res.status });
        }
        return null;
      }

      const teks = await res.text();
      return teks ? (JSON.parse(teks) as T) : (null as T);
    } catch (error) {
      if (!opsi.diamSaatGagal) {
        log.warn(`engine tidak terjangkau di ${jalur}`, {
          pesan: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }

  async sendSeen(chatId: string): Promise<void> {
    // Kegagalan di sini tidak boleh menggagalkan pengiriman - menandai
    // sudah dibaca hanyalah kesopanan, bukan inti pekerjaan.
    await this.panggil("/api/sendSeen", {
      method: "POST",
      body: { session: this.sesi, chatId },
      diamSaatGagal: true,
    });
  }

  async startTyping(chatId: string): Promise<void> {
    await this.panggil("/api/startTyping", {
      method: "POST",
      body: { session: this.sesi, chatId },
      diamSaatGagal: true,
    });
  }

  async stopTyping(chatId: string): Promise<void> {
    await this.panggil("/api/stopTyping", {
      method: "POST",
      body: { session: this.sesi, chatId },
      diamSaatGagal: true,
    });
  }

  async sendText(
    chatId: string,
    teks: string,
    opsi: { mentions?: string[] } = {}
  ): Promise<string | null> {
    const hasil = await this.panggil<{
      id?: string | { id?: string };
      key?: { id?: string };
      _data?: { id?: string; key?: { id?: string } };
    }>(
      "/api/sendText",
      {
        method: "POST",
        body: {
          session: this.sesi,
          chatId,
          text: teks,
          ...(opsi.mentions?.length ? { mentions: opsi.mentions } : {}),
        },
      }
    );

    if (hasil === null) {
      throw new Error("Engine gagal mengirim pesan");
    }

    // Bentuk id berbeda antar versi engine: kadang string, kadang objek.
    // Ditangani di sini supaya sisa worker tidak perlu tahu.
    const id = hasil.id;
    if (typeof id === "string") return id;
    if (id && typeof id === "object" && typeof id.id === "string") return id.id;
    if (typeof hasil.key?.id === "string") return hasil.key.id;
    if (typeof hasil._data?.key?.id === "string") return hasil._data.key.id;
    if (typeof hasil._data?.id === "string") return hasil._data.id;
    return null;
  }

  async findGroupIdBySubject(subject: string): Promise<string | null> {
    type IdApi = string | { _serialized?: string; id?: string };
    type GrupApi = {
      id?: IdApi;
      subject?: string;
      name?: string;
      _data?: { id?: IdApi; subject?: string };
    };

    const respons = await this.panggil<GrupApi[] | Record<string, GrupApi>>(
      `/api/${encodeURIComponent(this.sesi)}/groups?limit=100&offset=0&` +
        "sortBy=subject&sortOrder=asc&exclude=participants"
    );

    // Bentuk respons bergantung engine. NOWEB 2026.8 mengembalikan objek
    // dengan ID grup sebagai kunci, sedangkan engine lain dapat berupa array.
    const kelompok: GrupApi[] = Array.isArray(respons)
      ? respons
      : respons && typeof respons === "object"
        ? Object.entries(respons).map(([id, grup]) => ({ ...grup, id }))
        : [];

    const dicari = subject.trim().toLocaleLowerCase("id-ID");
    const grup = kelompok.find((item) => {
      const nama = item.subject ?? item.name ?? item._data?.subject ?? "";
      return nama.trim().toLocaleLowerCase("id-ID") === dicari;
    });
    if (!grup) return null;

    const id = grup.id ?? grup._data?.id;
    if (typeof id === "string") return id.endsWith("@g.us") ? id : null;
    const serial = id?._serialized ?? id?.id;
    return serial?.endsWith("@g.us") ? serial : null;
  }

  async groupParticipants(groupId: string): Promise<GroupParticipant[]> {
    type PesertaApi = {
      id?: string;
      /** Phone-number JID. Hanya fallback bila grup tidak memakai LID. */
      pn?: string;
      role?: string;
    };

    const [peserta, sesi] = await Promise.all([
      this.panggil<PesertaApi[]>(
        `/api/${encodeURIComponent(this.sesi)}/groups/${encodeURIComponent(groupId)}/participants/v2`
      ),
      this.panggil<{ me?: { id?: string; lid?: string } }>(
        `/api/sessions/${encodeURIComponent(this.sesi)}`,
        { diamSaatGagal: true }
      ),
    ]);
    if (!Array.isArray(peserta)) return [];

    const idSendiri = new Set([sesi?.me?.id, sesi?.me?.lid].filter(Boolean));

    const unik = new Map<string, GroupParticipant>();
    for (const item of peserta) {
      if (item.role === "left") continue;
      const id = item.id ?? item.pn ?? "";
      const phone = (item.pn ?? "").replace(/@c\.us$/, "");
      if (!/^(?:\d+)@(lid|c\.us)$/.test(id) || !/^\d{8,15}$/.test(phone)) continue;
      unik.set(phone, {
        id,
        phone,
        role: item.role ?? "participant",
        isSelf: idSendiri.has(id) || idSendiri.has(item.pn),
      });
    }
    return [...unik.values()];
  }

  async groupParticipantMentions(groupId: string): Promise<string[]> {
    const peserta = await this.groupParticipants(groupId);
    // Grup ini memakai LID. NOWEB mengirim mention melalui JID utama
    // peserta; memakai PN @c.us pada grup LID tidak menghasilkan ID pesan.
    return peserta.filter((item) => !item.isSelf).map((item) => item.id);
  }

  async sessionStatus(): Promise<string | null> {
    const hasil = await this.panggil<{ status?: string }>(
      `/api/sessions/${encodeURIComponent(this.sesi)}`,
      { diamSaatGagal: true }
    );
    return hasil?.status ?? null;
  }
}

export const gateway: WaGateway = new WahaGateway();
