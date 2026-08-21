# Beregam

**Bot WhatsApp & sistem inbox layanan BPS Kabupaten Musi Rawas.**

Repositori ini berisi bagian Beregam yang **berjalan di PC kantor** dan
tidak pernah ikut ter-deploy ke Hostinger.

Bagian server — route API, admin panel, dan logika bot — ada di repositori
lain: [`HabibWafi/pesta`](https://github.com/HabibWafi/pesta).

---

## Kenapa dipisah jadi dua repositori

Pembagiannya mengikuti target deploy, bukan bahasa pemrograman:

| Repositori | Isi | Jalan di mana |
|---|---|---|
| `pesta` | Website PESTA + `api/beregam/*` + `admin/beregam/*` + `lib/beregam/*` | Hostinger Business |
| `beregam` *(ini)* | `worker/`, `ai-worker/`, `infra/`, `docs/` | PC kantor (WSL2) |

Keuntungan langsung: butir checklist go-live *"folder `worker/` dan
`ai-worker/` tidak ikut ter-deploy"* terpenuhi dengan sendirinya.

---

## Struktur

```
beregam/
├── worker/        Worker pesan (Node.js/TypeScript) — polling outbox PESTA
├── ai-worker/     AI worker (Python) — pencarian semantik, Fase 2
├── infra/         docker-compose OpenWA, .wslconfig, SETUP-PC.md
└── docs/          Rancangan, panduan implementasi, runbook, SOP
```

---

## Arsitektur singkat

> Semua koneksi berasal **dari** PC **ke** internet. PC tidak pernah
> menerima koneksi masuk.

```
PC KANTOR (WSL2)                     HOSTINGER (bpskabmusirawas.com)
  OpenWA (baileys)  ──webhook──▶       POST /api/beregam/webhook
  127.0.0.1:2785                              │
      ▲                                       ▼
      │ kirim lokal                     BeregamService (router intent)
  Worker pesan  ────polling────▶              │
  AI worker     ────polling────▶        MySQL + Admin PESTA
```

PESTA **tidak pernah** mengirim pesan WhatsApp. Ia menulis satu baris ke
`beregam_outbox`; worker di PC yang mengambil dan mengirimkannya.

Prinsip kedua yang mengendalikan seluruh sistem:

> **Model untuk bahasa, kode untuk logika.** Model AI tidak pernah
> menghasilkan, mengubah, atau menghitung angka statistik.

---

## Yang sengaja TIDAK di-backup

**Kredensial sesi WhatsApp.** Berkas itu setara kunci untuk menyamar sebagai
WhatsApp resmi BPS. Menyalinnya ke drive cadangan menciptakan liabilitas
keamanan yang jauh lebih besar daripada nilai 2 menit yang dihemat.

Pemulihan bukan *restore*, melainkan **pasang lalu tautkan ulang** lewat
pairing code dari HP — sekitar 2 menit.

---

## Dokumen

| Berkas | Isi |
|---|---|
| `docs/plan.docx` | Rancangan utama: keputusan final, 17 celah, kelangsungan layanan 3 lapis |
| `docs/BEREGAM-Panduan-Implementasi-NEXTJS.md` | Panduan teknis rinci (skema, kontrak API, desain percakapan) |
| `docs/beregam-diagram-alur_1.html` | ⚠️ **USANG** — menyebut "PESTA Laravel". Disimpan sebagai arsip saja |

---

## Status

| Tahap | Isi | Kondisi |
|---|---|---|
| 0 | Repositori disiapkan | Selesai |
| 8 | Infrastruktur PC: `infra/` | Berkas siap, **menunggu pemasangan di PC** |
| 9 | Skema & route Beregam di repo `pesta` | Belum |
| 10 | Worker pesan (`worker/`) | Belum |
| 11 | Inbox petugas | Belum |
| 12 | AI worker (`ai-worker/`) | Belum |

**Langkah berikutnya:** ikuti [`infra/SETUP-PC.md`](infra/SETUP-PC.md)
berurutan. WSL2 dan Docker belum terpasang di PC ini, dan keduanya butuh
hak administrator serta restart.

Jangan lewati **langkah 9 - uji cabut kabel listrik**. Itu satu-satunya cara
membuktikan bot benar-benar pulih sendiri setelah mati lampu.
