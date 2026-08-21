import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { konfig, periksaKonfig } from "./konfigurasi.js";
import { HALAMAN } from "./halaman.js";
import * as waha from "./waha.js";
import * as sistem from "./sistem.js";
import { statusPesta } from "./pesta.js";

/**
 * Panel kendali Beregam - berjalan di PC kantor.
 *
 * ALASAN PANEL INI ADA
 *
 * Engine WhatsApp terikat ke 127.0.0.1 di dalam WSL dan TIDAK bisa dijangkau
 * dari Hostinger. Artinya menautkan ulang nomor - hal yang paling sering
 * perlu dilakukan - mustahil dikerjakan dari halaman admin PESTA. Harus dari
 * mesin ini. Panel inilah tempatnya.
 *
 * KEAMANAN
 *
 * Panel bisa memutus tautan WhatsApp dan mematikan worker. Karena itu ia
 * HANYA mendengarkan di 127.0.0.1, dan alamat itu tidak bisa diubah lewat
 * konfigurasi. Aturannya sama dengan yang berlaku untuk engine: mengikat ke
 * 0.0.0.0 berarti seluruh jaringan kantor bisa mengendalikan WhatsApp atas
 * nama BPS.
 */

const ALAMAT = "127.0.0.1";

function balas(res: ServerResponse, kode: number, data: unknown) {
  const isi = JSON.stringify(data);
  res.writeHead(kode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(isi);
}

async function bacaBadan(req: IncomingMessage): Promise<Record<string, unknown>> {
  const potongan: Buffer[] = [];
  let ukuran = 0;

  for await (const p of req) {
    ukuran += (p as Buffer).length;
    // Panel tidak pernah menerima kiriman besar; batas ini mencegah satu
    // permintaan nakal menghabiskan memori proses.
    if (ukuran > 64 * 1024) throw new Error("Badan permintaan terlalu besar.");
    potongan.push(p as Buffer);
  }

  if (potongan.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(potongan).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Semua keadaan dalam satu permintaan.
 *
 * Digabung karena halaman memanggilnya tiap lima detik. Enam permintaan
 * terpisah tiap lima detik akan menyalakan enam proses shell sekaligus di
 * mesin yang juga sedang menjalankan engine WhatsApp.
 */
async function kumpulkanStatus() {
  const [wa, engine, worker, kontainer, pesta, mesin] = await Promise.all([
    waha.statusSesi(),
    waha.versiEngine(),
    sistem.statusLayanan(),
    sistem.statusKontainer(),
    statusPesta(),
    sistem.keadaanMesin(),
  ]);

  return { kekurangan: periksaKonfig(), wa, engine, worker, kontainer, pesta, mesin };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${ALAMAT}`);
  const jalur = url.pathname;
  const metode = req.method ?? "GET";

  try {
    // --- halaman ---------------------------------------------------------
    if (metode === "GET" && (jalur === "/" || jalur === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(HALAMAN);
      return;
    }

    // --- keadaan ---------------------------------------------------------
    if (metode === "GET" && jalur === "/api/status") {
      return balas(res, 200, await kumpulkanStatus());
    }

    if (metode === "GET" && jalur === "/api/log") {
      const sumber = url.searchParams.get("sumber") === "engine" ? "engine" : "worker";
      const isi =
        sumber === "engine" ? await sistem.logKontainer(200) : await sistem.logLayanan(200);
      return balas(res, 200, { sumber, isi });
    }

    // --- penautan WhatsApp ------------------------------------------------
    if (metode === "POST" && jalur === "/api/wa/pairing") {
      const badan = await bacaBadan(req);
      const nomor = typeof badan.nomor === "string" ? badan.nomor : "";
      return balas(res, 200, await waha.kodePairing(nomor));
    }

    if (metode === "POST" && jalur === "/api/wa/qr") {
      return balas(res, 200, await waha.ambilQr());
    }

    if (metode === "POST" && jalur === "/api/wa/mulai") {
      const h = await waha.pastikanSesiJalan();
      return balas(res, 200, { ok: h.ok, ...(h.pesan ? { pesan: h.pesan } : {}) });
    }

    if (metode === "POST" && jalur === "/api/wa/henti") {
      const h = await waha.hentikanSesi();
      return balas(res, 200, { ok: h.ok, ...(h.pesan ? { pesan: h.pesan } : {}) });
    }

    if (metode === "POST" && jalur === "/api/wa/putus") {
      const badan = await bacaBadan(req);
      // Penegasan diminta ulang di sisi server, bukan hanya di dialog
      // browser. Dialog bisa dilewati; ini tidak.
      if (badan.penegasan !== "PUTUS") {
        return balas(res, 400, {
          ok: false,
          pesan: "Pemutusan tautan membutuhkan penegasan yang tidak terkirim.",
        });
      }
      const h = await waha.putusTautan();
      return balas(res, 200, { ok: h.ok, ...(h.pesan ? { pesan: h.pesan } : {}) });
    }

    // --- kendali proses ---------------------------------------------------
    const cocokWorker = jalur.match(/^\/api\/worker\/(start|stop|restart)$/);
    if (metode === "POST" && cocokWorker) {
      const h = await sistem.kendalikanLayanan(cocokWorker[1] as sistem.AksiLayanan);
      return balas(res, 200, { ok: h.ok, pesan: h.keluaran || "selesai" });
    }

    const cocokEngine = jalur.match(/^\/api\/engine\/(start|stop|restart)$/);
    if (metode === "POST" && cocokEngine) {
      const h = await sistem.kendalikanKontainer(cocokEngine[1] as "start" | "stop" | "restart");
      return balas(res, 200, { ok: h.ok, pesan: h.keluaran || "selesai" });
    }

    balas(res, 404, { ok: false, pesan: "Alamat tidak dikenal." });
  } catch (error) {
    console.error("[panel] galat:", error);
    balas(res, 500, {
      ok: false,
      pesan: error instanceof Error ? error.message : "Galat tidak terduga.",
    });
  }
});

server.listen(konfig.PANEL_PORT, ALAMAT, () => {
  const kurang = periksaKonfig();

  console.log(`Panel Beregam siap di http://${ALAMAT}:${konfig.PANEL_PORT}`);
  console.log(`  engine   : ${konfig.WAHA_BASE_URL} (sesi "${konfig.WAHA_SESSION}")`);
  console.log(`  PESTA    : ${konfig.PESTA_BASE_URL || "(belum diisi)"}`);
  console.log(`  layanan  : ${konfig.NAMA_LAYANAN}`);

  if (kurang.length > 0) {
    console.warn("\nKonfigurasi belum lengkap - panel tetap jalan supaya bisa dipakai");
    console.warn("untuk memperbaikinya:");
    for (const k of kurang) console.warn(`  - ${k.kunci}: ${k.pesan}`);
  }
});

function hentikan(sinyal: string) {
  console.log(`menerima ${sinyal}, panel berhenti`);
  server.close(() => process.exit(0));
  // Kalau ada koneksi yang menggantung, jangan menahan restart selamanya.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => hentikan("SIGTERM"));
process.on("SIGINT", () => hentikan("SIGINT"));
