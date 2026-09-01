import { strict as assert } from "node:assert";

// presensi.ts berbagi konfigurasi proses dengan worker. Nilai berikut hanya
// memenuhi validasi saat unit test; tidak ada koneksi jaringan yang dibuat.
process.env.PESTA_BASE_URL = "https://example.invalid";
process.env.BEREGAM_API_KEY = "x".repeat(32);
process.env.WAHA_API_KEY = "uji-lokal";

const { slotPresensiPada, pesanPresensi, tokenMention, pilihMention } = await import("../dist/presensi.js");
const { validasiKonfigurasi, konfigurasiBawaan } = await import("../dist/presensi-store.js");

// Input UTC; WIB adalah UTC+7. Tanggal yang dipilih: Senin 2026-09-07 dan
// Jumat 2026-09-11. Pengujian ini tidak menyentuh WAHA atau mengirim pesan.
const utcUntukWib = (tanggal, waktu) => {
  const [jam, menit] = waktu.split(":").map(Number);
  return new Date(
    `${tanggal}T${String(jam - 7).padStart(2, "0")}:${String(menit).padStart(2, "0")}:00.000Z`
  );
};

const senin = "2026-09-07";
const jumat = "2026-09-11";
const sabtu = "2026-09-12";

for (const waktu of ["07:25", "07:29"]) {
  assert.equal(slotPresensiPada(utcUntukWib(senin, waktu))?.jenis, "datang");
  assert.equal(slotPresensiPada(utcUntukWib(jumat, waktu))?.jenis, "datang");
}

for (const waktu of ["16:00", "16:05", "16:10", "16:30"]) {
  assert.equal(slotPresensiPada(utcUntukWib(senin, waktu))?.jenis, "pulang");
}

for (const waktu of ["16:30", "16:35", "16:40", "17:00"]) {
  assert.equal(slotPresensiPada(utcUntukWib(jumat, waktu))?.jenis, "pulang");
}

assert.equal(slotPresensiPada(utcUntukWib(jumat, "16:00")), null);
assert.equal(slotPresensiPada(utcUntukWib(senin, "16:35")), null);
assert.equal(slotPresensiPada(utcUntukWib(sabtu, "07:25")), null);
assert.equal(slotPresensiPada(utcUntukWib(senin, "07:26")), null);

const contoh = slotPresensiPada(utcUntukWib(senin, "07:25"));
assert.ok(contoh);
assert.match(pesanPresensi(contoh), /PRESENSI DATANG/);
assert.match(pesanPresensi({ ...contoh, jenis: "pulang" }), /PRESENSI PULANG/);
assert.equal(
  tokenMention(["628111111111@c.us", "225512240709870@lid"]),
  "@628111111111 @225512240709870"
);
assert.equal(tokenMention(["bukan-nomor@c.us", "tanpa-suffix"]), "");

const peserta = [
  { id: "111@lid", phone: "628111111111", role: "participant", isSelf: false },
  { id: "222@lid", phone: "628222222222", role: "admin", isSelf: false },
  { id: "333@lid", phone: "628333333333", role: "superadmin", isSelf: true },
];
assert.deepEqual(
  pilihMention(peserta, { modeMention: "semua", nomorDipilih: [] }),
  ["111@lid", "222@lid"]
);
assert.deepEqual(
  pilihMention(peserta, { modeMention: "pilihan", nomorDipilih: ["628222222222"] }),
  ["222@lid"]
);
assert.deepEqual(
  pilihMention(peserta, { modeMention: "pilihan", nomorDipilih: ["628999999999"] }),
  []
);

const bawaan = konfigurasiBawaan();
assert.equal(bawaan.modeMention, "semua");
assert.equal(bawaan.aktif, true);
assert.match(bawaan.pesanDatang, /PRESENSI DATANG/);
const tersaring = validasiKonfigurasi({
  aktif: true,
  modeMention: "pilihan",
  nomorDipilih: ["628111111111", "628111111111"],
  pesanDatang: " Pesan pagi ",
  pesanPulang: " Pesan sore ",
});
assert.deepEqual(tersaring.nomorDipilih, ["628111111111"]);
assert.equal(tersaring.pesanDatang, "Pesan pagi");
assert.throws(
  () => validasiKonfigurasi({ ...tersaring, nomorDipilih: ["nomor-salah"] }),
  /tidak valid/
);

console.log("OK - jadwal, pilihan peserta, dan konfigurasi presensi lulus.");
