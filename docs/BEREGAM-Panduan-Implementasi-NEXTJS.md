# BEREGAM — Panduan Implementasi Lengkap

**WhatsApp Bot & Asisten Layanan BPS Kabupaten Musi Rawas**

Versi Final (Next.js) · Agustus 2026
Menggantikan seluruh versi sebelumnya. Dokumen ini berdiri sendiri.

---

## Stack Sasaran

| Komponen | Teknologi |
|---|---|
| Web PESTA | **Next.js (App Router) + TypeScript** |
| Deploy | **Hostinger Business, runtime Node.js** |
| Database | **MySQL di Hostinger** (host yang sama) |
| ORM | **Drizzle ORM** (dialek MySQL) |
| Auth admin | Sudah ada (login sederhana), akan diperluas |
| Engine WhatsApp | WAHA (NOWEB) di PC kantor |
| Worker pesan | Node.js di PC kantor |
| AI worker | Python di PC kantor |

**PC kantor:** Intel i7-12700F · RAM 16 GB · GTX 1630 4 GB VRAM

---

## Daftar Isi

1. [Ringkasan Keputusan](#1-ringkasan-keputusan)
2. [Realitas Perangkat](#2-realitas-perangkat)
3. [Peta Fase](#3-peta-fase)
4. [Arsitektur](#4-arsitektur)
5. [Struktur Folder](#5-struktur-folder)
6. [Prasyarat & Persiapan](#6-prasyarat--persiapan)
7. [Skema Database](#7-skema-database)
8. [Kontrak API](#8-kontrak-api)
9. [Desain Percakapan](#9-desain-percakapan)
10. [Ambil Alih Petugas](#10-ambil-alih-petugas)
11. [Pagar Pengaman AI](#11-pagar-pengaman-ai)
12. [Jalur Upgrade Perangkat](#12-jalur-upgrade-perangkat)
13. [Tahapan Pengerjaan](#13-tahapan-pengerjaan)
14. [Prompt Claude Code](#14-prompt-claude-code)
15. [Checklist Go-Live](#15-checklist-go-live)
16. [Metrik](#16-metrik)
17. [Jalur Migrasi Gateway](#17-jalur-migrasi-gateway)
18. [Kesalahan yang Harus Dihindari](#18-kesalahan-yang-harus-dihindari)

---

## 1. Ringkasan Keputusan

| Aspek | Keputusan | Alasan |
|---|---|---|
| Framework | **Tetap Next.js, jangan bangun ulang** | Modul bot bersifat aditif; menulis ulang backend layanan publik yang sudah jalan = risiko besar tanpa imbalan |
| Engine WhatsApp | WAHA, engine **NOWEB** | Gratis penuh sejak v2026.6.1, tanpa Chromium (±300–500 MB RAM) |
| Lokasi engine | PC kantor, WSL2 + Docker Engine | Nol biaya infrastruktur, data tidak keluar instansi |
| Pola komunikasi | Webhook keluar + **outbox polling** | PC tidak perlu IP publik, port forwarding, maupun tunnel |
| Pemeliharaan | **Dipicu worker**, bukan cron | Worker sudah memanggil server tiap 3 detik |
| Logic bot fase awal | Menu bernomor (state machine), **bukan AI** | Nol biaya, deterministik, mudah diaudit |
| Balasan petugas | Lewat inbox di PESTA | Nomor WA tidak ada di HP siapa pun, semua terekam jejak auditnya |
| Angka statistik | **Selalu dari SQL, tidak pernah dari AI** | Ini instansi statistik |
| AI | Embedding dulu, LLM belakangan | Embedding tidak bisa mengarang; LLM ditunda sampai perangkat memadai |
| Chatbot website | API cloud, bukan model lokal | Halaman publik tidak boleh bergantung pada satu PC |
| Repo | **Worker ikut di repo PESTA** | Satu sumber kebenaran untuk tipe kontrak API |

**Dua prinsip yang mengendalikan seluruh dokumen:**

> Semua koneksi berasal **dari** PC **ke** internet. PC tidak pernah menerima koneksi masuk.

> **Model untuk bahasa, kode untuk logika.** Model AI tidak pernah menghasilkan, mengubah, atau menghitung angka.

### Keunggulan stack ini dibanding rancangan Laravel sebelumnya

1. **Satu bahasa untuk seluruh sistem.** Worker PC dan server PESTA sama-sama TypeScript. Kontrak API ditulis sekali sebagai skema Zod, dipakai kedua sisi. Salah ketik nama field ketahuan saat compile, bukan saat bot sudah jalan di produksi.
2. **MySQL di host yang sama.** Tidak ada latensi lintas jaringan maupun masalah connection pooling.
3. **Proses Node persisten.** Tidak ada batas eksekusi 30 detik, tidak perlu memikirkan `queue:work`.
4. **Aplikasi tidak pernah idle.** Worker memanggil tiap 3 detik, jadi proses Node tidak di-spin-down.
5. **Cron nyaris tidak diperlukan.** Pemeliharaan dipicu dari heartbeat worker.

---

## 2. Realitas Perangkat

```
Intel i7-12700F  ·  RAM 16 GB  ·  GTX 1630 4 GB VRAM
```

| | GTX 1630 | i7-12700F |
|---|---|---|
| Bandwidth memori | ~96 GB/s | ~51 GB/s (DDR4) / ~77 GB/s (DDR5) |
| Compute | ~1,8 TFLOPS, 512 core, tanpa tensor core | 12 core, 20 thread, AVX2 |

**Kesimpulan yang menentukan seluruh rencana:**

1. GPU hanya unggul tipis dari CPU untuk mengetik token, dan **kalah** untuk memproses konteks panjang (prefill). Jangan berharap lompatan besar dari memakai GPU.
2. Batas sesungguhnya adalah **RAM 16 GB**, bukan VRAM.
3. Yang benar-benar cocok untuk GPU ini adalah **model embedding** (~470 MB) — kecil, cepat, dan justru komponen paling berguna.
4. Model generatif 4B muat tapi pas-pasan. Model 8B berbahasa Indonesia (Sahabat-AI) hanya lewat CPU dan butuh RAM lebih besar.

**Upgrade paling berdampak bila nanti ada anggaran:** RAM ke 32 GB (~Rp700rb–1jt). Jauh lebih murah dan lebih membuka jalan daripada mengganti GPU.

### Alokasi memori

| Komponen | RAM |
|---|---|
| Windows + layanan | ~4 GB |
| WSL2 (dibatasi lewat `.wslconfig`) | 8 GB |
| — Docker WAHA (NOWEB) | ~400 MB |
| — Worker pesan (Node.js) | ~120 MB |
| — AI worker (Python + embedding) | ~1,5 GB |
| Cadangan | ~4 GB |

Batasi WSL eksplisit di `C:\Users\<user>\.wslconfig`. Tanpa itu WSL mengambil separuh RAM.

### Biaya

| Item | Biaya |
|---|---|
| WAHA, Docker Engine, WSL2, semua library | Rp0 |
| Hosting PESTA (Business plan) | Sudah dibayar |
| Nomor WA khusus + masa aktif | ~Rp150.000/tahun |
| Listrik PC 24/7 (~70W) | ~Rp70.000–100.000/bulan |

Jalur ini gratis **hanya kalau PC-nya mesin kantor**. Kalau PC pribadi di rumah, listriknya justru melebihi sewa VPS.

---

## 3. Peta Fase

| Fase | Isi | Butuh AI? | Perangkat sekarang | Durasi |
|---|---|---|---|---|
| **1** | Bot menu bernomor + inbox petugas | Tidak | Cukup | 4 minggu |
| **2** | Pencarian semantik atas basis pengetahuan | Embedding saja | Cukup | 2 minggu |
| **3** | Jalur SQL untuk pertanyaan angka statistik | Tidak | Cukup | 2–3 minggu |
| **4** | LLM parafrase & klasifikasi intent | Ya, lokal | Pas-pasan, tunda | — |
| **5** | Chatbot di website PESTA | API cloud | Tidak bergantung PC | 1–2 minggu |

**Fase 1–3 adalah inti sistem, dan semuanya jalan di perangkat sekarang.** Fase 4 memperhalus, bukan menyelamatkan.

### Kenapa urutannya begini

Fase 2 memakai embedding saja — mengambil jawaban yang sudah ditulis petugas, tidak menghasilkan teks baru, jadi **mustahil mengarang**. Waktu jawabnya di bawah 200 ms, bukan 20 detik.

Fase 4 baru masuk akal setelah kamu punya daftar nyata pertanyaan yang gagal dijawab di fase 1–3. Daftar itu bahan yang jauh lebih baik daripada menebak dari awal.

---

## 4. Arsitektur

```
                                  INTERNET
┌────────────────────────────┐              ┌──────────────────────────────────┐
│  PC KANTOR (WSL2)          │              │  HOSTINGER BUSINESS (Node.js)    │
│                            │  webhook     │  bpskabmusirawas.com             │
│  ┌──────────────────────┐  │  ─keluar─▶   │                                  │
│  │ WAHA (NOWEB)         │──┼──────────────│▶ POST /api/beregam/webhook       │
│  │ 127.0.0.1:3000       │  │              │        │                         │
│  └──────────────────────┘  │              │        ▼                         │
│           ▲                │              │  BeregamService (router intent)  │
│           │ kirim (lokal)  │              │   ├─ manual  → catat, jangan balas│
│  ┌──────────────────────┐  │  polling     │   ├─ menu    → FAQ langsung      │
│  │ Worker pesan (Node)  │──┼──keluar─▶    │   ├─ angka   → SQL indikator     │
│  │ + pemicu maintenance │  │              │   ├─ narasi  → antre AI job      │
│  └──────────────────────┘  │              │   └─ ragu    → inbox petugas     │
│                            │              │                                  │
│  ┌──────────────────────┐  │  polling     │  MySQL (host yang sama)          │
│  │ AI worker (Python)   │──┼──keluar─▶    │   beregam_outbox / ai_jobs / kb  │
│  │ - embedding di GPU   │  │              │                                  │
│  │ - indeks vektor      │  │              │  Admin PESTA (React)             │
│  │ - LLM (fase 4)       │  │              │   ├─ Inbox petugas               │
│  └──────────────────────┘  │              │   ├─ Kelola basis pengetahuan    │
└────────────────────────────┘              │   ├─ Kelola tabel indikator      │
                                            │   └─ Dashboard & laporan         │
                                            └──────────────────────────────────┘
```

### Alur satu pesan

1. Warga kirim WA → WAHA menerima → POST webhook ke PESTA
2. PESTA verifikasi HMAC → simpan pesan → **balas HTTP 200 dalam <1 detik**
3. `BeregamService` menentukan balasan → tulis ke `beregam_outbox`
4. Worker di PC polling `/api/beregam/outbox` tiap 3 detik → dapat item pending
5. Worker tunggu jeda acak 3–8 detik → kirim indikator "mengetik" → POST ke WAHA lokal
6. Worker ACK ke PESTA → status outbox jadi `sent`

**PESTA tidak pernah mengirim pesan WhatsApp.** Ia menulis satu baris ke tabel. Yang mengirim adalah worker di PC — dan worker itu yang datang mengambil, bukan sebaliknya.

### Kenapa outbox, bukan panggilan langsung

PESTA tidak bisa menjangkau PC. PC berada di balik NAT/CGNAT tanpa IP publik. Membalik arah lalu lintas menghilangkan kebutuhan tunnel, port forwarding, dan DDNS — sekaligus menghilangkan permukaan serangan. WAHA cukup bind ke `127.0.0.1` sehingga tidak dapat diakses siapa pun dari luar, bahkan dari jaringan kantor.

Pola yang sama dipakai untuk AI: PESTA menulis `beregam_ai_jobs`, AI worker yang menariknya.

### Pemeliharaan tanpa cron

Worker memanggil `POST /api/beregam/heartbeat` tiap 60 detik. Endpoint itu **sekaligus menjalankan tugas pemeliharaan** (buka kunci outbox macet, kembalikan sesi manual yang kedaluwarsa), dijaga kunci 60 detik agar tidak berjalan ganda.

Satu-satunya tugas yang tidak bisa dipicu worker adalah **mendeteksi worker mati** — pemicunya tidak boleh pihak yang sedang mati. Untuk itu, `GET /api/beregam/health` menjalankan pemeriksaan watchdog sebagai efek samping, dan endpoint itu di-ping UptimeRobot tiap 5 menit secara gratis. Cron hPanel tiap menit bisa ditambahkan sebagai lapisan kedua, tapi tidak wajib.

---

## 5. Struktur Folder

Worker ikut di repo PESTA supaya tipe kontrak API punya satu sumber kebenaran. Folder `worker/` dan `ai-worker/` tidak ikut ter-deploy ke Hostinger.

```
pesta/
├── app/
│   ├── api/beregam/
│   │   ├── webhook/route.ts
│   │   ├── outbox/route.ts
│   │   ├── outbox/[id]/ack/route.ts
│   │   ├── heartbeat/route.ts          ← + pemeliharaan
│   │   ├── health/route.ts             ← + watchdog, tanpa API key
│   │   ├── ai-jobs/route.ts
│   │   ├── ai-jobs/[id]/result/route.ts
│   │   ├── ai-heartbeat/route.ts
│   │   ├── kb/route.ts
│   │   └── kb/indexed/route.ts
│   └── (admin)/admin/beregam/
│       ├── page.tsx                    dashboard
│       ├── inbox/page.tsx
│       ├── inbox/[contactId]/page.tsx
│       ├── faq/page.tsx
│       ├── kb/page.tsx
│       ├── kb/gaps/page.tsx
│       ├── indikator/page.tsx
│       └── outbox/page.tsx
├── lib/beregam/
│   ├── config.ts
│   ├── contracts.ts                    ← skema Zod, DIPAKAI WORKER JUGA
│   ├── db/schema.ts                    ← Drizzle
│   ├── db/index.ts
│   ├── auth.ts                         ← helper verifikasi API key
│   ├── services/beregam-service.ts
│   ├── services/indikator-resolver.ts
│   ├── services/maintenance.ts
│   ├── drivers/gateway.ts              ← interface
│   ├── drivers/waha-driver.ts
│   └── drivers/cloud-api-driver.ts     ← stub
├── worker/                             ← Node.js, jalan di PC (tidak di-deploy)
│   ├── src/index.ts
│   ├── src/pesta.ts
│   ├── src/waha.ts
│   └── package.json
├── ai-worker/                          ← Python, jalan di PC (tidak di-deploy)
│   ├── src/main.py
│   └── requirements.txt
└── infra/
    ├── docker-compose.yml              ← WAHA
    ├── .wslconfig.example
    └── SETUP-PC.md
```

Worker mengimpor tipe dari `lib/beregam/contracts.ts` lewat path relatif. Di PC, cukup clone repo yang sama lalu jalankan `worker/` dan `ai-worker/`.

---

## 6. Prasyarat & Persiapan

### 6.1 Perangkat keras & jaringan
- [ ] PC kantor yang bisa menyala 24/7
- [ ] Koneksi internet kantor (tidak perlu IP publik)
- [ ] Akses BIOS untuk mengatur auto power-on

### 6.2 Akun & kredensial
- [ ] Nomor WhatsApp khusus (kartu baru, atas nama BPS, masa aktif panjang)
- [ ] Akses hPanel Hostinger (Node.js app, MySQL, subdomain, cron)
- [ ] Akses repositori PESTA
- [ ] Akun UptimeRobot (gratis)

### 6.3 Perangkat lunak di PC

| Software | Versi | Catatan |
|---|---|---|
| WSL2 + Ubuntu | 24.04 LTS | `wsl --install -d Ubuntu-24.04` |
| Docker Engine | terbaru | **Bukan Docker Desktop** — Engine berlisensi Apache 2.0, bebas isu lisensi untuk instansi |
| Node.js | 22 LTS | Worker pesan |
| Python | 3.11+ | AI worker (fase 2) |
| WAHA | `devlikeapro/waha` | Image publik, engine NOWEB |

### 6.4 Yang perlu diperiksa di PESTA sebelum mulai
- [ ] Versi Next.js dan apakah App Router atau Pages Router
- [ ] ORM yang sudah dipakai (kalau bukan Drizzle, ikuti yang sudah ada)
- [ ] Bentuk sistem login admin yang ada, dan apakah sudah punya kolom role
- [ ] Versi MySQL/MariaDB di Hostinger dan charset default

### 6.5 Keputusan yang harus final
1. **Nomor WA** — dianggap permanen. Warga akan menyimpannya. Kalau nanti migrasi ke Cloud API, nomor harus dihapus dulu dari WhatsApp reguler.
2. **Nama tampilan** — misalnya "BPS Musi Rawas".
3. **Cakupan layanan** — daftar final pertanyaan yang dijawab bot vs yang dilempar ke petugas.
4. **Siapa yang memantau inbox** setiap hari kerja.

---

## 7. Skema Database

Semua tabel prefix `beregam_`. **Buat semuanya sekaligus di awal**, termasuk yang baru dipakai fase 3–4.

> **Peringatan MySQL:** dengan charset `utf8mb4`, batas panjang index pada MySQL/MariaDB lama adalah 767 byte (191 karakter). Semua kolom yang di-index di bawah ini sudah dirancang pendek. Jangan menambahkan index pada kolom `varchar(200)` atau lebih tanpa memeriksa versi server dulu.

### `beregam_contacts` — F1
`id` bigint PK · `wa_id` varchar(64) UNIQUE · `phone` varchar(20) INDEX · `name` varchar(120) null · `is_blocked` boolean default false · `message_count` int default 0 · `first_seen_at` · `last_seen_at` · timestamps

### `beregam_sessions` — F1
`id` · `contact_id` FK unique cascade · `state` varchar(50) default 'idle' · **`mode` enum('bot','manual') default 'bot' INDEX** · `context` json null · `miss_count` tinyint default 0 · `expires_at` INDEX · timestamps

> `mode` adalah kunci inbox petugas. Saat `manual`, BeregamService berhenti membalas otomatis dan hanya mencatat pesan masuk. **Tanpa ini, warga menerima dua jawaban sekaligus.**

### `beregam_messages` — F1
`id` · `contact_id` FK INDEX cascade · `direction` enum('in','out') · `wa_message_id` varchar(120) null INDEX · `type` varchar(20) default 'text' · `body` text null · **`sent_by` FK users null** · **`source` enum('bot','faq','semantic','sql','ai','agent') null** · `raw` json null · `created_at`
Index gabungan: (`contact_id`, `id`)

> **Catatan PDP:** bot ini tidak boleh meminta NIK. Terapkan retensi: kosongkan `raw` yang lebih tua dari 90 hari.

### `beregam_outbox` — F1
`id` · `contact_id` FK cascade · `wa_id` varchar(64) · `type` varchar(20) · `payload` json · `status` enum('pending','locked','sent','failed') · `attempts` tinyint default 0 · `last_error` text null · `locked_at` null · `locked_by` varchar(64) null · `scheduled_at` · `sent_at` null · **`sent_by` FK users null**
Index gabungan: (`status`, `scheduled_at`)

### `beregam_handovers` — F1
`id` · `contact_id` FK cascade · **`channel` enum('wa','web') default 'wa'** · `reason` varchar(150) · `status` enum('open','claimed','resolved') INDEX · `assigned_to` FK users null · **`claimed_at` null** · `resolved_at` null · **`resolution_note` text null**

### `beregam_faq` — F1
`id` · `menu_key` varchar(20) null INDEX · `parent_key` varchar(20) null · `title` varchar(150) · `answer` text · `sort_order` int default 0 · `is_active` boolean default true

### `beregam_health` — F1
`id` tinyint PK=1 · `worker_last_seen_at` null · **`ai_worker_last_seen_at` null** · `waha_session_status` varchar(30) null · `meta` json null · `alerted_at` null · **`maintenance_ran_at` null** (kunci agar pemeliharaan tidak berjalan ganda)

### `beregam_kb` — F2
`id` · `title` varchar(200) · `content` text · `category` varchar(60) · `source_type` enum('faq','publikasi','prosedur','regulasi') · `source_url` varchar(300) null · `source_ref` varchar(200) null · `content_hash` varchar(64) INDEX · `is_active` boolean · `indexed_at` null

> Indeks vektornya **tidak** disimpan di sini — tinggal di PC sebagai berkas. Compute di tempat yang punya compute, data di tempat yang punya backup.

### `beregam_kb_hits` — F2
`id` · `kb_id` FK null (set null on delete) · `question` text · `score` decimal(5,4) · `was_used` boolean · `channel` enum('wa','web')

### `beregam_indikator` — F3
`id` · `kode` varchar(40) INDEX · `nama` varchar(200) · `satuan` varchar(40) · `wilayah_kode` varchar(20) INDEX · `wilayah_nama` varchar(100) · `tahun` smallint INDEX · `periode` varchar(20) null · `nilai` decimal(20,4) · `sumber_publikasi` varchar(200) · `catatan` text null · `verified_by` FK users null
UNIQUE: (`kode`, `wilayah_kode`, `tahun`, `periode`)

> **Isinya data terkurasi dan terverifikasi, bukan hasil scraping mentah.** Ini satu-satunya sumber angka yang boleh dikutip bot.

### `beregam_ai_jobs` — F2/F4
`id` · `contact_id` FK null · `channel` enum('wa','web') · `question` text · `intent` varchar(40) null · `mode` enum('embed','generate') · `context_used` json null · `status` enum('pending','locked','done','failed') INDEX · `result` text null · `score` decimal(5,4) null · `model` varchar(60) null · `latency_ms` int null · `error` text null · `locked_at` null

---

## 8. Kontrak API

Semua di `/api/beregam/*`. Route Handler Next.js dengan `export const dynamic = 'force-dynamic'` agar tidak di-cache.

Semua kecuali `/health` memverifikasi header `X-Beregam-Key` dengan perbandingan waktu-tetap (`crypto.timingSafeEqual`).

### Fase 1

| Endpoint | Pemanggil | Fungsi |
|---|---|---|
| `POST /webhook` | WAHA | Terima pesan, verifikasi HMAC, balas 200 cepat |
| `GET /outbox?limit=5` | Worker pesan | Ambil dan kunci antrean kirim |
| `POST /outbox/[id]/ack` | Worker pesan | Konfirmasi terkirim/gagal + backoff |
| `POST /heartbeat` | Worker pesan | Status hidup **+ jalankan pemeliharaan** |
| `GET /health` | UptimeRobot | Tanpa API key **+ jalankan watchdog** |

**Detail penting:**

- **Webhook** — verifikasi HMAC SHA-512 atas *raw body* (`await req.text()`, bukan `req.json()`) dengan `timingSafeEqual`. Abaikan pesan grup (`@g.us`), `fromMe: true`, dan `status@broadcast`. Deduplikasi berdasarkan `wa_message_id`. Wajib return 200 secepatnya.
- **GET outbox** — dalam satu transaksi Drizzle, ambil `status=pending` dan `scheduled_at <= now()` dengan `.for('update')`, ubah jadi `locked`.
- **ACK failed** — backoff 30 detik, 2 menit, 10 menit. Setelah 3 kali tetap gagal, buat handover.
- **Heartbeat** — selain mencatat status, jalankan `runMaintenance()` bila `maintenance_ran_at` lebih tua dari 60 detik.

### Fase 2–4

| Endpoint | Pemanggil | Fungsi |
|---|---|---|
| `GET /kb?since=<ts>` | AI worker | Tarik entri KB yang berubah |
| `POST /kb/indexed` | AI worker | Tandai entri sudah ter-indeks |
| `GET /ai-jobs?limit=3` | AI worker | Ambil dan kunci pekerjaan AI |
| `POST /ai-jobs/[id]/result` | AI worker | Kirim hasil; **response berisi teks final** |
| `POST /ai-heartbeat` | AI worker | Status AI worker + model aktif |

> `POST /ai-jobs/[id]/result` sengaja mengembalikan teks final di response-nya, agar worker tidak perlu menunggu siklus polling berikutnya. PESTA tetap satu-satunya pihak yang memutuskan apa yang dikirim.

### Admin (Server Action, bukan API key)

| Aksi | Fungsi |
|---|---|
| `pollMessages(contactId, afterId)` | Pesan baru sejak id tertentu, dipanggil tiap 5 detik |
| `replyToContact(contactId, text)` | Petugas kirim balasan → masuk outbox |
| `claimConversation(contactId)` | Ambil alih, `mode` → manual |
| `releaseConversation(contactId)` | Kembalikan ke bot |

> Karena proses Node persisten, SSE juga mungkin. **Tapi mulai dengan polling** — SSE di belakang proxy shared hosting kadang ter-buffer. Uji SSE sebagai peningkatan setelah fase 1 stabil, jangan sebagai fondasi.

---

## 9. Desain Percakapan

### 9.1 Menu utama

```
Halo! 👋 Saya *Beregam*, asisten layanan BPS Kabupaten Musi Rawas.

Silakan balas dengan *angka*:

1️⃣ Jam layanan & lokasi kantor
2️⃣ Permintaan data statistik
3️⃣ Konsultasi statistik
4️⃣ Publikasi & rilis terbaru
5️⃣ Pengaduan & saran
6️⃣ Bicara dengan petugas

Ketik *menu* kapan saja untuk kembali ke sini.
```

### 9.2 Aturan state machine

| Kondisi | Aksi |
|---|---|
| **`mode` = manual** | **Catat pesan saja. JANGAN balas apa pun.** |
| Kontak baru / sesi kedaluwarsa | Sapaan + menu utama, state → `main_menu` |
| Input `menu`, `0`, `batal`, `kembali` | Reset ke `main_menu` |
| Input `petugas`, `admin`, `manusia` | Eskalasi ke inbox petugas |
| Input angka valid di `main_menu` | Kirim jawaban FAQ atau masuk submenu |
| Input tidak dikenali (< 3×) | "Maaf, saya belum paham" + menu |
| Input tidak dikenali (3× berturut) | Eskalasi otomatis ke petugas |
| Di luar jam layanan | Tambahkan catatan: petugas membalas hari kerja berikutnya |
| Idle 30 menit | Sesi kedaluwarsa, percakapan berikutnya mulai dari sapaan |

### 9.3 Contoh form bertahap (menu 2)

| Giliran | State sebelum | Input warga | Disimpan ke `context` | State sesudah |
|---|---|---|---|---|
| 1 | `main_menu` | "2" | — | `data_nama` |
| 2 | `data_nama` | "Budi Santoso" | `nama` | `data_instansi` |
| 3 | `data_instansi` | "Universitas Sriwijaya" | `instansi` | `data_kebutuhan` |
| 4 | `data_kebutuhan` | "PDRB Musi Rawas 2024" | `kebutuhan` | `main_menu` |

Setelah giliran 4, bot membuat baris `beregam_handovers` dan petugas melihatnya lengkap di inbox.

> Setiap pesan masuk adalah request HTTP baru. Yang membuat percakapan terasa nyambung adalah kolom `state` yang dibaca sebelum menjawab dan ditulis ulang sesudahnya.

### 9.4 Router intent lengkap (setelah fase 3)

```
Pesan masuk
   │
   ├─ mode = manual? ──▶ catat saja, JANGAN balas. Tampilkan di inbox petugas.
   │
   ├─ kata kunci global (menu / 0 / batal / petugas) ──▶ tangani langsung
   │
   ├─ state = main_menu & input angka ──▶ FAQ (F1)
   │
   └─ teks bebas
        ├─ cocok pola indikator (F3) ──▶ SQL ──▶ template
        │
        ├─ pencarian semantik (F2) skor ≥ 0,72 ──▶ kirim jawaban KB apa adanya
        │
        ├─ skor 0,55–0,72 ──▶ tawarkan 2–3 kandidat, minta warga memilih
        │
        └─ skor < 0,55 ──▶ inbox petugas
```

Ambang batas di atas titik awal. Sesuaikan setelah melihat `beregam_kb_hits` selama sebulan.

### 9.5 Aturan anti-blokir (wajib)

1. Jeda acak **3–8 detik** sebelum setiap pengiriman
2. Indikator "mengetik" (`startTyping`) selama jeda, lalu `stopTyping`
3. Tandai sudah dibaca (`sendSeen`) sebelum membalas
4. **Tidak ada broadcast massal.** Bot hanya membalas, tidak pernah memulai
5. Maksimal 3 balasan per menit per nomor
6. Batas harian global 500 pesan keluar

### 9.6 Waktu tempuh satu balasan

| Tahap | Di mana | Durasi |
|---|---|---|
| Terima, simpan, putuskan, tulis outbox | PESTA | <1 detik |
| Worker menemukan baris pending | Polling PC | 0–3 detik |
| Jeda acak + indikator mengetik | Worker PC | 3–8 detik |
| Kirim ke WhatsApp | WAHA PC | <1 detik |

Total **4–12 detik**. Jeda itu memang disengaja.

---

## 10. Ambil Alih Petugas

Waktu petugas mengetik balasan di inbox, yang terjadi persis sama dengan waktu bot menjawab: satu baris masuk ke `beregam_outbox`, worker mengambilnya, WAHA mengirimkannya. **Tidak ada infrastruktur baru.**

| Kejadian | Aksi |
|---|---|
| Petugas klik "Ambil alih" | `mode` = manual, handover `claimed`, `assigned_to` diisi |
| Petugas membalas | Outbox dengan `sent_by` = user id, `source` = `agent` |
| Petugas klik "Selesai" | `mode` = bot, handover `resolved` + catatan |
| Tidak ada aktivitas 2 jam | Otomatis kembali ke `mode` = bot |
| Warga ketik "menu" saat manual | **Tetap manual.** Hanya petugas yang bisa melepas |
| Petugas lain mencoba membalas | **Ditolak** — validasi `assigned_to` = user login |

**Keuntungan yang tidak langsung kelihatan:** petugas tidak pernah perlu menyentuh HP atau PC yang memegang nomor WhatsApp. Nomor layanan tidak ada di HP siapa pun. Semua komunikasi lewat akun PESTA masing-masing, dan setiap balasan tercatat siapa pengirimnya. Untuk instansi, jejak audit ini nilainya besar.

---

## 11. Pagar Pengaman AI

Bot BPS yang mengarang angka statistik bukan bug teknis — itu kerusakan institusional.

1. **Model tidak boleh menghasilkan angka.** Semua angka dari `beregam_indikator` lewat SQL, disisipkan ke template oleh kode.
2. **Model hanya boleh memparafrase konteks yang diambil.** Tanpa dokumen cocok, jawabannya eskalasi, bukan improvisasi.
3. **Validasi keluaran di server sebelum dikirim:** tolak jawaban yang memuat digit yang tidak ada di konteks; tolak yang melebihi batas panjang.
4. **Setiap jawaban AI diberi penanda** `source` = `ai`, bisa ditinjau petugas.
5. **Timeout 20 detik.** Model lambat atau Ollama mati → langsung eskalasi.
6. **Temperature 0,1–0,3.** Kita butuh model yang patuh, bukan yang kreatif.
7. **Batasi konteks 2–3 chunk (800–1200 token), jangan 8 chunk.** Prefill titik lemah perangkat ini.

### Batas jujur model kecil

| Bisa diandalkan | Tidak bisa diandalkan |
|---|---|
| Klasifikasi intent | Aritmetika bertingkat |
| Ekstraksi entitas (tahun, wilayah, indikator) | Membandingkan angka |
| Parafrase dari konteks | Menyimpulkan tren |
| Menyusun kalimat dari data terstruktur | Menggabungkan 3+ dokumen |

Kalau warga tanya "naik berapa persen dari tahun lalu" — ambil dua angka dari database, **hitung di TypeScript**, lalu susun kalimatnya dengan template.

### Jebakan publikasi BPS

Publikasi kalian isinya tabel. Kalau PDF diekstrak jadi teks mengalir lalu di-embed, tabelnya berubah jadi bubur angka. **Pisahkan sejak tahap parsing:**

- **Narasi** (penjelasan, metodologi, definisi) → chunk → embed → RAG
- **Tabel** → baris terstruktur di `beregam_indikator` → SQL

---

## 12. Jalur Upgrade Perangkat

Semua lewat variabel lingkungan di AI worker:

```
AI_MODE=embedding_only          # embedding_only | embedding_plus_llm
EMBED_MODEL=intfloat/multilingual-e5-small
EMBED_DEVICE=cuda               # cuda | cpu
LLM_BACKEND=none                # none | ollama | openai_compatible
LLM_MODEL=
LLM_BASE_URL=
```

| Perangkat | `AI_MODE` | `LLM_BACKEND` | Model |
|---|---|---|---|
| Sekarang (16 GB, GTX 1630) | `embedding_only` | `none` | — |
| + RAM 32 GB | `embedding_plus_llm` | `ollama` | Qwen3 4B Q4_K_M |
| + GPU 8–12 GB VRAM | `embedding_plus_llm` | `ollama` | Sahabat-AI 8B Q4 |
| VPS / server ber-GPU | `embedding_plus_llm` | `openai_compatible` | bebas |

**Yang tidak pernah berubah:** skema tabel, kontrak API, BeregamService, admin panel, basis pengetahuan, dan indeks vektor (berkas, bisa disalin ke mesin lain apa adanya).

Ini alasan `beregam_ai_jobs` dibuat sejak fase 2 meskipun fase 2 belum memakai LLM: kontraknya sudah benar sejak awal.

---

## 13. Tahapan Pengerjaan

### FASE 1 — Bot & Inbox Petugas (4 minggu)

**Minggu 1 · Infrastruktur PC**

| # | Pekerjaan | Deliverable |
|---|---|---|
| 1.1 | WSL2 Ubuntu 24.04 + Docker Engine | `docker run hello-world` sukses |
| 1.2 | `.wslconfig` batasi memori 8 GB | Berkas di `C:\Users\<user>\` |
| 1.3 | `docker-compose.yml` WAHA NOWEB, bind `127.0.0.1` | Compose + `.env` |
| 1.4 | Scan QR nomor khusus | Session status `WORKING` |
| 1.5 | Uji kirim/terima manual via `curl` | Bukti pesan masuk & keluar |
| 1.6 | BIOS *Restore on AC Power Loss* → Power On | Foto setting BIOS |
| 1.7 | Auto-login Windows + Task Scheduler + systemd WSL | Rantai autostart utuh |
| 1.8 | Matikan sleep, hibernate, Fast Startup | |

> **Gerbang kualitas Minggu 1:** cabut kabel listrik PC. Colok lagi. Dalam 5 menit WAHA harus kembali `WORKING` tanpa disentuh manusia. Kalau belum, **jangan lanjut ke Minggu 2.**

**Minggu 2 · Fondasi PESTA**

| # | Pekerjaan |
|---|---|
| 2.1 | Skema Drizzle 11 tabel + migration |
| 2.2 | `contracts.ts` (Zod) + gateway interface + WahaDriver + stub CloudApiDriver |
| 2.3 | Route Handler webhook + HMAC + deduplikasi |
| 2.4 | Route Handler outbox, ai-jobs, heartbeat, health |
| 2.5 | Helper verifikasi API key |
| 2.6 | Seeder FAQ 6 menu |

**Minggu 3 · Logic & Worker**

| # | Pekerjaan |
|---|---|
| 3.1 | `BeregamService` state machine + pengecekan `mode` |
| 3.2 | Rate limiter per nomor |
| 3.3 | Worker pesan TypeScript |
| 3.4 | Worker autostart via systemd di WSL |
| 3.5 | Uji ujung ke ujung dari HP luar |

**Minggu 4 · Inbox, Pemantauan, Rilis**

| # | Pekerjaan |
|---|---|
| 4.1 | Inbox petugas + polling + ambil alih + balas |
| 4.2 | Dashboard + kelola FAQ + outbox |
| 4.3 | Pemeliharaan di heartbeat + watchdog di health |
| 4.4 | UptimeRobot ke `/api/beregam/health` tiap 5 menit |
| 4.5 | Uji internal 10–20 pegawai |
| 4.6 | SOP scan ulang QR untuk minimal 2 orang |
| 4.7 | Rilis terbatas + sosialisasi |

### FASE 2 — Pencarian Semantik (2 minggu)
Admin CRUD `beregam_kb` + endpoint sync · AI worker Python (embedding di GPU, indeks vektor lokal berbasis berkas) · integrasi ke router · isi KB 200–300 pasang tanya-jawab · halaman Celah Pengetahuan

### FASE 3 — Jalur Angka Statistik (2–3 minggu)
Admin CRUD `beregam_indikator` + impor CSV + verifikasi · parser publikasi (pisahkan narasi dan tabel) · `IndikatorResolver` + kamus sinonim + template · uji ketat pelacakan angka

### FASE 4 — LLM Lokal (ditunda)
**Prasyarat:** fase 2–3 berjalan minimal 2 bulan **dan** RAM 32 GB atau GPU ≥ 8 GB

### FASE 5 — Chatbot Website (1–2 minggu)
Widget chat + API cloud + KB yang sama + inbox yang sama + batas anggaran harian

---

## 14. Prompt Claude Code

Jalankan berurutan. Jangan gabungkan. Commit setiap selesai.

**Urutan:** P0 → P8 untuk Fase 1. P9–P10 inbox & admin. P11–P12 Fase 2. P13 Fase 3. P14 Fase 4 (tunda). P15 Fase 5. P16 dokumentasi.

---

### P0 — Bootstrap konteks

Jalankan **pertama**, di root repositori PESTA.

```
Saya akan menambahkan modul "Beregam" ke aplikasi Next.js ini (PESTA — website
pelayanan digital BPS Kabupaten Musi Rawas). Beregam adalah bot WhatsApp
sekaligus sistem inbox layanan.

Tugas pertama: pelajari struktur proyek ini, lalu buat CLAUDE.md di root.

Lakukan dulu:
1. Deteksi versi Next.js, App Router atau Pages Router, dan versi TypeScript
2. Deteksi ORM/query builder yang dipakai untuk MySQL (Drizzle? Prisma? mysql2
   langsung?). IKUTI yang sudah ada, jangan perkenalkan yang baru.
3. Petakan sistem login admin yang ada: di mana session disimpan, bagaimana
   halaman admin dilindungi, apakah sudah ada konsep role
4. Petakan konvensi: struktur folder, pola Server Action vs Route Handler,
   library UI dan styling yang dipakai
5. Cek versi MySQL/MariaDB dan charset default database

Lalu tulis CLAUDE.md berisi:

## Konteks
PESTA = website pelayanan digital BPS Kabupaten Musi Rawas.
Next.js, deploy di HOSTINGER BUSINESS dengan runtime Node.js.
Database MySQL di host yang sama.
Modul Beregam = bot WhatsApp + inbox layanan + asisten berbasis basis pengetahuan.

## Batasan Lingkungan
- Hostinger shared/business: TIDAK ADA Docker, TIDAK ADA root, TIDAK ADA
  proses tambahan di luar aplikasi Next.js
- Ada batas Entry Process. Jangan membuka banyak koneksi persisten.
- MySQL versi [isi hasil deteksi]. Dengan utf8mb4, batas index 191 karakter
  pada versi lama — kolom yang di-index harus pendek.
- TIDAK ADA model AI yang jalan di server ini. Semua inferensi di PC terpisah
  yang menarik pekerjaan lewat polling.
- Cron hPanel tersedia tapi JANGAN dijadikan andalan. Pemeliharaan dipicu dari
  heartbeat worker.

## Arsitektur Beregam
- Engine WhatsApp (WAHA) ada di PC kantor, TIDAK bisa dijangkau dari server ini
- PESTA tidak pernah mengirim pesan langsung. PESTA menulis ke beregam_outbox,
  worker di PC yang mengambil dan mengirim.
- Berlaku sama untuk AI: PESTA menulis beregam_ai_jobs, AI worker memproses.
- Semua tabel prefix `beregam_`
- Route API di app/api/beregam/, semua dengan export const dynamic = 'force-dynamic'
- Logic di lib/beregam/
- Worker ikut di repo ini (folder worker/ dan ai-worker/) tapi TIDAK ikut
  ter-deploy. Tipe kontrak API ada di lib/beregam/contracts.ts dan diimpor
  kedua sisi — ini satu-satunya sumber kebenaran.

## Aturan Mutlak
- Model AI TIDAK BOLEH menghasilkan angka statistik. Semua angka dari tabel
  beregam_indikator lewat SQL. Ini instansi statistik.
- Jangan pernah menulis nomor telepon lengkap ke file log.
- Perbandingan secret SELALU pakai crypto.timingSafeEqual, jangan ===

## Konvensi Proyek
[isi hasil temuanmu dari langkah 1-4]

Jangan tulis kode apa pun dulu. Buat CLAUDE.md, lalu tunjukkan ringkasan
temuanmu — terutama ORM yang dipakai, bentuk sistem auth, dan versi MySQL.
```

---

### P1 — Skema database & kontrak

```
Buat skema database dan kontrak tipe untuk modul Beregam.
Pakai ORM yang sudah dipakai proyek ini (lihat CLAUDE.md).
Buat SEMUA tabel sekarang termasuk yang baru dipakai fase berikutnya.

PERINGATAN MySQL: dengan charset utf8mb4, batas panjang index pada versi lama
adalah 191 karakter. Semua kolom yang di-index di bawah ini sudah pendek —
jangan menambah index pada kolom varchar panjang.

Tabel (prefix beregam_):

1. beregam_contacts
   id bigint PK autoincrement, waId varchar(64) UNIQUE, phone varchar(20) INDEX,
   name varchar(120) null, isBlocked boolean default false,
   messageCount int default 0, firstSeenAt, lastSeenAt, createdAt, updatedAt

2. beregam_sessions
   id, contactId FK unique cascade, state varchar(50) default 'idle',
   mode enum('bot','manual') default 'bot' INDEX, context json null,
   missCount tinyint default 0, expiresAt INDEX, timestamps

3. beregam_messages
   id, contactId FK INDEX cascade, direction enum('in','out'),
   waMessageId varchar(120) null INDEX, type varchar(20) default 'text',
   body text null, sentBy FK users null,
   source enum('bot','faq','semantic','sql','ai','agent') null,
   raw json null, createdAt
   + index gabungan (contactId, id)

4. beregam_outbox
   id, contactId FK cascade, waId varchar(64), type varchar(20) default 'text',
   payload json, status enum('pending','locked','sent','failed') default 'pending',
   attempts tinyint default 0, lastError text null, lockedAt null,
   lockedBy varchar(64) null, scheduledAt, sentAt null, sentBy FK users null,
   timestamps
   + index gabungan (status, scheduledAt)

5. beregam_handovers
   id, contactId FK cascade, channel enum('wa','web') default 'wa',
   reason varchar(150), status enum('open','claimed','resolved') default 'open' INDEX,
   assignedTo FK users null, claimedAt null, resolvedAt null,
   resolutionNote text null, timestamps

6. beregam_faq
   id, menuKey varchar(20) null INDEX, parentKey varchar(20) null,
   title varchar(150), answer text, sortOrder int default 0,
   isActive boolean default true, timestamps

7. beregam_health
   id tinyint PK, workerLastSeenAt null, aiWorkerLastSeenAt null,
   wahaSessionStatus varchar(30) null, meta json null, alertedAt null,
   maintenanceRanAt null

8. beregam_kb
   id, title varchar(200), content text, category varchar(60),
   sourceType enum('faq','publikasi','prosedur','regulasi'),
   sourceUrl varchar(300) null, sourceRef varchar(200) null,
   contentHash varchar(64) INDEX, isActive boolean default true,
   indexedAt null, timestamps

9. beregam_kb_hits
   id, kbId FK null setNull, question text, score decimal(5,4),
   wasUsed boolean, channel enum('wa','web'), createdAt

10. beregam_indikator
    id, kode varchar(40) INDEX, nama varchar(200), satuan varchar(40),
    wilayahKode varchar(20) INDEX, wilayahNama varchar(100),
    tahun smallint INDEX, periode varchar(20) null, nilai decimal(20,4),
    sumberPublikasi varchar(200), catatan text null, verifiedBy FK users null,
    timestamps
    + UNIQUE (kode, wilayahKode, tahun, periode)

11. beregam_ai_jobs
    id, contactId FK null, channel enum('wa','web'), question text,
    intent varchar(40) null, mode enum('embed','generate'),
    contextUsed json null, status enum('pending','locked','done','failed') INDEX,
    result text null, score decimal(5,4) null, model varchar(60) null,
    latencyMs int null, error text null, lockedAt null, timestamps

Buat juga lib/beregam/contracts.ts berisi skema Zod untuk SEMUA payload API:
- WebhookPayload, OutboxItem, AckRequest, HeartbeatRequest
- AiJobItem, AiJobResultRequest, AiHeartbeatRequest
- KbSyncItem, KbIndexedRequest
Ekspor tipe TypeScript hasil z.infer dari masing-masing.
Berkas ini akan diimpor oleh worker di folder worker/ dan menjadi satu-satunya
sumber kebenaran kontrak API. Jangan duplikasi definisi tipe di tempat lain.

Tambahkan helper query di lib/beregam/db/queries.ts:
- findOrCreateContactByWaId(waId, name) yang juga update lastSeenAt dan
  increment messageCount
- claimOutboxBatch(limit, workerId) — transaksi dengan SELECT ... FOR UPDATE
- claimAiJobBatch(limit, workerId) — pola yang sama

Buat migration dan seeder yang mengisi 1 baris beregam_health dengan id=1.
```

---

### P2 — Gateway abstraction

```
Buat lapisan abstraksi gateway WhatsApp di lib/beregam/drivers/.
Tujuannya: kalau nanti migrasi ke Meta Cloud API, cukup ganti driver tanpa
menyentuh logic bot.

1. lib/beregam/drivers/gateway.ts
   export interface BeregamGateway {
     queueText(contactId: number, waId: string, text: string,
               opts?: { delaySeconds?: number; sentBy?: number;
                        source?: OutboxSource }): Promise<OutboxRow>
     queueMenu(contactId: number, waId: string, header: string,
               items: string[]): Promise<OutboxRow>
     name(): string
   }

2. lib/beregam/drivers/waha-driver.ts
   Driver ini TIDAK memanggil WAHA langsung — PESTA tidak bisa menjangkau PC.
   Tugasnya hanya menulis baris ke beregam_outbox dengan scheduledAt yang tepat
   (now + delaySeconds).

3. lib/beregam/drivers/cloud-api-driver.ts
   Stub. Setiap method throw Error dengan pesan yang menunjuk ke
   docs/beregam/MIGRASI-CLOUD-API.md. Jangan implementasi apa pun sekarang —
   ini penanda arsitektur, dan nilainya baru terasa saat migrasi nanti.

4. lib/beregam/drivers/index.ts — factory getGateway() yang memilih driver
   berdasarkan config.

5. lib/beregam/config.ts — baca dari process.env dengan validasi Zod,
   gagal cepat saat start kalau ada yang kurang:
   - driver ('waha' default)
   - apiKey, webhookHmac
   - sessionTtlMinutes (30), manualModeTimeoutMinutes (120)
   - rateLimit: perMinute (3), dailyCap (500)
   - semantic: thresholdAuto (0.72), thresholdSuggest (0.55)
   - jamLayanan: hari kerja + jam buka/tutup
   - ai: enabled (false), timeoutSeconds (20)

6. lib/beregam/auth.ts — verifyApiKey(req: Request): boolean
   Ambil header X-Beregam-Key, bandingkan dengan crypto.timingSafeEqual.
   JANGAN pakai ===. Tangani kasus panjang string berbeda tanpa membocorkan
   informasi lewat waktu eksekusi.

7. Tambahkan variabel baru ke .env.example dengan komentar penjelas.

Test: queueText() menghasilkan tepat 1 baris di beregam_outbox dengan status
pending, payload dan source yang benar; delaySeconds tercermin di scheduledAt.
```

---

### P3 — Route Handler webhook

```
Buat app/api/beregam/webhook/route.ts yang menerima event dari WAHA.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'   // butuh modul crypto

Alur wajib, dalam urutan ini:
1. const raw = await req.text()   ← RAW body, BUKAN req.json().
   HMAC dihitung atas byte mentah; parsing dulu akan mengubahnya.
2. Hitung createHmac('sha512', config.webhookHmac).update(raw).digest('hex')
3. Bandingkan dengan header X-Webhook-Hmac memakai timingSafeEqual.
   Tidak cocok → log warning dan return 401.
4. Baru JSON.parse(raw), validasi dengan skema Zod dari contracts.ts
5. Abaikan dan return 200 kalau:
   - event bukan 'message'
   - payload.fromMe === true
   - chatId mengandung '@g.us' (pesan grup)
   - chatId adalah 'status@broadcast'
6. Deduplikasi: payload.id sudah ada di beregam_messages.waMessageId →
   return 200 tanpa proses apa pun
7. findOrCreateContactByWaId. Kalau isBlocked, return 200 diam-diam
8. Simpan pesan masuk (direction='in')
9. Panggil BeregamService.handleIncoming() — buat class dengan method kosong
   dulu, diisi di P5
10. return NextResponse.json({ ok: true })

Kinerja penting: WAHA akan timeout kalau menunggu lama. Seluruh handler harus
selesai di bawah 2 detik. Bungkus langkah 8-9 dalam try-catch — kalau error,
tetap log dan TETAP return 200. Jangan biarkan exception jadi 500, karena
WAHA akan retry dan menghasilkan pesan dobel di WhatsApp warga.

Test: HMAC salah → 401; pesan grup → 200 tanpa insert; waMessageId duplikat →
200 tanpa insert kedua; pesan valid → 200 + 1 baris.
```

---

### P4 — Route Handler outbox, AI jobs, heartbeat, health

```
Buat Route Handler yang dipanggil worker di PC.

Semua dengan export const dynamic = 'force-dynamic' dan runtime 'nodejs'.
Semua kecuali /health memanggil verifyApiKey() di baris pertama.

1. GET /api/beregam/outbox?limit=5 (batasi maksimal 10)
   Panggil claimOutboxBatch(). Di dalam transaksi: ambil status='pending' dan
   scheduledAt <= now(), urut scheduledAt, kunci dengan FOR UPDATE, lalu update
   status='locked', lockedAt=now(), lockedBy = header X-Worker-Id.
   Return array [{id, waId, type, payload}]. Kosong → array kosong dengan 200.

2. POST /api/beregam/outbox/[id]/ack
   Body divalidasi AckRequest.
   - 'sent' → status='sent', sentAt=now()
   - 'failed' → increment attempts, simpan lastError
     attempts < 3 → kembali 'pending' dengan backoff
     (30 detik / 2 menit / 10 menit sesuai attempts ke berapa)
     attempts >= 3 → tetap 'failed' DAN buat Handover reason 'Gagal kirim 3x'

3. POST /api/beregam/heartbeat
   Body: wahaSessionStatus, workerVersion, uptime.
   - Update beregam_health id=1: workerLastSeenAt, wahaSessionStatus, meta
   - LALU panggil runMaintenance() dari lib/beregam/services/maintenance.ts,
     tapi HANYA kalau maintenanceRanAt lebih tua dari 60 detik. Update
     maintenanceRanAt secara atomik supaya tidak berjalan ganda.
   - Return { ok: true, serverTime }

4. lib/beregam/services/maintenance.ts — runMaintenance():
   a. Outbox 'locked' dengan lockedAt > 2 menit → kembali 'pending'
   b. AI job 'locked' dengan lockedAt > 3 menit → kembali 'pending'
   c. Session mode='manual' tanpa aktivitas melebihi manualModeTimeoutMinutes
      → kembalikan ke 'bot', catat di log siapa yang tadinya memegang
   Semua idempoten dan cepat (<500 ms). Ini menggantikan cron sepenuhnya.

5. GET /api/beregam/ai-jobs?limit=3 — pola kunci sama dengan outbox
6. POST /api/beregam/ai-jobs/[id]/result
   Simpan hasilnya, LALU panggil BeregamService.handleAiResult() yang
   memutuskan teks final. Response { replyText: string | null }.
   Ini disengaja: worker tidak perlu menunggu siklus polling berikutnya, tapi
   PESTA tetap satu-satunya yang memutuskan isi kiriman.
7. POST /api/beregam/ai-heartbeat — update aiWorkerLastSeenAt + meta

8. GET /api/beregam/health — TANPA api key, tanpa data sensitif
   - Jalankan runWatchdog(): cek workerLastSeenAt > 5 menit,
     wahaSessionStatus bukan 'WORKING', aiWorkerLastSeenAt > 10 menit
     (kalau ai.enabled), outbox failed > 5 dalam 1 jam, pesan keluar hari ini
     melebihi dailyCap, handover 'open' > 4 jam pada jam layanan
   - Watchdog TIDAK BOLEH dipicu worker — pemicunya tidak boleh pihak yang
     sedang mati. Endpoint ini di-ping UptimeRobot tiap 5 menit.
   - Notifikasi = log error + baris di tabel notifikasi. JANGAN kirim WA:
     ironis kalau alert "bot mati" dikirim lewat bot yang mati.
   - Anti-spam pakai alertedAt, maksimal 1 alert sama per 30 menit.
     Kondisi pulih → reset alertedAt, catat log 'recovered'.
   - Return { status: 'ok' | 'degraded' | 'down' }

Test: tanpa API key → 401; GET outbox mengunci sehingga panggilan kedua tidak
mengembalikan item yang sama; ACK failed ketiga membuat handover;
runMaintenance() tidak berjalan dua kali dalam 60 detik.
```

---

### P5 — BeregamService

```
Implementasikan lib/beregam/services/beregam-service.ts.

Ini state machine deterministik, BUKAN AI. Fase 1 belum ada AI sama sekali.

handleIncoming(contact, text): Promise<void>

1. Normalisasi input: trim, lowercase, buang emoji
2. Ambil atau buat Session
3. KALAU session.mode === 'manual':
   - simpan pesan saja, JANGAN balas apa pun
   - update handover terkait supaya muncul sebagai belum dibaca di inbox
   - return
   INI KRUSIAL. Tanpa langkah ini, warga menerima dua jawaban sekaligus —
   dari petugas dan dari bot. Bug ini baru ketahuan setelah petugas mulai
   memakai inbox, jadi pastikan ada test-nya.
4. Rate limit: kalau kontak ini sudah dapat 3 balasan dalam 1 menit terakhir,
   diam saja (jangan balas, jangan lempar error)
5. Kata kunci global, berlaku di state mana pun:
   - 'menu','0','batal','kembali' → reset ke main_menu, kirim menu
   - 'petugas','admin','manusia' → escalate()
6. Sesi baru atau expiresAt sudah lewat → sapaan + menu utama,
   state='main_menu', selesai
7. state='main_menu' dan input angka 1-6 → ambil FAQ dengan menuKey tersebut,
   kirim jawabannya dengan source='faq', lalu kirim ulang menu di bawahnya
8. Input tidak cocok apa pun → increment session.missCount
   - < 3 → "Maaf, saya belum paham" + menu
   - = 3 → escalate() otomatis, reset missCount
9. Perpanjang expiresAt = now + config.sessionTtlMinutes

Method pendukung:
- escalate(contact, reason): buat Handover status='open',
  set session.mode='manual', kirim pesan konfirmasi ke warga.
  Kalau di luar jam layanan, tambahkan kalimat bahwa petugas akan membalas
  pada hari kerja berikutnya.
- isJamLayanan(): boolean dari config
- handleAiResult(job): Promise<string | null> — untuk sekarang return null,
  diisi di P11

Semua pengiriman balasan lewat BeregamGateway (inject lewat constructor atau
factory). JANGAN akses tabel outbox langsung dari service ini.

Kalau mengirim lebih dari satu pesan berurutan, beri delay bertingkat:
pesan pertama 0 detik, kedua 4 detik, ketiga 8 detik. Supaya urutan sampainya
benar dan terlihat wajar.

Seeder FAQ dengan 6 menu:
1 = Jam layanan & lokasi kantor
2 = Permintaan data statistik
3 = Konsultasi statistik
4 = Publikasi & rilis terbaru
5 = Pengaduan & saran
6 = Bicara dengan petugas
Isi jawaban dengan penanda [ISI: ...] agar mudah dilengkapi lewat admin panel.

Test untuk SETIAP transisi di atas, terutama langkah 3 (mode manual).
```

---

### P6 — Worker pesan

Folder `worker/` di dalam repo PESTA, tapi tidak ikut ter-deploy.

```
Buat worker TypeScript di folder worker/ yang menjembatani PESTA dengan WAHA.
Berjalan di WSL2 Ubuntu 24.04, Node 22, di PC kantor.

Konteks arsitektur yang menentukan desain:
- PC ini TIDAK punya IP publik dan TIDAK menerima koneksi masuk
- WAHA berjalan di http://localhost:3000, hanya bisa diakses dari mesin ini
- Semua komunikasi ke PESTA adalah koneksi KELUAR
- Karena itu worker harus PULL pekerjaan, bukan menunggu di-push

PENTING: impor tipe dan skema Zod dari ../lib/beregam/contracts.ts.
JANGAN mendefinisikan ulang bentuk payload di sini. Itu satu-satunya sumber
kebenaran kontrak API, dan inilah keuntungan utama worker ikut di repo ini.

Struktur:
  worker/
    src/index.ts       loop utama
    src/pesta.ts       client HTTP ke PESTA
    src/waha.ts        client HTTP ke WAHA lokal
    src/logger.ts      log stdout + rotasi berkas harian
    package.json, tsconfig.json, .env.example, README.md

Perilaku loop utama:
1. Tiap 60 detik: POST heartbeat ke PESTA berisi status sesi WAHA
   (dari GET localhost:3000/api/sessions/default), versi worker, uptime.
   Ingat: endpoint heartbeat di server sekaligus menjalankan pemeliharaan,
   jadi jangan lewatkan panggilan ini meski terasa sepele.
2. Tiap 3 detik: GET /api/beregam/outbox?limit=5
3. Untuk setiap item, proses BERURUTAN (jangan paralel):
   a. POST /api/sendSeen ke WAHA (tandai sudah dibaca)
   b. POST /api/startTyping
   c. Tunggu jeda ACAK antara 3000-8000 ms
   d. POST /api/stopTyping
   e. POST /api/sendText dengan { session, chatId, text }
   f. POST ACK ke PESTA status 'sent' + waMessageId dari response WAHA
   g. Gagal di langkah mana pun → ACK status 'failed' + pesan error
4. Kalau GET outbox gagal (internet putus), backoff eksponensial
   3s → 6s → 12s → maksimal 60s, dan JANGAN crash.
   Internet kantor putus itu normal, bukan kondisi luar biasa.

Wajib ada:
- Konfigurasi lewat .env divalidasi Zod: PESTA_BASE_URL, BEREGAM_API_KEY,
  WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION, WORKER_ID, POLL_INTERVAL_MS
- Header X-Beregam-Key dan X-Worker-Id di setiap request ke PESTA
- Graceful shutdown pada SIGTERM: selesaikan item yang sedang diproses,
  ACK-kan, baru keluar
- Timeout 15 detik di setiap HTTP request (AbortSignal.timeout)
- Log terstruktur. Nomor telepon DISAMARKAN sebagian (62812****789) —
  jangan pernah tulis nomor lengkap ke berkas

Pakai fetch bawaan Node 22. Dependency seminimal mungkin: zod (sudah ada di
repo) dan dotenv. Tanpa axios, tanpa framework.

Buat juga worker/beregam-worker.service (systemd, Restart=always,
RestartSec=10) plus instruksi systemctl --user di README.

Pastikan folder worker/ dikecualikan dari build Next.js dan dari deploy ke
Hostinger — periksa konfigurasi build dan tambahkan pengecualian bila perlu.
```

---

### P7 — Docker WAHA & autostart PC

```
Buat konfigurasi Docker untuk WAHA dan rantai autostart lengkap, di folder infra/.
Target: PC Intel i7-12700F, RAM 16 GB, GTX 1630 4 GB, Windows + WSL2.

1. infra/docker-compose.yml untuk WAHA:
   - image: devlikeapro/waha:latest
   - Engine NOWEB, BUKAN WEBJS. Kita tidak mau Chromium — RAM terbatas dan
     nanti dipakai bersama AI worker.
   - restart: unless-stopped
   - PENTING: bind port ke 127.0.0.1:3000:3000, JANGAN 0.0.0.0.
     WAHA tidak boleh bisa diakses dari jaringan kantor.
   - Volume persisten untuk session supaya tidak perlu scan QR ulang tiap restart
   - Batasi memori container ke 1g
   - Environment:
     WHATSAPP_DEFAULT_ENGINE=NOWEB
     WHATSAPP_HOOK_URL (ke endpoint webhook PESTA)
     WHATSAPP_HOOK_EVENTS=message
     WHATSAPP_HOOK_HMAC_KEY
     WHATSAPP_API_KEY
     WHATSAPP_RESTART_ALL_SESSIONS=True
     WHATSAPP_NOWEB_STORE_ENABLED=True
     WAHA_PRINT_QR=True
   - healthcheck yang memanggil endpoint ping WAHA
   - logging json-file, max-size 10m, max-file 3, supaya disk tidak penuh
     dalam setahun

2. infra/.wslconfig.example untuk disalin ke C:\Users\<user>\:
   memory=8GB, processors=8, swap=2GB
   Tanpa ini WSL mengambil separuh RAM dan berebut dengan Windows.

3. infra/start-beregam.sh:
   - docker compose up -d
   - tunggu healthcheck WAHA hijau
   - systemctl --user start beregam-worker

4. infra/SETUP-PC.md dengan instruksi lengkap rantai autostart:
   a. BIOS "Restore on AC Power Loss" → Power On
   b. Windows: aktifkan auto-login (netplwiz)
   c. Task Scheduler: task saat logon yang menjalankan
      wsl -d Ubuntu-24.04 -u <user> bash -lc "~/pesta/infra/start-beregam.sh"
   d. Nonaktifkan sleep dan hibernate di power plan
   e. Nonaktifkan Fast Startup (mengganggu WSL)
   f. Aktifkan systemd di WSL (/etc/wsl.conf dengan systemd=true)
   g. Pasang .wslconfig lalu wsl --shutdown

5. Di SETUP-PC.md tulis juga PROSEDUR UJI PEMULIHAN:
   cabut kabel listrik → colok lagi → verifikasi dalam 5 menit WAHA status
   WORKING dan worker sudah heartbeat. Sertakan perintah verifikasinya.

Beri komentar bahasa Indonesia pada setiap variabel environment — berkas ini
akan dibaca rekan kerja saya juga.
```

---

### P8 — Deploy ke Hostinger

```
Siapkan proses deploy modul Beregam ke Hostinger Business dengan runtime Node.js.

1. Periksa konfigurasi build Next.js saat ini. Pastikan folder worker/ dan
   ai-worker/ TIDAK ikut ter-build maupun ter-deploy. Tambahkan pengecualian
   di tsconfig, eslint, dan skrip deploy bila perlu.

2. Dokumentasikan variabel environment yang harus diisi di hPanel:
   BEREGAM_API_KEY, BEREGAM_WEBHOOK_HMAC, dan lainnya dari config.ts.
   Buat perintah untuk membangkitkan nilai acak yang aman.

3. Skrip migration yang aman dijalankan di Hostinger. Ingat: tidak ada shell
   bebas seperti VPS. Cari tahu cara menjalankan migration lewat hPanel atau
   lewat endpoint sekali-pakai yang dilindungi, lalu tulis instruksinya.

4. Uji pasca-deploy — tulis sebagai checklist yang bisa dijalankan dengan curl:
   - GET /api/beregam/health mengembalikan 200
   - POST /api/beregam/outbox tanpa API key mengembalikan 401
   - POST /api/beregam/webhook dengan HMAC salah mengembalikan 401
   - Koneksi database berhasil dan 11 tabel beregam_ ada

5. Periksa apakah aplikasi Node di Hostinger bisa mati saat idle. Karena worker
   memanggil tiap 3 detik, seharusnya tidak pernah idle — tapi konfirmasi
   perilakunya dan catat temuannya di docs/beregam/DEPLOY.md.

6. Catat batas Entry Process pada plan Business ini dan pastikan jumlah koneksi
   yang kita buka masih jauh di bawahnya. Ini penting sebelum nanti
   mempertimbangkan SSE untuk inbox.

7. Konfigurasi UptimeRobot: monitor HTTP ke /api/beregam/health tiap 5 menit.
   Endpoint ini sekaligus menjalankan watchdog, jadi ping-nya bukan sekadar
   pemantauan — ia bagian dari mekanisme deteksi.
```

---

### P9 — Inbox petugas

Prompt paling penting untuk kemampuan balas manual.

```
Buat inbox layanan di admin PESTA supaya petugas bisa membalas warga lewat
browser, tanpa pernah menyentuh HP atau PC yang memegang nomor WhatsApp.

IKUTI sistem login admin yang SUDAH ADA (lihat CLAUDE.md). Jangan bikin sistem
auth baru. Kalau belum ada konsep role, tambahkan kolom role sederhana pada
tabel users yang ada — jangan pasang library permission besar untuk kebutuhan
sekecil ini.

Halaman di app/(admin)/admin/beregam/:

1. inbox/page.tsx — halaman utama petugas
   - Daftar percakapan urut aktivitas terbaru
   - Badge: belum dibaca, mode manual, handover terbuka
   - Filter: semua / perlu dijawab / saya pegang / selesai
   - Kolom: nama, nomor tersamar sebagian, cuplikan pesan terakhir, waktu,
     petugas yang memegang

2. inbox/[contactId]/page.tsx
   - Tampilan bubble: masuk kiri, keluar kanan
   - Pesan keluar diberi label sumber: Bot / FAQ / Petugas (nama)
   - Kotak balas di bawah
   - Tombol "Ambil alih" → session.mode='manual', handover status='claimed',
     assignedTo = user login, claimedAt
   - Tombol "Kembalikan ke bot"
   - Tombol "Selesai" → handover resolved + resolutionNote
   - Tombol "Blokir kontak"
   - Peringatan jelas kalau percakapan sedang dipegang petugas LAIN

3. Server Actions di app/(admin)/admin/beregam/actions.ts:
   - pollMessages(contactId, afterId) — kembalikan HANYA pesan dengan id lebih
     besar. Ringan, dipanggil tiap 5 detik dari komponen klien.
   - replyToContact(contactId, text)
     VALIDASI WAJIB: session.mode === 'manual' DAN handover.assignedTo = user
     login. Kalau tidak, tolak dengan pesan jelas.
     Ini yang mencegah dua petugas membalas warga yang sama, dan mencegah
     petugas membalas saat bot masih memegang percakapan.
     Kalau lolos: tulis ke outbox lewat gateway dengan sentBy = user id,
     source = 'agent', delay = 0.
   - claimConversation(contactId), releaseConversation(contactId),
     resolveConversation(contactId, note), blockContact(contactId)
   Semua Server Action memverifikasi sesi login lebih dulu.

Mulai dengan POLLING 5 detik, bukan SSE. Proses Node persisten memang
memungkinkan SSE, tapi di belakang proxy shared hosting SSE kadang ter-buffer
dan tiap koneksi terbuka memakan Entry Process. Uji SSE sebagai peningkatan
setelah fase 1 stabil, jangan sebagai fondasi.

Aturan tampilan:
- Nomor telepon SELALU tersamar sebagian di daftar (62812****789).
  Nomor penuh hanya di halaman percakapan.
- Pagination di semua daftar. beregam_messages akan tumbuh cepat.
- Batasi 50 pesan terakhir + tombol "muat lebih lama".
  Jangan pernah load semua pesan sekaligus.

Pakai library UI dan pola styling yang sudah dipakai proyek ini.
JANGAN tambahkan dependency UI baru.
```

---

### P10 — Dashboard & kelola konten

```
Lengkapi admin panel Beregam.

1. admin/beregam/page.tsx — Dashboard
   - Kartu status: worker terakhir terlihat, status sesi WAHA, AI worker,
     dengan indikator hijau/kuning/merah
   - Angka hari ini: pesan masuk, pesan keluar, kontak unik, handover terbuka
   - Grafik jumlah pesan 14 hari terakhir
   - Rasio jawaban per source (bot / faq / semantic / sql / ai / agent) —
     ini yang mengukur efektivitas tiap fase
   - 5 handover terbuka terlama

2. admin/beregam/faq/page.tsx
   - CRUD penuh untuk beregam_faq
   - Urutkan (sortOrder), aktifkan/nonaktifkan
   - Preview bagaimana menu akan tampil di WhatsApp
   - Ini penting: petugas PST harus bisa mengubah jawaban tanpa developer

3. admin/beregam/outbox/page.tsx
   - Daftar dengan filter status
   - Tombol "Kirim ulang" untuk item failed (kembali ke pending, attempts=0)

4. Ekspor laporan bulanan (CSV): jumlah pesan, kontak unik, rasio bot vs
   petugas, menu terpopuler, rata-rata waktu respons.
   Ini bahan laporan inovasi dan justifikasi anggaran.

Semua daftar wajib pakai pagination dan query yang ter-index.
```

---

### P11 — Basis pengetahuan (Fase 2, sisi PESTA)

```
Bangun basis pengetahuan bersama yang akan dipakai bot WhatsApp, chatbot
website, dan saran jawaban petugas.

Tabel beregam_kb dan beregam_kb_hits sudah dibuat di P1.

1. admin/beregam/kb/page.tsx — CRUD
   - Field: judul, isi, kategori, tipe sumber, URL sumber, referensi sumber
   - Editor teks sederhana, bukan WYSIWYG berat
   - Saat simpan: hitung contentHash = sha256 dari isi, kosongkan indexedAt
     supaya AI worker tahu perlu embed ulang
   - Preview bagaimana jawaban ini tampil di WhatsApp
   - Impor massal dari CSV

2. GET /api/beregam/kb?since=<iso8601>&limit=50
   Kembalikan entri aktif dengan updatedAt > since ATAU indexedAt null.
   Field: id, title, content, category, sourceRef, contentHash.
   Tambahkan skema Zod-nya ke contracts.ts.

3. POST /api/beregam/kb/indexed — body { ids: number[] }, set indexedAt = now()

4. admin/beregam/kb/gaps/page.tsx — "Celah Pengetahuan"
   Dari beregam_kb_hits: daftar pertanyaan dengan skor tertinggi di bawah
   ambang, dikelompokkan yang mirip, urut frekuensi.
   Ini yang memberi tahu petugas materi apa yang perlu ditulis berikutnya.
   Tombol "Buat entri KB dari pertanyaan ini".

5. Implementasikan BeregamService.handleAiResult(job): Promise<string | null>
   - score >= config.semantic.thresholdAuto → kembalikan jawaban KB apa adanya,
     source='semantic', catat kbHits wasUsed=true
   - thresholdSuggest <= score < thresholdAuto → kembalikan 2-3 kandidat judul,
     minta warga memilih dengan angka, simpan kandidat di session.context,
     state='pilih_kandidat'
   - score < thresholdSuggest → escalate(), catat kbHits wasUsed=false,
     kembalikan null

6. Perbarui handleIncoming(): teks bebas yang tidak cocok menu tidak lagi
   langsung eskalasi, tapi membuat AiJob mode='embed' status='pending',
   lalu kirim pesan singkat "Sebentar ya, saya carikan".
   Tambahkan state 'pilih_kandidat' untuk menangani jawaban angka atas
   kandidat yang ditawarkan.

Test untuk ketiga cabang ambang skor dan untuk state pilih_kandidat.
```

---

### P12 — AI worker (Fase 2, sisi PC)

Folder `ai-worker/` di dalam repo PESTA, tidak ikut ter-deploy.

```
Buat AI worker Python di folder ai-worker/ yang menjalankan pencarian semantik
di PC lokal.

PERANGKAT: Intel i7-12700F, RAM 16 GB, GTX 1630 4 GB VRAM.
Ini kartu lemah — 512 CUDA core, tanpa tensor core, bandwidth ~96 GB/s.
Rancang sesuai kenyataan itu, jangan asumsikan GPU kelas atas.

FASE INI TIDAK MEMAKAI LLM SAMA SEKALI. Hanya embedding + pencarian.
Alasannya: tanpa model generatif, mustahil mengarang. Jawaban yang dikirim
adalah teks yang sudah ditulis petugas, apa adanya.

Struktur:
  ai-worker/
    src/main.py       loop utama
    src/pesta.py      client HTTP ke PESTA
    src/embedder.py   model embedding
    src/index.py      indeks vektor lokal
    src/sync.py       sinkronisasi KB
    requirements.txt, .env.example, README.md

Konfigurasi lewat .env — rancang agar upgrade nanti cukup ganti nilai:
  AI_MODE=embedding_only        # embedding_only | embedding_plus_llm
  EMBED_MODEL=intfloat/multilingual-e5-small
  EMBED_DEVICE=cuda             # cuda | cpu
  LLM_BACKEND=none              # none | ollama | openai_compatible
  LLM_MODEL=
  LLM_BASE_URL=
  PESTA_BASE_URL=, BEREGAM_API_KEY=, WORKER_ID=

Perilaku:

1. Saat start: muat model embedding ke device sesuai config.
   multilingual-e5-small (~470 MB) muat lega di 4 GB dan mendukung
   Bahasa Indonesia dengan baik.

2. Sinkronisasi KB tiap 5 menit:
   - GET /api/beregam/kb?since=<terakhir>
   - Potong isi jadi chunk ~400 token dengan tumpang tindih 50 token,
     hormati batas paragraf
   - Embed semua chunk, simpan ke indeks lokal
   - POST /api/beregam/kb/indexed

3. Indeks vektor LOKAL berbasis berkas — jangan pakai vector database berat.
   Untuk di bawah 50.000 chunk, numpy array + cosine brute force selesai
   dalam milidetik. Simpan sebagai .npz + metadata JSON, muat ke memori saat
   start. Buat agar berkas indeks bisa disalin ke mesin lain apa adanya —
   ini yang membuat pindah ke perangkat lebih baik nanti jadi mudah.

4. Tiap 2 detik: GET /api/beregam/ai-jobs?limit=3
   Untuk tiap job mode='embed':
   - Embed pertanyaan (prefix "query: " sesuai konvensi e5)
   - Cosine similarity terhadap seluruh indeks
   - Ambil top 3, kelompokkan per kbId, ambil skor tertinggi tiap kb
   - POST result: { status:'done', score, contextUsed:[{kbId, score, chunk}] }
   - Response berisi replyText. TIDAK dikirim dari sini — PESTA sudah
     menulisnya ke outbox, worker pesan yang mengirim.

5. Tiap 60 detik: POST /api/beregam/ai-heartbeat berisi mode aktif, nama model,
   jumlah chunk ter-indeks, penggunaan VRAM.

6. Kalau AI_MODE=embedding_plus_llm, siapkan cabang kode untuk memanggil
   LLM_BACKEND — tapi JANGAN implementasi sekarang, cukup raise
   NotImplementedError dengan pesan jelas yang menunjuk ke P14.

Wajib:
- Backoff eksponensial saat PESTA tidak terjangkau, jangan crash
- Timeout 15 detik tiap request
- Log terstruktur, nomor telepon tidak pernah ditulis
- systemd unit beregam-ai-worker.service, Restart=always
- Muat model sekali saat start, jangan reload per job

Di README tulis perkiraan kinerja nyata pada perangkat ini dan cara
mengukurnya sendiri.
```

---

### P13 — Jalur angka statistik (Fase 3)

```
Bangun jalur khusus untuk pertanyaan angka statistik.
Jalur ini TIDAK memakai AI untuk menghasilkan angka.

ATURAN MUTLAK: setiap angka yang keluar dari bot harus bisa dilacak ke satu
baris beregam_indikator. Model AI tidak pernah menghasilkan, mengubah, atau
menghitung angka. Ini instansi statistik — angka karangan tidak bisa ditoleransi.

1. admin/beregam/indikator/page.tsx
   - CRUD + impor CSV + filter per indikator/wilayah/tahun
   - Kolom verifiedBy WAJIB terisi sebelum baris bisa dipakai bot
   - Tampilkan sumberPublikasi di setiap baris

2. lib/beregam/services/indikator-resolver.ts
   - Kamus sinonim: "penduduk" → kode indikator, "murara"/"musi rawas" →
     kode wilayah, dst. Simpan kamus di berkas konfigurasi atau tabel,
     JANGAN hardcode di dalam fungsi.
   - resolve(text): { kode, wilayahKode, tahun, periode } | null
     Fase ini pakai pencocokan pola + kamus. TANPA LLM.
   - Kalau tahun tidak disebut, pakai tahun data terbaru yang tersedia
     DAN sebutkan itu di jawaban.

3. Template jawaban di lib/beregam/templates/
   "{nama} {wilayahNama} tahun {tahun}: *{nilai} {satuan}*.
    Sumber: {sumberPublikasi}.
    Data lengkap: {linkPublikasi}"
   Angka disisipkan oleh kode, bukan oleh model.

4. Integrasi ke BeregamService.handleIncoming()
   Sebelum membuat AiJob, coba IndikatorResolver dulu.
   - Ketemu → jawab langsung dari template, source='sql', selesai
   - Tidak ketemu → lanjut ke jalur semantik seperti biasa

5. Bila resolver menemukan indikator tapi tahun yang diminta tidak ada:
   jawab dengan tahun terdekat yang tersedia DAN katakan terus terang bahwa
   tahun yang diminta belum tersedia. Jangan diam-diam mengganti.

6. Skrip impor indikator dari CSV dengan validasi: tolak baris tanpa
   sumberPublikasi, tolak nilai non-numerik, laporkan duplikat.

Test: resolver mengenali 20 variasi kalimat pertanyaan angka yang kamu buat
sendiri; jawaban selalu menyertakan sumber; kasus tahun tidak tersedia
ditangani dengan jujur.
```

---

### P14 — LLM lokal (Fase 4, TUNDA)

```
JANGAN jalankan prompt ini sebelum: fase 2-3 berjalan minimal 2 bulan,
DAN RAM sudah 32 GB atau ada GPU dengan VRAM minimal 8 GB.

Tambahkan kemampuan LLM ke AI worker. Aktifkan dengan AI_MODE=embedding_plus_llm.

1. Implementasikan cabang LLM_BACKEND yang tadi NotImplementedError:
   - 'ollama' → POST ke LLM_BASE_URL/api/generate
   - 'openai_compatible' → format chat completions
   Timeout 20 detik. Lewat batas → status 'failed', PESTA akan mengeskalasi.

2. Dua tugas LLM, keduanya sempit:

   a. Klasifikasi intent + ekstraksi entitas
      Keluaran WAJIB JSON: { intent, indikator, wilayah, tahun }
      intent salah satu dari: angka_statistik, definisi_metodologi,
      prosedur_layanan, publikasi, status_permintaan, lainnya
      Ini menggantikan pencocokan pola di IndikatorResolver, BUKAN
      menggantikan query SQL-nya.

   b. Parafrase jawaban KB
      Diberi 2-3 chunk hasil retrieval, susun jawaban ringkas berbahasa
      Indonesia. Prompt sistem harus tegas:
      - Jawab HANYA dari konteks yang diberikan
      - DILARANG menyebut angka yang tidak ada persis di konteks
      - Tidak ada informasi yang cocok → jawab persis "TIDAK_ADA_DI_KONTEKS"
      - Maksimal 4 kalimat
      - temperature 0.2

3. Batasi konteks 2-3 chunk (800-1200 token), JANGAN 8 chunk.
   Prefill adalah titik lemah perangkat ini — konteks panjang membuat waktu
   jawab meledak.

4. Validasi keluaran DI PESTA di handleAiResult(), sebelum dikirim:
   - Hasil = "TIDAK_ADA_DI_KONTEKS" → escalate()
   - Ekstrak semua angka dari hasil. Ada angka yang tidak muncul di
     contextUsed → TOLAK hasil, escalate(), catat sebagai pelanggaran di
     log khusus untuk ditinjau
   - Panjang melebihi batas → potong atau tolak
   - Lolos semua → kirim dengan source='ai'

5. admin/beregam/ai-review/page.tsx
   Daftar jawaban source='ai', petugas menandai benar/salah.
   Yang ditandai salah jadi bahan perbaikan KB.

6. Perbarui watchdog: pantau rata-rata latencyMs dan tingkat kegagalan.
   Latensi rata-rata > 25 detik selama 1 jam → alert, pertanda perangkat
   kewalahan.

Tulis di README hasil pengukuran nyata: token/detik, waktu prefill,
penggunaan VRAM dan RAM saat berjalan bersama WAHA.
```

---

### P15 — Chatbot website (Fase 5)

```
Tambahkan chatbot AI di website PESTA. Berbagi basis pengetahuan yang sama
dengan bot WhatsApp, tapi TIDAK bergantung pada PC kantor.

Alasan perbedaan ini penting: pengunjung website menunggu di depan layar, dan
halaman publik diakses 24 jam. Membuatnya bergantung pada satu PC di ruang
kerja bukan keputusan yang bisa dipertahankan.

1. Widget chat di halaman publik PESTA
   - Tombol mengambang, panel chat sederhana
   - Sesi tamu berbasis cookie, tanpa perlu login
   - Sapaan menjelaskan ini asisten otomatis dan menyebut jam layanan petugas

2. Backend: PESTA memanggil API cloud LANGSUNG, bukan lewat PC
   - lib/beregam/services/web-chat-service.ts
   - Retrieval: karena indeks vektor ada di PC, untuk fase ini pakai pencarian
     FULLTEXT MySQL atas beregam_kb sebagai pengganti. Buat index FULLTEXT
     pada kolom title dan content.
   - Kirim konteks + pertanyaan ke API cloud dengan prompt sistem yang sama
     tegasnya seperti P14 poin 2b
   - Validasi keluaran dengan aturan yang sama: tidak boleh ada angka di luar
     konteks

3. Angka statistik: pakai IndikatorResolver yang SAMA dengan bot WA.
   Jalur SQL tidak berubah sama sekali.

4. Eskalasi ke petugas masuk ke INBOX YANG SAMA dengan WhatsApp.
   Buat Handover dengan channel='web'. Petugas melihat satu daftar, tidak
   peduli warga datang dari mana.
   Untuk kanal web, tampilkan balasan petugas di panel chat lewat polling,
   bukan lewat outbox WhatsApp.

5. config.ts tambah bagian webChat: provider, model, apiKey, maxTokens,
   dailyBudgetCap.
   Kalau pemakaian harian melebihi batas, matikan otomatis dan alihkan ke
   form kontak biasa. Jangan sampai tagihan lepas kendali.

6. Rate limit per IP dan per sesi tamu. Halaman publik = target penyalahgunaan.
```

---

### P16 — Dokumentasi & serah terima

```
Buat dokumentasi operasional. Pembacanya rekan kerja saya di BPS yang harus
bisa memulihkan sistem ini saat saya cuti.

1. docs/beregam/RUNBOOK.md — bahasa Indonesia sederhana, bukan bahasa developer
   - "Bot tidak membalas sama sekali" → langkah diagnosa berurutan
   - "Bot minta scan QR ulang" → prosedur lengkap dengan langkah di HP
   - "PC mati karena listrik" → apa yang dicek setelah nyala
   - "Jawaban bot salah" → cara memperbaiki lewat admin KB/FAQ
   - "Petugas tidak bisa membalas" → cek mode manual dan assignedTo
   - "AI worker mati" → dampaknya apa (bot tetap jalan, cuma menu saja)
   - "Aplikasi di Hostinger restart" → apa yang perlu dicek
   - Nomor kontak eskalasi
   Sertakan perintah yang bisa disalin apa adanya.

2. docs/beregam/SOP-SCAN-QR.md
   Langkah demi langkah dengan asumsi pembacanya belum pernah membuka terminal.
   Sertakan di mana kredensial akses PC disimpan dan siapa yang berwenang.

3. docs/beregam/PANDUAN-PETUGAS.md — untuk petugas PST, bukan teknis
   - Cara membuka inbox dan membalas
   - Kapan mengambil alih, kapan mengembalikan ke bot
   - Cara menambah dan memperbaiki entri basis pengetahuan
   - Cara membaca halaman Celah Pengetahuan
   Sertakan tangkapan layar bila memungkinkan.

4. docs/beregam/ARSITEKTUR.md
   Diagram alur ASCII, penjelasan pola outbox polling, alasan pemeliharaan
   dipicu worker, daftar endpoint, dan peta fase.

5. docs/beregam/DEPLOY.md
   Proses deploy ke Hostinger, variabel environment, cara menjalankan migration,
   checklist uji pasca-deploy, dan temuan tentang perilaku idle aplikasi Node.

6. docs/beregam/MIGRASI-CLOUD-API.md
   - Persiapan verifikasi bisnis Meta untuk instansi pemerintah
   - Bagian yang berubah: hanya CloudApiDriver
   - Bagian yang TIDAK berubah: BeregamService, KB, indikator, inbox, admin
   - Catatan: mulai 1 Oktober 2026 pesan service di dalam jendela 24 jam
     tidak lagi gratis. Hitung ulang biaya saat itu.

7. docs/beregam/UPGRADE-PERANGKAT.md
   Tabel tingkat perangkat dan nilai .env yang berubah di tiap tingkat.
   Tegaskan bahwa skema tabel, kontrak API, dan logic tidak berubah sama sekali.

8. Checklist go-live dalam bentuk markdown checkbox.
```

---

## 15. Checklist Go-Live

### Fase 1 — Teknis

- [ ] Cabut kabel listrik → bot pulih sendiri dalam 5 menit
- [ ] Internet putus 10 menit → worker tidak crash, pesan tertunda terkirim setelah pulih
- [ ] Webhook dengan HMAC salah ditolak 401
- [ ] Endpoint worker tanpa API key ditolak 401
- [ ] Pesan grup dan status broadcast diabaikan
- [ ] 6 menu utama menjawab benar dari HP di luar jaringan kantor
- [ ] Eskalasi otomatis setelah 3 input tidak dikenali
- [ ] **Mode manual: bot benar-benar diam saat petugas memegang**
- [ ] **Dua petugas tidak bisa membalas kontak yang sama**
- [ ] Mode manual kembali otomatis ke bot setelah 2 jam
- [ ] `runMaintenance()` tidak berjalan dua kali dalam 60 detik
- [ ] UptimeRobot memantau `/api/beregam/health` tiap 5 menit
- [ ] Watchdog mendeteksi worker mati dalam 10 menit
- [ ] Folder `worker/` dan `ai-worker/` tidak ikut ter-deploy
- [ ] Log tidak memuat nomor telepon lengkap

### Fase 1 — Non-teknis

- [ ] Semua jawaban FAQ diisi dan disetujui Kasi PST
- [ ] Minimal 2 orang bisa scan ulang QR, sudah pernah mempraktikkan
- [ ] Petugas PST sudah dilatih memakai inbox
- [ ] SOP tercetak dan tersimpan di ruang PST
- [ ] Disepakati siapa yang memantau inbox setiap hari kerja
- [ ] Nomor terdaftar sebagai kontak resmi di website dan media sosial BPS
- [ ] Disclaimer di pesan sapaan: bot otomatis, jam layanan petugas, dan bahwa percakapan disimpan untuk keperluan layanan

### Fase 3 — Tambahan

- [ ] Setiap angka yang keluar bot bisa dilacak ke baris `beregam_indikator`
- [ ] Semua baris indikator punya `sumberPublikasi` dan `verifiedBy`
- [ ] Kasus "tahun tidak tersedia" dijawab jujur, bukan diganti diam-diam

---

## 16. Metrik

Catat sejak hari pertama. Data ini yang jadi justifikasi anggaran dan bahan laporan inovasi.

| Metrik | Sumber | Kegunaan |
|---|---|---|
| Pesan masuk per hari | `beregam_messages` | Menunjukkan adopsi |
| Kontak unik per bulan | `beregam_contacts` | Jangkauan layanan |
| Rasio jawaban per `source` | `beregam_messages` | Efektivitas tiap fase |
| Rasio terjawab bot vs petugas | `beregam_handovers` | Efektivitas otomasi |
| Menu paling sering diakses | `beregam_messages` | Perbaikan konten FAQ |
| Pertanyaan gagal dijawab | `beregam_kb_hits` | Bahan menulis KB berikutnya |
| Waktu respons rata-rata | selisih `createdAt` in vs out | Kualitas layanan |
| Uptime bulanan | UptimeRobot | Keandalan |

Setelah 3 bulan, angka-angka ini menjadi argumen yang jauh lebih kuat untuk mengajukan VPS di anggaran berikutnya dibanding proposal tanpa data.

---

## 17. Jalur Migrasi Gateway

```
TAHAP 1 (sekarang)    PC kantor + WAHA          Rp0/bulan
        ↓             Buktikan konsep, kumpulkan data 3 bulan
TAHAP 2 (opsional)    VPS + WAHA                ~Rp117rb/bulan
        ↓             Ganti 1 URL di worker. Kode PESTA tidak berubah.
TAHAP 3 (jangka       Meta Cloud API resmi      per pesan
        panjang)      Implementasi CloudApiDriver. BeregamService, KB,
                      indikator, inbox, dan admin panel tetap utuh.
```

Nilai terbesar dari `BeregamGateway` interface baru terasa di Tahap 3 — dan biayanya sekarang cuma satu berkas. Itulah alasan berkas itu dibuat di P2, bukan nanti.

**Catatan untuk Tahap 3:** mulai 1 Oktober 2026, pesan service di dalam jendela 24 jam Meta tidak lagi gratis. Hitung ulang biayanya saat itu berdasarkan volume nyata dari metrik di bagian 16.

---

## 18. Kesalahan yang Harus Dihindari

1. **Memakai `req.json()` sebelum menghitung HMAC.** HMAC harus dihitung atas raw body. Pakai `await req.text()` lebih dulu, baru parse.
2. **Membandingkan secret dengan `===`.** Selalu `crypto.timingSafeEqual`.
3. **Webhook memproses berat sebelum return 200.** WAHA akan timeout lalu retry, dan warga menerima balasan dobel.
4. **Bind WAHA ke 0.0.0.0.** Seluruh jaringan kantor bisa mengirim WA atas nama BPS.
5. **Lupa cek `mode === 'manual'` di langkah 3 BeregamService.** Warga menerima jawaban bot dan petugas sekaligus. Bug ini baru ketahuan setelah petugas mulai memakai inbox.
6. **Lupa validasi `assignedTo` di `replyToContact`.** Dua petugas bisa membalas warga yang sama.
7. **Membiarkan model menghasilkan angka statistik.** Ini bukan bug teknis, ini kerusakan institusional.
8. **Menjejalkan 8 chunk ke konteks LLM.** Prefill adalah titik lemah perangkat ini.
9. **Memakai tabel publikasi sebagai bahan RAG.** Tabel yang diekstrak jadi teks mengalir berubah jadi bubur angka. Pisahkan sejak parsing.
10. **Menambahkan LLM di fase 1.** Menambah biaya, latensi, dan jawaban yang tidak bisa diprediksi — sebelum tahu apakah bot ini dipakai warga.
11. **Mengirim pesan tanpa jeda.** Jalur tercepat menuju nomor terblokir.
12. **Menyimpan nomor lengkap di berkas log.** Masalah kepatuhan PDP yang tidak perlu.
13. **Membangun inbox di atas SSE sejak awal.** Mulai dengan polling; SSE sebagai peningkatan setelah terbukti stabil di belakang proxy Hostinger.
14. **Hanya satu orang yang bisa scan QR.** Satu kali cuti panjang, layanan mati.
15. **Melewati uji cabut listrik.** Mati lampu adalah kepastian, bukan kemungkinan.
16. **Mengirim alert "bot mati" lewat WhatsApp.** Pakai admin panel dan UptimeRobot.
