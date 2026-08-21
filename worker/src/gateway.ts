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
  sendText(chatId: string, teks: string): Promise<string | null>;

  /** Status sesi, mis. "WORKING". null bila tidak terbaca. */
  sessionStatus(): Promise<string | null>;
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

  async sendText(chatId: string, teks: string): Promise<string | null> {
    const hasil = await this.panggil<{ id?: string | { id?: string }; _data?: unknown }>(
      "/api/sendText",
      { method: "POST", body: { session: this.sesi, chatId, text: teks } }
    );

    if (hasil === null) {
      throw new Error("Engine gagal mengirim pesan");
    }

    // Bentuk id berbeda antar versi engine: kadang string, kadang objek.
    // Ditangani di sini supaya sisa worker tidak perlu tahu.
    const id = hasil.id;
    if (typeof id === "string") return id;
    if (id && typeof id === "object" && typeof id.id === "string") return id.id;
    return null;
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
