# Menyiapkan PC untuk Beregam

Panduan ini dibuat untuk dijalankan dari nol di PC kantor. Ikuti berurutan.

**Perangkat yang dituju:** Intel i7-12700F, RAM 16 GB, GTX 1630 4 GB,
Windows 11 Pro.

> **Jangan lewati langkah 8.** Uji cabut kabel listrik adalah satu-satunya
> cara membuktikan bahwa bot benar-benar pulih sendiri. Mati lampu adalah
> kepastian, bukan kemungkinan.

---

## 0. Yang perlu disiapkan lebih dulu

- [ ] Hak administrator di PC ini
- [ ] Nomor WhatsApp layanan: **6285169881015**, SIM terpasang di satu HP
      kantor dengan **WhatsApp Business**
- [ ] Akses ke Environment Variables Hostinger (untuk mencocokkan HMAC)
- [ ] PC bisa dinyalakan terus-menerus

> **HP pemegang SIM bukan barang opsional.** Saat PC mati, HP itulah yang
> tetap menerima pesan warga dan tempat admin membalas manual. Itu lapis
> pertahanan terakhir, dan ia bekerja tanpa konfigurasi apa pun.

---

## 1. BIOS: nyala sendiri setelah listrik pulih

1. Nyalakan ulang PC, masuk BIOS (biasanya `Del` atau `F2`)
2. Cari **Restore on AC Power Loss** / **AC Back** / **After Power Failure**
3. Ubah ke **Power On** (bukan *Last State*, bukan *Power Off*)
4. Simpan dan keluar

Tanpa ini, setiap mati lampu berarti seseorang harus datang ke kantor dan
menekan tombol power.

---

## 2. Windows: jangan pernah tidur

Jalankan **PowerShell sebagai Administrator**:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 15
powercfg /hibernate off
```

Matikan **Fast Startup** - ia mengganggu WSL2:

```powershell
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f
```

Aktifkan login otomatis supaya Task Scheduler bisa jalan setelah PC menyala
sendiri:

```powershell
netplwiz
```

Hilangkan centang *"Users must enter a user name and password..."*, klik OK,
lalu isi sandi akun.

> Login otomatis berarti siapa pun yang bisa menyentuh PC ini langsung masuk
> ke desktop. Tempatkan PC di ruangan yang terkunci, dan jangan menyimpan
> berkas pribadi di akun ini.

---

## 3. WSL2 + Ubuntu

PowerShell sebagai Administrator:

```powershell
wsl --install -d Ubuntu-24.04
```

PC akan meminta restart. Setelah menyala kembali, Ubuntu meminta nama
pengguna dan sandi - catat keduanya di brankas kredensial.

Aktifkan systemd. Di dalam Ubuntu:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Batasi memori WSL. Salin `infra/.wslconfig.example` ke
`C:\Users\<nama-pengguna>\.wslconfig`, lalu di PowerShell:

```powershell
wsl --shutdown
```

Buka Ubuntu lagi, pastikan systemd hidup:

```bash
systemctl --version
```

---

## 4. Docker Engine

**Docker Engine, bukan Docker Desktop.** Docker Desktop butuh lisensi
berbayar untuk organisasi di atas ukuran tertentu; Engine berlisensi
Apache 2.0 dan bebas dari persoalan itu untuk instansi pemerintah.

Di dalam Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Supaya `docker` bisa dipakai tanpa `sudo`:

```bash
sudo usermod -aG docker $USER
```

Tutup Ubuntu, jalankan `wsl --shutdown` di PowerShell, buka lagi, lalu uji:

```bash
docker run --rm hello-world
```

---

## 5. Ambil kode Beregam

```bash
cd ~
git clone https://github.com/HabibWafi/beregam.git
cd beregam/infra
cp .env.example .env
```

Isi `.env`. Bangkitkan nilai rahasianya:

```bash
openssl rand -hex 32
```

| Variabel | Isi dengan |
|---|---|
| `WAHA_IMAGE` | Tag **versi spesifik**, mis. `devlikeapro/waha:noweb-2026.8.1`. Jangan `latest` |
| `WAHA_PORT` | `3001` |
| `WAHA_API_KEY` | Hasil `openssl rand -hex 32` |
| `WAHA_DASHBOARD_PASSWORD` | Hasil `openssl rand -hex 16` |
| `PESTA_BASE_URL` | Awali dengan **staging**, jangan langsung produksi |
| `BEREGAM_WEBHOOK_HMAC` | Hasil `openssl rand -hex 32` |

> `BEREGAM_WEBHOOK_HMAC` harus **sama persis** dengan Environment Variables
> di Hostinger. Kalau berbeda, PESTA akan menolak setiap webhook dengan 401
> dan bot terlihat seperti "tidak menerima pesan sama sekali".

Varian image `noweb-*` memakai baileys tanpa Chromium. Varian `chrome-*`
menjalankan Chromium dan memakan 300-500 MB RAM lebih banyak tanpa manfaat
di sini - RAM itu nanti dibutuhkan AI worker pada Fase 2.

---

## 6. Nyalakan engine

```bash
chmod +x ~/beregam/infra/start-beregam.sh
~/beregam/infra/start-beregam.sh
```

Periksa:

```bash
docker compose -f ~/beregam/infra/docker-compose.yml ps
curl -s -H "X-Api-Key: <isi-WAHA_API_KEY>" http://127.0.0.1:3001/health
```

**Pastikan tidak bisa diakses dari luar PC.** Dari komputer lain di jaringan
kantor, coba buka `http://<ip-pc>:3001` - harus **gagal terhubung**. Kalau
bisa dibuka, portnya salah bind dan siapa pun di kantor dapat mengirim
WhatsApp atas nama BPS. Periksa lagi baris `ports:` di `docker-compose.yml`.

