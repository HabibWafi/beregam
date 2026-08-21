import { config, jedaAcakMs } from "./config.js";
import { log, samarkanNomor } from "./logger.js";
import { gateway } from "./gateway.js";
import { ackOutbox, ambilOutbox, kirimHeartbeat, KontrakTidakCocok } from "./pesta.js";
import { CONTRACTS_VERSION, type OutboxItem } from "./generated/contracts.js";

/**
 * Worker pesan Beregam.
 *
 * Menjembatani PESTA (Hostinger) dengan engine WhatsApp (PC kantor).
 *
 * Yang menentukan seluruh rancangannya: PC ini TIDAK punya IP publik dan
 * TIDAK menerima koneksi masuk. Karena itu worker MENJEMPUT pekerjaan,
 * bukan menunggu dikirimi.
 */

const VERSI_WORKER = "1.0.0";
const MULAI = Date.now();

let berhenti = false;
let memegangSewa = false;
let botAktif = true;
let sedangMemproses = false;

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Backoff saat PESTA tidak terjangkau
//
// Internet kantor putus itu normal, bukan keadaan luar biasa. Worker tidak
// boleh mati karenanya, dan tidak boleh pula membanjiri jaringan dengan
// percobaan ulang setiap tiga detik.
// ---------------------------------------------------------------------------
const BACKOFF_MS = [3000, 6000, 12_000, 30_000, 60_000];
let gagalBerturut = 0;

function jedaBerikutnya(): number {
  if (gagalBerturut === 0) return config.POLL_INTERVAL_MS;
  const i = Math.min(gagalBerturut - 1, BACKOFF_MS.length - 1);
  return BACKOFF_MS[i] ?? 60_000;
}

// ---------------------------------------------------------------------------
// Mengirim satu pesan
// ---------------------------------------------------------------------------

/**
 * Memproses satu antrean, lengkap dengan aturan anti-blokir.
 *
 * Urutannya disengaja dan menirukan perilaku manusia: baca dulu, tampak
 * mengetik sebentar, baru balas. Jeda 3-8 detik itu bukan kelambatan yang
 * perlu dioptimalkan - ia yang menjaga nomor BPS tidak diblokir WhatsApp.
 */
async function kirimSatu(item: OutboxItem): Promise<void> {
  const nomor = samarkanNomor(item.waId);

  try {
    await gateway.sendSeen(item.waId);
    await gateway.startTyping(item.waId);

    const jeda = jedaAcakMs();
    await tidur(jeda);

    await gateway.stopTyping(item.waId);

    const teks = item.payload.text ?? "";
    if (!teks.trim()) {
      // Antrean tanpa isi tidak bisa dikirim dan tidak akan pernah bisa.
      // Ditandai gagal permanen supaya tidak diulang selamanya.
      await ackOutbox(item.id, { status: "failed", error: "Isi pesan kosong" });
      log.warn("antrean kosong dilewati", { id: item.id, kontak: nomor });
      return;
    }

    const waMessageId = await gateway.sendText(item.waId, teks);

    await ackOutbox(item.id, {
      status: "sent",
      ...(waMessageId ? { waMessageId } : {}),
    });

    log.info("pesan terkirim", {
      id: item.id,
      kontak: nomor,
      jedaDetik: Math.round(jeda / 100) / 10,
    });
  } catch (error) {
    const pesan = error instanceof Error ? error.message : String(error);

    // Indikator mengetik dimatikan walau gagal - kalau dibiarkan, warga
    // melihat "sedang mengetik" yang tidak pernah berujung pesan.
    await gateway.stopTyping(item.waId).catch(() => {});

    await ackOutbox(item.id, { status: "failed", error: pesan.slice(0, 500) });
    log.error("gagal mengirim pesan", { id: item.id, kontak: nomor, pesan });
  }
}

// ---------------------------------------------------------------------------
// Siklus polling
// ---------------------------------------------------------------------------

async function siklusOutbox(): Promise<void> {
  // Saklar darurat dan sewa kepemilikan sama-sama diputuskan PESTA.
  // Worker mematuhinya, tidak menawar.
  if (!botAktif || !memegangSewa) return;

  const items = await ambilOutbox(5);
  if (items.length === 0) return;

  log.debug(`mengambil ${items.length} antrean`);

  // BERURUTAN, tidak paralel. Mengirim serentak ke banyak nomor adalah pola
  // yang paling mudah dikenali sebagai bot, dan mengacaukan urutan
  // indikator mengetik.
  for (const item of items) {
    if (berhenti) break;
    await kirimSatu(item);
  }
}

