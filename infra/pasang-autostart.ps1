# =============================================================================
# Mendaftarkan Beregam agar hidup sendiri setiap kali Windows menyala.
#
# Jalankan SEKALI:
#   powershell -ExecutionPolicy Bypass -File pasang-autostart.ps1
#
# Aman dijalankan berulang - tugas yang sudah ada akan diperbarui.
#
# APA YANG DIDAFTARKAN
#
# Satu tugas: sebuah proses di dalam WSL yang tidak pernah selesai. Sepintas
# sepele, tapi inilah yang membuat sisa rantai bekerja:
#
#   1. WSL2 menghentikan distribusi yang tidak punya proses aktif, lalu
#      membongkar mesin virtualnya. Kontainer Docker dan layanan systemd
#      tidak selalu cukup untuk menahannya - dan saat WSL dibongkar, engine
#      WhatsApp ikut mati. Sesi WhatsApp yang mati berulang kali tidak akan
#      pernah bertahan cukup lama untuk melayani siapa pun.
#
#   2. Penerusan localhost dari Windows ke WSL hanya hidup selama
#      distribusinya jalan. Tanpa ini, panel kendali di 127.0.0.1:3100 tidak
#      bisa dibuka dari browser Windows walaupun panelnya sendiri sehat.
#
# Setelah distribusi tertahan hidup, sisanya menyusul sendiri: Docker
# menyalakan kontainer lewat restart policy, systemd menyalakan worker dan
# panel lewat linger.
#
# PENTING: perintahnya didaftarkan LANGSUNG sebagai aksi tugas, bukan
# dibungkus skrip yang memanggil Start-Process. Proses yang dilahirkan
# skrip pembungkus ikut mati begitu pembungkusnya selesai - persis yang
# terjadi saat pendekatan itu dicoba. Task Scheduler memegang prosesnya
# sendiri, dan dengan ExecutionTimeLimit nol ia dibiarkan hidup selamanya.
# =============================================================================

param(
    [string]$Distro = "Ubuntu-24.04",
    [string]$NamaTugas = "Beregam - Penahan WSL"
)

$ErrorActionPreference = "Stop"

$wsl = Join-Path $env:SystemRoot "System32\wsl.exe"
if (-not (Test-Path $wsl)) {
    Write-Error "Tidak menemukan wsl.exe. Pastikan WSL sudah terpasang."
    exit 1
}

$adaDistro = & $wsl -l -q 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $Distro }
if (-not $adaDistro) {
    Write-Error "Distribusi '$Distro' tidak ada. Lihat daftarnya dengan: wsl -l -v"
    exit 1
}

Write-Output "Mendaftarkan tugas: $NamaTugas"
Write-Output "  distro : $Distro"
Write-Output ""

$aksi = New-ScheduledTaskAction -Execute $wsl `
    -Argument "-d $Distro -u root --exec sleep infinity"

# Task berbasis pengguna berhenti saat sesi pengguna berakhir. Untuk bot yang
# harus hidup 24 jam, Windows menjalankan tugas sejak boot dengan token S4U
# milik pengguna yang memasang WSL. SYSTEM tidak dipakai karena distribusi WSL
# terdaftar per pengguna dan belum tentu terlihat oleh akun SYSTEM.
# Jalur pengguna biasa tetap disediakan sebagai pemulihan sementara, tetapi
# tidak pernah diklaim sebagai konfigurasi layanan 24 jam.
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$adminSekarang = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if ($adminSekarang) {
    $pemicu = @(New-ScheduledTaskTrigger -AtStartup)
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType S4U -RunLevel Highest
    Write-Output "  hak    : administrator - layanan sejak Windows menyala"
} else {
    $pemicu = @(New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
    $principal = $null
    Write-Output "  hak    : pengguna biasa - hanya pemulihan saat logon"
    Write-Output "           jalankan sebagai Administrator untuk autostart 24 jam"
}

# ExecutionTimeLimit nol wajib: tanpa itu Windows membunuh tugas setelah
# tiga hari, dan bot mati tiap tiga hari tanpa sebab yang terlihat.
#
# IgnoreNew mencegah penumpukan bila pemicunya berbunyi saat tugas sudah
# jalan. RestartCount menutup kasus WSL yang dibongkar paksa.
$setelan = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# -Force menimpa tugas bernama sama, jadi tidak perlu dihapus lebih dulu.
# Menghapus dulu justru berbahaya: kalau pendaftaran gagal karena hak akses,
# sistem tertinggal tanpa tugas sama sekali - persis yang pernah terjadi.
try {
    $argumenTugas = @{
        TaskName = $NamaTugas
        Action = $aksi
        Trigger = $pemicu
        Settings = $setelan
        Description = "Menahan WSL agar engine WhatsApp, worker, dan panel Beregam tetap hidup 24 jam."
        Force = $true
    }
    if ($null -ne $principal) {
        $argumenTugas.Principal = $principal
    }
    Register-ScheduledTask @argumenTugas | Out-Null
} catch {
    Write-Output ""
    Write-Output "GAGAL mendaftarkan tugas: $($_.Exception.Message)"
    Write-Output "Tugas yang sudah ada (bila ada) tidak diubah."
    exit 1
}

Write-Output "Terdaftar. Menjalankan sekarang..."
Start-ScheduledTask -TaskName $NamaTugas
Start-Sleep -Seconds 10

$info = Get-ScheduledTaskInfo -TaskName $NamaTugas
$tugas = Get-ScheduledTask -TaskName $NamaTugas

Write-Output ""
Write-Output "Keadaan tugas  : $($tugas.State)   (Running = sedang menahan)"
Write-Output "Hasil terakhir : $($info.LastTaskResult)  (267009 = sedang jalan, 0 = selesai)"
Write-Output ""

if ($tugas.State -eq "Running") {
    Write-Output "Berhasil. WSL akan tetap hidup selama Windows menyala."
} else {
    Write-Output "PERINGATAN: tugas tidak dalam keadaan Running."
    Write-Output "Periksa di Task Scheduler, bagian History."
}

Write-Output ""
Write-Output "Panel kendali: http://localhost:3100"