---

## 7. Panel kendali

Sebelum menautkan nomor, pasang panel kendali - seluruh langkah berikutnya
jauh lebih mudah lewat panel daripada lewat baris perintah.

```bash
bash ~/beregam/infra/pasang-worker.sh
```

Skrip itu memasang dua layanan sekaligus: **worker pesan** dan **panel
kendali**. Setelah selesai, buka di browser Windows:

**http://localhost:3100**

Panel hanya mendengarkan di `127.0.0.1`. Komputer lain di jaringan kantor
tidak bisa membukanya, dan itu disengaja - panel bisa memutus tautan
WhatsApp dan mematikan worker.

Yang bisa dikerjakan dari panel:

| Kebutuhan | Caranya |
|---|---|
| Menautkan nomor WhatsApp | Tombol **Tautkan dengan kode** atau **QR** |
| WhatsApp terputus | Lihat kartu WhatsApp, tautkan ulang dari situ |
| Bot tidak membalas | Periksa kartu Worker, Engine, dan Sambungan ke PESTA |
| Pesan menumpuk | Kartu **Antrean pesan** - berapa menunggu, berapa gagal |
| Melihat sebabnya | Bagian **Log**, worker atau engine |
| Menyalakan ulang | Tombol di kartu Worker atau Engine |

---

## 8. Tautkan nomor WhatsApp

Pakai **pairing code**, bukan scan QR.

Alasannya bukan soal selera: langkah ini akan dijalankan rekan kerja saat
Anda cuti. Memasukkan 8 karakter di HP jauh lebih mudah daripada memindai
QR, dan kodenya bisa didiktekan lewat telepon kalau yang memegang HP sedang
tidak satu ruangan.

1. Buka **http://localhost:3100**
2. Tekan **Tautkan dengan kode**
3. Isi nomornya lengkap dengan kode negara: `6285169881015`
   (bukan `085169881015` - panel akan menolak dan memberi tahu)
4. Di HP pemegang SIM: **WhatsApp Business -> Perangkat Tertaut ->
   Tautkan Perangkat -> Tautkan dengan nomor telepon**
5. Masukkan kode yang muncul di panel. Berlaku sekitar satu menit
6. Kartu WhatsApp di panel berubah menjadi **Tersambung**, dengan nomor
   yang tertaut terlihat di bawahnya

> Engine menyambung sebagai **perangkat tertaut**, bukan sebagai pemilik
> utama. Jadi saat PC mati, HP tetap menerima semua pesan warga seperti
> biasa. Itulah yang membuat lapis pertahanan ketiga bekerja tanpa saklar.

**Minimal dua orang harus pernah mempraktikkan langkah ini.** Kalau hanya
satu orang yang bisa menautkan ulang nomor, satu kali cuti panjang berarti
layanan mati.

### Rilis bertahap

Nomor 6285169881015 sudah punya riwayat dan kontak. Begitu ditautkan, bot
langsung menerima pesan dari percakapan yang sudah berjalan.

Karena itu: tautkan dulu dengan **saklar bot dimatikan** dari halaman admin
PESTA, amati pesan yang masuk satu sampai dua hari lewat panel, baru
nyalakan botnya.

