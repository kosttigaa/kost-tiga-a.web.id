# Aturan Pengembangan & Deployment Kost Tiga A

## Alur Kerja Deployment (SOP)
Setiap tugas yang melibatkan penambahan fitur, perbaikan bug, atau perubahan konten website/dashboard harus mengikuti alur kerja 3 tahap:

1. **Uji & Verifikasi Lokal (Deploy ke Local):**
   - Lakukan modifikasi kode sesuai permintaan.
   - Jalankan validasi pengujian lokal secara menyeluruh:
     - Linting: `npm --prefix dashboard run lint`
     - Build dashboard: `npm run dashboard:build`
     - Unit/Integration test: `npm test`
     - Validasi fungsionalitas dan respons server lokal (`http://localhost:3000`).

2. **Lapor & Menunggu Persetujuan Pengguna (Approval Gate):**
   - Berikan laporan ringkas mengenai perubahan yang telah selesai dan hasil pengujian lokal.
   - **STOP & VERIFY:** Jangan pernah mengeksekusi skrip deployment ke server produksi (`deploy.ps1`) atau melakukan git push ke remote sebelum pengguna memberikan persetujuan eksplisit (contoh: *"deploy"*, *"approved"*, *"lanjutkan"*).

3. **Deploy ke VPS Produksi (Hanya Setelah Approval):**
   - Setelah persetujuan pengguna diberikan, jalankan skrip deployment otomatis:
     `pwsh -NoProfile -Command "Set-Location 'kost-tiga-a.web.id'; .\deploy.ps1 -Message '<pesan commit>'"`
   - Pantau proses build produksi, sinkronisasi git (`origin` dan `personal`), transfer file ke VPS Utama (`162.35.43.69`) dan VPS Backup (`147.139.130.126`), restart PM2, serta konfirmasi status live.