async function siklusHeartbeat(): Promise<void> {
  const status = await gateway.sessionStatus();

  const balasan = await kirimHeartbeat({
    workerId: config.WORKER_ID,
    workerVersion: VERSI_WORKER,
    ...(status ? { waSessionStatus: status } : {}),
    uptime: Math.floor((Date.now() - MULAI) / 1000),
  });

  if (!balasan) return;

  const sewaBerubah = memegangSewa !== balasan.holdsLease;
  const botBerubah = botAktif !== balasan.botEnabled;

  memegangSewa = balasan.holdsLease;
  botAktif = balasan.botEnabled;

  if (sewaBerubah) {
    log.info(
      memegangSewa
        ? "worker ini memegang sewa - mulai memproses antrean"
        : "sewa dipegang worker lain - berhenti memproses, hanya memantau"
    );
  }
  if (botBerubah) {
    log.info(botAktif ? "bot dinyalakan dari admin panel" : "bot DIMATIKAN dari admin panel");
  }
  if (balasan.maintenanceRan) {
    log.debug("pemeliharaan dijalankan server");
  }
}

// ---------------------------------------------------------------------------
// Loop utama
// ---------------------------------------------------------------------------

async function jalan(): Promise<void> {
  log.info("worker Beregam mulai", {
    workerId: config.WORKER_ID,
    versi: VERSI_WORKER,
    kontrak: CONTRACTS_VERSION,
    pesta: config.PESTA_BASE_URL,
    engine: config.WAHA_BASE_URL,
  });

  // Heartbeat pertama dijalankan lebih dulu supaya sewa dan saklar bot
  // sudah diketahui sebelum antrean pertama diambil.
  try {
    await siklusHeartbeat();
  } catch (error) {
    if (error instanceof KontrakTidakCocok) throw error;
    log.warn("heartbeat pertama gagal", {
      pesan: error instanceof Error ? error.message : String(error),
    });
  }

  let heartbeatBerikutnya = Date.now() + config.HEARTBEAT_INTERVAL_MS;

  while (!berhenti) {
    sedangMemproses = true;
    try {
      if (Date.now() >= heartbeatBerikutnya) {
        await siklusHeartbeat();
        heartbeatBerikutnya = Date.now() + config.HEARTBEAT_INTERVAL_MS;
      }

      await siklusOutbox();

      if (gagalBerturut > 0) {
        log.info("sambungan ke PESTA pulih");
        gagalBerturut = 0;
      }
    } catch (error) {
      if (error instanceof KontrakTidakCocok) throw error;

      gagalBerturut += 1;
      const pesan = error instanceof Error ? error.message : String(error);

      // Hanya dicatat pada kegagalan pertama dan setiap kelipatan sepuluh.
      // Internet putus sepuluh menit tidak perlu menghasilkan dua ratus
      // baris log yang sama.
      if (gagalBerturut === 1 || gagalBerturut % 10 === 0) {
        log.warn(`PESTA tidak terjangkau (percobaan ke-${gagalBerturut})`, { pesan });
      }
    } finally {
      sedangMemproses = false;
    }

    await tidur(jedaBerikutnya());
  }
}

// ---------------------------------------------------------------------------
// Berhenti dengan rapi
//
// systemd mengirim SIGTERM saat restart. Tanpa penanganan ini, pesan yang
// sedang dikirim bisa terpotong di tengah dan barisnya tertinggal berstatus
// `locked` sampai pemeliharaan membebaskannya dua menit kemudian.
// ---------------------------------------------------------------------------
async function hentikan(sinyal: string): Promise<void> {
  if (berhenti) return;
  berhenti = true;
  log.info(`menerima ${sinyal}, menyelesaikan pekerjaan yang sedang jalan...`);

  const batas = Date.now() + 20_000;
  while (sedangMemproses && Date.now() < batas) {
    await tidur(200);
  }

  log.info("worker berhenti");
  process.exit(0);
}

process.on("SIGTERM", () => void hentikan("SIGTERM"));
process.on("SIGINT", () => void hentikan("SIGINT"));

process.on("unhandledRejection", (alasan) => {
  log.error("promise tidak tertangani", {
    pesan: alasan instanceof Error ? alasan.message : String(alasan),
  });
});

jalan().catch((error) => {
  if (error instanceof KontrakTidakCocok) {
    log.error("VERSI KONTRAK API TIDAK COCOK - worker berhenti");
    log.error(error.message);
    log.error("Perbaiki dengan: npm run contracts:sync && npm run build");
    process.exit(2);
  }

  log.error("worker berhenti karena galat fatal", {
    pesan: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