---

## 9. Autostart Windows

Jalankan sekali di PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Aplikasi dan Website\Beregam\infra\pasang-autostart.ps1"
```

Yang didaftarkan hanya satu tugas: sebuah proses di dalam WSL yang tidak
pernah selesai. Kelihatannya sepele, tapi inilah yang membuat sisa rantai
bekerja.

**WSL2 menghentikan distribusi yang tidak punya proses aktif, lalu
membongkar mesin virtualnya.** Kontainer Docker dan layanan systemd tidak
selalu cukup menahannya. Saat WSL dibongkar, engine WhatsApp ikut mati - dan
sesi WhatsApp yang mati berulang kali tidak akan pernah bertahan cukup lama
untuk melayani siapa pun. Kegagalan ini sunyi: tidak ada pesan galat, bot
hanya berhenti membalas.

Efek keduanya: penerusan `localhost` dari Windows ke WSL hanya hidup selama
distribusinya jalan. Tanpa tugas ini, panel di `localhost:3100` tidak bisa
dibuka dari browser Windows walaupun panelnya sendiri sehat.

Setelah distribusi tertahan hidup, sisanya menyusul sendiri: Docker
menyalakan kontainer lewat *restart policy*, systemd menyalakan worker dan
panel lewat *linger*.

Pasangannya ada di `.wslconfig`:

```ini
vmIdleTimeout=-1
```

Dua lapis dipakai untuk hal yang sama karena taruhannya layanan mati diam-diam.

> Jalankan sebagai **Administrator** bila ingin Beregam hidup bahkan sebelum
> ada yang login. Tanpa hak admin, skrip tetap terpasang tetapi hanya dengan
> pemicu saat logon - cukup untuk PC yang di-set login otomatis.

---

## 10. Gerbang kualitas: uji cabut kabel

**Jangan lanjut ke tahap berikutnya sebelum uji ini lulus.**

1. Pastikan semuanya berjalan normal
2. **Cabut kabel listrik PC.** Bukan shutdown - cabut betulan
3. Tunggu 30 detik
4. Colok lagi
5. Jangan sentuh apa pun. Nyalakan stopwatch

Dalam **5 menit**, tanpa disentuh siapa pun, harus terpenuhi:

- [ ] PC menyala sendiri
- [ ] Windows login sendiri
- [ ] `docker ps` menampilkan container `beregam-waha` berstatus healthy
- [ ] `curl -s -H "X-Api-Key: <isi-WAHA_API_KEY>" http://127.0.0.1:3001/health` menjawab
- [ ] Sesi WhatsApp aktif kembali tanpa perlu tautkan ulang

Catat waktu sebenarnya di runbook.

**Kalau gagal:** periksa log di `infra/data/start-beregam.log`, lalu telusuri
mundur - BIOS (langkah 1), auto-login (langkah 2), Task Scheduler (langkah 8).

> **Rekomendasi: pasang UPS kecil.** Mati lampu sekejap adalah gangguan
> paling sering di Indonesia. Tanpa UPS, tiap kedipan listrik berarti bot
> mati lalu butuh beberapa menit untuk boot ulang. Dengan UPS, kedipan
> listrik jadi bukan peristiwa sama sekali. Nilainya jauh melampaui PC
> cadangan yang harganya berlipat.

---

## 11. Setelah semuanya jalan

- [ ] Simpan `.env` di brankas kredensial (**bukan** di repo)
- [ ] Catat sandi Ubuntu dan sandi Windows di brankas yang sama
- [ ] Latih minimal 2 orang untuk langkah 7
- [ ] Catat hasil uji langkah 9 di runbook
- [ ] Baru setelah semua ini, arahkan `PESTA_BASE_URL` ke produksi

---

## Yang sengaja TIDAK di-backup

**Kredensial sesi WhatsApp** di `infra/data/waha/`.

Berkas itu setara kunci untuk menyamar sebagai WhatsApp resmi BPS.
Menyalinnya ke drive cadangan atau cloud menciptakan liabilitas keamanan
yang jauh lebih besar daripada nilai dua menit yang dihemat.

Pemulihan bukan *restore*, melainkan **pasang lalu tautkan ulang** lewat
pairing code - sekitar dua menit.

Yang justru perlu disimpan aman: berkas `.env`, dan itu ada di brankas
kredensial, bukan di mana pun di dalam repositori.
