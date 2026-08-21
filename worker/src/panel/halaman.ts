/**
 * Halaman panel kendali.
 *
 * Satu berkas HTML utuh tanpa berkas pendukung dan tanpa pustaka luar.
 * Alasannya sama dengan aturan dependency di PESTA: panel ini harus tetap
 * bisa dibuka saat PC kantor tidak punya internet - dan saat tidak punya
 * internet itulah panel paling dibutuhkan. CDN apa pun akan gagal muat
 * tepat pada saat yang paling salah.
 */
export const HALAMAN = String.raw`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel Beregam</title>
<style>
  :root {
    --bg: #0f172a; --kartu: #1e293b; --garis: #334155;
    --teks: #e2e8f0; --redup: #94a3b8;
    --hijau: #22c55e; --kuning: #eab308; --merah: #ef4444; --biru: #38bdf8;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f1f5f9; --kartu: #ffffff; --garis: #cbd5e1;
      --teks: #0f172a; --redup: #64748b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px;
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg); color: var(--teks);
  }
  .bungkus { max-width: 1100px; margin: 0 auto; }
  header { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: var(--redup); font-size: 13px; }
  .kisi { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); margin: 16px 0; }
  .kartu { background: var(--kartu); border: 1px solid var(--garis); border-radius: 10px; padding: 14px 16px; }
  .kartu h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--redup); margin: 0 0 10px; }
  .baris { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 14px; }
  .baris span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .titik { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: baseline; }
  .ok { background: var(--hijau); } .warn { background: var(--kuning); } .bad { background: var(--merah); } .mati { background: var(--redup); }
  .besar { font-size: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
  button {
    font: inherit; font-size: 14px; padding: 7px 13px; border-radius: 7px;
    border: 1px solid var(--garis); background: var(--kartu); color: var(--teks); cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: var(--biru); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.utama { background: var(--biru); border-color: var(--biru); color: #04121e; font-weight: 600; }
  button.bahaya { border-color: var(--merah); color: var(--merah); }
  .tombol { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  input[type=text] {
    font: inherit; padding: 7px 10px; border-radius: 7px; width: 100%;
    border: 1px solid var(--garis); background: var(--bg); color: var(--teks);
  }
  pre {
    background: var(--bg); border: 1px solid var(--garis); border-radius: 8px;
    padding: 12px; overflow: auto; max-height: 380px;
    font: 12px/1.5 ui-monospace, "Cascadia Code", Consolas, monospace;
    white-space: pre-wrap; word-break: break-word; margin: 0;
  }
  .tab { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .tab button.aktif { background: var(--biru); border-color: var(--biru); color: #04121e; }
  .catatan { font-size: 13px; color: var(--redup); margin-top: 8px; }
  .peringatan {
    border-left: 3px solid var(--kuning); background: color-mix(in srgb, var(--kuning) 10%, transparent);
    padding: 10px 13px; border-radius: 0 8px 8px 0; margin-bottom: 14px; font-size: 14px;
  }
  .galat { border-left-color: var(--merah); background: color-mix(in srgb, var(--merah) 10%, transparent); }
  .kode {
    font: 600 30px/1.3 ui-monospace, Consolas, monospace; letter-spacing: .18em;
    text-align: center; padding: 16px; background: var(--bg);
    border: 1px dashed var(--biru); border-radius: 9px; margin: 12px 0;
  }
  img.qr { display: block; width: 260px; height: 260px; margin: 12px auto; background: #fff; padding: 8px; border-radius: 9px; }
  footer { color: var(--redup); font-size: 12px; margin-top: 22px; text-align: center; }
</style>
</head>
<body>
<div class="bungkus">

  <header>
    <h1>Panel Beregam</h1>
    <span class="sub" id="jam">memuat...</span>
  </header>
  <div class="sub">Bot WhatsApp BPS Kabupaten Musi Rawas - kendali lokal di PC kantor</div>

  <div id="kekurangan"></div>

  <div class="kisi">
    <div class="kartu">
      <h2>WhatsApp</h2>
      <div class="besar" id="wa-status">-</div>
      <div class="baris"><span>Nomor tertaut</span><span id="wa-nomor">-</span></div>
      <div class="baris"><span>Engine</span><span id="wa-engine">-</span></div>
      <div class="tombol">
        <button class="utama" id="btn-pairing">Tautkan dengan kode</button>
        <button id="btn-qr">Tautkan dengan QR</button>
      </div>
      <div class="tombol">
        <button id="btn-sesi-mulai">Mulai sesi</button>
        <button id="btn-sesi-henti">Hentikan sesi</button>
        <button class="bahaya" id="btn-putus">Putuskan tautan</button>
      </div>
      <div id="wa-hasil"></div>
    </div>

    <div class="kartu">
      <h2>Worker pesan</h2>
      <div class="besar" id="wk-status">-</div>
      <div class="baris"><span>Sejak</span><span id="wk-sejak">-</span></div>
      <div class="baris"><span>Pemegang giliran kirim</span><span id="wk-sewa">-</span></div>
      <div class="tombol">
        <button id="btn-wk-restart">Nyalakan ulang</button>
        <button id="btn-wk-start">Nyalakan</button>
        <button id="btn-wk-stop">Matikan</button>
      </div>
    </div>

    <div class="kartu">
      <h2>Engine (kontainer)</h2>
      <div class="besar" id="kn-status">-</div>
      <div class="baris"><span>Sejak</span><span id="kn-sejak">-</span></div>
      <div class="baris"><span>Pernah restart</span><span id="kn-restart">-</span></div>
      <div class="tombol">
        <button id="btn-kn-restart">Nyalakan ulang</button>
        <button id="btn-kn-start">Nyalakan</button>
        <button id="btn-kn-stop">Matikan</button>
      </div>
    </div>

    <div class="kartu">
      <h2>Sambungan ke PESTA</h2>
      <div class="besar" id="ps-status">-</div>
      <div class="baris"><span>Waktu tempuh</span><span id="ps-latensi">-</span></div>
      <div class="baris"><span>Saklar bot</span><span id="ps-saklar">-</span></div>
      <div class="baris"><span>Peringatan terbuka</span><span id="ps-alert">-</span></div>
      <div id="ps-pesan"></div>
    </div>

    <div class="kartu">
      <h2>Antrean pesan</h2>
      <div class="baris"><span>Menunggu kirim</span><span id="ob-pending">-</span></div>
      <div class="baris"><span>Sedang dikirim</span><span id="ob-locked">-</span></div>
      <div class="baris"><span>Gagal</span><span id="ob-failed">-</span></div>
      <div class="baris"><span>Terkirim (total)</span><span id="ob-sent">-</span></div>
      <div class="baris"><span>Antrean tertua</span><span id="ob-tertua">-</span></div>
    </div>

    <div class="kartu">
      <h2>Percakapan hari ini</h2>
      <div class="baris"><span>Pesan masuk</span><span id="pc-masuk">-</span></div>
      <div class="baris"><span>Pesan keluar</span><span id="pc-keluar">-</span></div>
      <div class="baris"><span>Sesi berjalan</span><span id="pc-sesi">-</span></div>
      <div class="baris"><span>Dipegang petugas</span><span id="pc-manual">-</span></div>
      <div class="catatan">Sesi yang dipegang petugas berarti bot sengaja diam untuk kontak itu.</div>
    </div>

    <div class="kartu">
      <h2>Mesin</h2>
      <div class="baris"><span>Hidup sejak</span><span id="ms-uptime">-</span></div>
      <div class="baris"><span>Memori</span><span id="ms-memori">-</span></div>
      <div class="baris"><span>Penyimpanan</span><span id="ms-disk">-</span></div>
    </div>
  </div>

  <div class="kartu">
    <h2>Log</h2>
    <div class="tab">
      <button data-log="worker" class="aktif">Worker pesan</button>
      <button data-log="engine">Engine WhatsApp</button>
      <button id="btn-log-segar" style="margin-left:auto">Segarkan</button>
    </div>
    <pre id="log">memuat...</pre>
  </div>

  <footer>
    Panel hanya mendengarkan di 127.0.0.1 - tidak bisa dibuka dari komputer lain di jaringan kantor.
  </footer>
</div>

<script>
const $ = (id) => document.getElementById(id);
let logAktif = "worker";
let sibuk = false;

function titik(kelas, teks) {
  return '<span class="titik ' + kelas + '"></span>' + teks;
}

function waktuRelatif(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  const detik = Math.floor((Date.now() - d.getTime()) / 1000);
  if (detik < 0) return "sebentar lagi";
  if (detik < 60) return detik + " detik lalu";
  if (detik < 3600) return Math.floor(detik / 60) + " menit lalu";
  if (detik < 86400) return Math.floor(detik / 3600) + " jam lalu";
  return Math.floor(detik / 86400) + " hari lalu";
}

function durasi(detik) {
  if (detik === null || detik === undefined) return "-";
  if (detik < 60) return detik + " detik";
  if (detik < 3600) return Math.floor(detik / 60) + " menit";
  return Math.floor(detik / 3600) + " jam";
}

async function ambil(jalur, opsi) {
  const res = await fetch(jalur, opsi);
  return res.json();
}

// --- status berkala ------------------------------------------------------
async function segarkan() {
  let d;
  try {
    d = await ambil("/api/status");
  } catch {
    $("jam").textContent = "panel kehilangan sambungan ke dirinya sendiri";
    return;
  }

  $("jam").textContent = "diperbarui " + new Date().toLocaleTimeString("id-ID");

  // Kekurangan konfigurasi
  const kk = d.kekurangan || [];
  $("kekurangan").innerHTML = kk.length === 0 ? "" :
    '<div class="peringatan galat"><b>Konfigurasi belum lengkap.</b><br>' +
    kk.map(k => "<code>" + k.kunci + "</code> - " + k.pesan).join("<br>") +
    '<br><span class="catatan">Perbaiki di berkas <code>worker/.env</code>, lalu nyalakan ulang worker.</span></div>';

  // WhatsApp
  const w = d.wa || {};
  if (!w.ada) {
    $("wa-status").innerHTML = titik("mati", w.pesan ? "Engine bermasalah" : "Belum tertaut");
  } else if (w.status === "WORKING") {
    $("wa-status").innerHTML = titik("ok", "Tersambung");
  } else if (w.status === "SCAN_QR_CODE") {
    $("wa-status").innerHTML = titik("warn", "Menunggu ditautkan");
  } else if (w.status === "FAILED") {
    $("wa-status").innerHTML = titik("bad", "Gagal");
  } else {
    $("wa-status").innerHTML = titik("warn", w.status || "Tidak diketahui");
  }
  $("wa-nomor").textContent = w.nomor ? "+" + w.nomor + (w.namaAkun ? " (" + w.namaAkun + ")" : "") : "-";
  $("wa-engine").textContent = d.engine ? d.engine.engine + " " + d.engine.versi : "-";

  // Worker
  const wk = d.worker || {};
  $("wk-status").innerHTML = wk.aktif ? titik("ok", "Jalan") : titik("bad", wk.keadaan || "Mati");
  $("wk-sejak").textContent = wk.sejak || "-";

  // Kontainer
  const kn = d.kontainer || {};
  if (!kn.ada) $("kn-status").innerHTML = titik("bad", "Tidak ada");
  else if (kn.jalan && kn.kesehatan === "healthy") $("kn-status").innerHTML = titik("ok", "Sehat");
  else if (kn.jalan) $("kn-status").innerHTML = titik("warn", kn.kesehatan);
  else $("kn-status").innerHTML = titik("bad", "Mati");
  $("kn-sejak").textContent = kn.sejak ? waktuRelatif(kn.sejak) : "-";
  $("kn-restart").textContent = kn.ada ? kn.jumlahRestart + " kali" : "-";

  // PESTA
  const p = d.pesta || {};
  $("ps-status").innerHTML = p.terjangkau ? titik("ok", "Terhubung") : titik("bad", "Terputus");
  $("ps-latensi").textContent = p.latensiMs ? p.latensiMs + " ms" : "-";
  $("ps-pesan").innerHTML = p.pesan ? '<div class="peringatan' + (p.terjangkau ? '' : ' galat') + '">' + p.pesan + '</div>' : "";
  $("ps-saklar").innerHTML = p.terjangkau
    ? (p.botEnabled ? titik("ok", "Menyala") : titik("warn", "DIMATIKAN dari admin"))
    : "-";
  $("ps-alert").textContent = p.alertTerbuka === undefined ? "-" : p.alertTerbuka;
  $("wk-sewa").textContent = p.activeWorkerId || "-";

  // Antrean
  const ob = p.outbox || {};
  $("ob-pending").textContent = ob.pending ?? "-";
  $("ob-locked").textContent = ob.locked ?? "-";
  $("ob-failed").textContent = ob.failed ?? "-";
  $("ob-sent").textContent = ob.sent ?? "-";
  $("ob-tertua").textContent = durasi(ob.tertuaDetik);

  // Percakapan
  const ph = p.pesanHarian || {}, ss = p.sesi || {};
  $("pc-masuk").textContent = ph.masukHariIni ?? "-";
  $("pc-keluar").textContent = ph.keluarHariIni ?? "-";
  $("pc-sesi").textContent = ss.total ?? "-";
  $("pc-manual").textContent = ss.manual ?? "-";

  // Mesin
  const m = d.mesin || {};
  $("ms-uptime").textContent = m.uptime || "-";
  $("ms-memori").textContent = m.memori || "-";
  $("ms-disk").textContent = m.disk || "-";
}

// --- tindakan ------------------------------------------------------------
async function tindakan(jalur, badan, tombol) {
  if (sibuk) return;
  sibuk = true;
  const teksAsli = tombol ? tombol.textContent : null;
  if (tombol) { tombol.disabled = true; tombol.textContent = "menunggu..."; }
  try {
    const hasil = await ambil(jalur, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badan || {}),
    });
    return hasil;
  } catch (e) {
    return { ok: false, pesan: "Panel tidak menjawab: " + e.message };
  } finally {
    sibuk = false;
    if (tombol) { tombol.disabled = false; tombol.textContent = teksAsli; }
    segarkan();
  }
}

function tampilHasil(html) { $("wa-hasil").innerHTML = html; }

$("btn-pairing").onclick = async (e) => {
  const nomor = prompt(
    "Nomor WhatsApp yang akan ditautkan.\n\nTulis lengkap dengan kode negara, tanpa tanda apa pun.\nContoh: 6285169881015",
    "6285169881015"
  );
  if (!nomor) return;
  tampilHasil('<div class="catatan">Meminta kode ke engine...</div>');
  const h = await tindakan("/api/wa/pairing", { nomor }, e.target);
  if (h && h.ok) {
    tampilHasil(
      '<div class="kode">' + h.kode + '</div>' +
      '<div class="catatan">Di HP: <b>WhatsApp -> Perangkat Tertaut -> Tautkan Perangkat -> ' +
      'Tautkan dengan nomor telepon</b>, lalu masukkan kode di atas. ' +
      'Kode berlaku sekitar satu menit.</div>'
    );
  } else {
    tampilHasil('<div class="peringatan galat">' + ((h && h.pesan) || "Gagal meminta kode.") + '</div>');
  }
};

$("btn-qr").onclick = async (e) => {
  tampilHasil('<div class="catatan">Meminta QR ke engine...</div>');
  const h = await tindakan("/api/wa/qr", {}, e.target);
  if (h && h.ok) {
    tampilHasil(
      '<img class="qr" alt="Kode QR untuk menautkan WhatsApp" src="' + h.dataUrl + '">' +
      '<div class="catatan">Di HP: <b>WhatsApp -> Perangkat Tertaut -> Tautkan Perangkat</b>, ' +
      'lalu pindai kode di atas. QR berganti tiap 20 detik - tekan tombolnya lagi kalau kedaluwarsa.</div>'
    );
  } else {
    tampilHasil('<div class="peringatan galat">' + ((h && h.pesan) || "QR belum tersedia.") + '</div>');
  }
};

$("btn-sesi-mulai").onclick = (e) => tindakan("/api/wa/mulai", {}, e.target);
$("btn-sesi-henti").onclick = (e) => tindakan("/api/wa/henti", {}, e.target);

$("btn-putus").onclick = async (e) => {
  const jawab = prompt(
    "MEMUTUS TAUTAN WHATSAPP\n\n" +
    "Setelah ini bot berhenti total sampai ada yang menautkan ulang, dan itu butuh HP " +
    "yang memegang nomornya.\n\n" +
    "Ketik PUTUS untuk melanjutkan."
  );
  if (jawab !== "PUTUS") return;
  const h = await tindakan("/api/wa/putus", { penegasan: "PUTUS" }, e.target);
  tampilHasil(
    h && h.ok
      ? '<div class="peringatan">Tautan diputus. Tautkan ulang dengan tombol di atas.</div>'
      : '<div class="peringatan galat">' + ((h && h.pesan) || "Gagal memutus tautan.") + '</div>'
  );
};

$("btn-wk-restart").onclick = (e) => tindakan("/api/worker/restart", {}, e.target);
$("btn-wk-start").onclick = (e) => tindakan("/api/worker/start", {}, e.target);
$("btn-wk-stop").onclick = (e) => tindakan("/api/worker/stop", {}, e.target);
$("btn-kn-restart").onclick = (e) => tindakan("/api/engine/restart", {}, e.target);
$("btn-kn-start").onclick = (e) => tindakan("/api/engine/start", {}, e.target);
$("btn-kn-stop").onclick = (e) => tindakan("/api/engine/stop", {}, e.target);

// --- log -----------------------------------------------------------------
async function muatLog() {
  $("log").textContent = "memuat...";
  try {
    const d = await ambil("/api/log?sumber=" + logAktif);
    $("log").textContent = d.isi || "(kosong)";
    $("log").scrollTop = $("log").scrollHeight;
  } catch {
    $("log").textContent = "gagal memuat log";
  }
}

document.querySelectorAll(".tab button[data-log]").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tab button[data-log]").forEach((x) => x.classList.remove("aktif"));
    b.classList.add("aktif");
    logAktif = b.dataset.log;
    muatLog();
  };
});
$("btn-log-segar").onclick = muatLog;

segarkan();
muatLog();
setInterval(segarkan, 5000);
</script>
</body>
</html>`;
