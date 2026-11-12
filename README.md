# Kost Tiga A

Website ini menggunakan HTML, CSS, dan JavaScript di sisi browser, dengan server Node.js bawaan untuk menyajikan halaman dan aset statis. Server tidak memerlukan framework atau dependensi tambahan.

## Menjalankan secara lokal

Pastikan Node.js 22 atau yang lebih baru sudah terpasang, lalu jalankan:

```sh
npm start
```

Buka alamat yang ditampilkan di terminal (secara default `http://localhost:3000`). Untuk memilih port lain, atur variabel lingkungan `PORT`. Atur `HOST=127.0.0.1` jika server hanya boleh diakses lewat reverse proxy seperti nginx.

Untuk menguji perubahan dashboard tanpa mengubah `main`, jalankan server lokal dari branch fitur. Di PowerShell, atur `HOST=127.0.0.1`, `ADMIN_USER`, dan `ADMIN_PASSWORD` sebelum `npm start`; ketiga halaman admin akan meminta login yang sama.

## Statistik klik WhatsApp

Setiap klik tombol WhatsApp dicatat oleh [wa-track.js](./wa-track.js) ke `POST /api/click`, lalu disimpan di `clicks.jsonl` pada folder `DATA_DIR` (default `./data`). Yang dicatat hanya waktu, kost tujuan, varian halaman, dan posisi tombol. IP dan identitas pengunjung tidak disimpan. Tautan `wa.me` tetap berfungsi walau server Node mati.

Lihat ringkasannya dengan:

```sh
npm run clicks
```

Untuk produksi, atur `DATA_DIR` ke folder di luar web root yang bisa ditulis user layanan (misalnya `StateDirectory=kost-tiga-a` di systemd, yaitu `/var/lib/kost-tiga-a`).

## Penghitung pengunjung unik

[counter.js](./counter.js) memakai endpoint `/api/visitors` milik server ini (bukan layanan pihak ketiga). Browser yang belum pernah dihitung mengirim `POST` (menambah 1), selanjutnya hanya `GET`. Hitungan disimpan di `visitors.json` pada folder `DATA_DIR` dan tetap ada setelah server di-restart. Untuk melanjutkan angka dari penghitung lama, buat file `visitors.json` berisi `{"count":45}` sebelum server pertama kali menerima kunjungan.

## Varian tema

Halaman `/` memilih salah satu dari enam tema di server dan menyimpannya di cookie `kost-variant` (1 tahun, HttpOnly). Tema langsung benar pada respons pertama, tanpa kedipan atau fetch tambahan. Skrip pemilih di `index.html` tetap ada sebagai cadangan jika situs dilayani sebagai file statis.

## Status ketersediaan kamar

Jumlah kamar kosong tiap kost, dipisah per tipe (AC dan non-AC), disimpan di `rooms.json` pada folder `DATA_DIR`, dibaca lewat `GET /api/rooms`, dan ditampilkan sebagai lencana di kartu kost oleh [rooms-status.js](./rooms-status.js). Tipe yang belum diatur tidak ditampilkan. Ubah lewat CLI (di VPS dijalankan sebagai `www-data` agar file bisa ditulis):

```bash
sudo -u www-data DATA_DIR=/var/lib/kost-tiga-a node scripts/rooms.js alya ac 1
sudo -u www-data DATA_DIR=/var/lib/kost-tiga-a node scripts/rooms.js alya nonac 0
sudo -u www-data DATA_DIR=/var/lib/kost-tiga-a node scripts/rooms.js athaya ac 2
DATA_DIR=/var/lib/kost-tiga-a node scripts/rooms.js   # lihat status
```

Angka 0 menampilkan "penuh". Perubahan langsung tampil tanpa restart.

## Panel admin

Log akses, statistik, dan kamar kosong sekarang tersedia pada satu halaman `/admin`. Menu di halaman hanya berpindah ke bagian `#logs`, `#stats`, dan `#rooms`; halaman memakai query `?data=logs` untuk memuat data log tanpa membuat route admin terpisah. URL lama `/admin/logs`, `/admin/stats`, dan `/admin/kamar` mengarahkan ke bagian yang sesuai di panel admin. Akses ke `/dashboard` otomatis dialihkan (redirect 301) ke `/admin`.

Dashboard memakai form login dengan pasangan `ADMIN_USER` dan `ADMIN_PASSWORD`. Setelah login, server membuat sesi cookie `HttpOnly` yang berlaku 8 jam; tombol Keluar mencabut sesi tersebut. HTTP Basic Auth tidak digunakan lagi. Atur kedua environment variable sebelum menjalankan server dan jangan simpan password ke Git.

Di PowerShell lokal:

```powershell
$env:ADMIN_USER = "admin"
$env:ADMIN_PASSWORD = "pilih-password-lokal-yang-kuat"
npm start
```

Di VPS, atur `ADMIN_USER` dan `ADMIN_PASSWORD` di drop-in systemd service Node. Akses dashboard harus lewat HTTPS agar cookie sesi memakai atribut `Secure`:

```ini
[Service]
Environment=ADMIN_USER=nama-user-htpasswd
Environment=ADMIN_PASSWORD=password-yang-sama-dengan-htpasswd
```

Tambahkan nilai tersebut secara privat lewat `sudo systemctl edit kost-tiga-a`; jangan menaruhnya di repository atau mengirimkannya lewat chat. Simpan konfigurasi, lalu jalankan `sudo systemctl daemon-reload`.

Deploy memakai key SSH Ed25519 khusus di `~/.ssh/kost-tiga-a-admin` (tanpa passphrase agar skrip dapat berjalan tanpa prompt). Pasang isi file `~/.ssh/kost-tiga-a-admin.pub` ke `~admin/.ssh/authorized_keys` di VPS melalui akses admin/console. Jangan salin atau bagikan file private key `kost-tiga-a-admin`; lindungi file tersebut dengan izin akun Windows Anda.

Di VPS, aplikasi berjalan sebagai proses PM2 `kost-tiga-a` milik user `admin`. `deploy.ps1` me-restart proses itu dengan `pm2 restart kost-tiga-a`, lalu memastikan `http://127.0.0.1:3000/` merespons. Atur environment variable (mis. `ADMIN_USER`, `ADMIN_PASSWORD`) lewat konfigurasi PM2, bukan di repository.

```nginx
location /dashboard {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3000;
}

```

`admin-logs.html` lama hanya mengarahkan ke `/dashboard#logs` jika masih disajikan langsung oleh konfigurasi Nginx lama. Hapus konfigurasi Nginx lama yang secara langsung menyajikan halaman log atau menambahkan `X-Admin-Secret`; location lama dapat mengambil alih permintaan sebelum Node menerimanya. Setelah perubahan, uji dengan `sudo nginx -t` lalu reload Nginx.

Migrasi VPS harus dilakukan setelah deploy branch fitur: set kredensial systemd, tambahkan location `/dashboard` di Nginx, lalu hapus konfigurasi lama untuk `/admin/*`, uji dan reload Nginx. Deploy berikutnya akan me-restart Node secara otomatis. Jangan deploy sebelum siap melakukan perubahan konfigurasi Nginx karena route admin lama akan diganti menjadi 404. Setelah migrasi, hapus `ADMIN_SECRET` lama dari systemd.

`deploy.ps1` mengirim branch yang sedang aktif ke VPS dan GitHub. Jadi branch fitur dapat diuji tanpa mengubah `main`; untuk deploy dari branch fitur, jalankan `.\deploy.ps1 -Message "Dashboard satu halaman"` setelah semua perubahan di-commit. Konfigurasi Nginx dan kredensial systemd tetap harus diterapkan manual. Untuk kembali, pindah ke `main` lalu deploy lagi dan pulihkan konfigurasi Nginx sebelumnya; data di `DATA_DIR` tetap terpisah dari kode.

Bagian Log akses menampilkan hingga 1.000 request terakhir yang mencapai Node.js. Data disimpan di `access.jsonl` di dalam `DATA_DIR` (hingga 10.000 baris); query string tidak dicatat. Di VPS, Nginx masih dapat menyajikan file aset statis secara langsung, jadi akses aset yang tidak diteruskan ke Node tidak muncul di log.

Bagian Statistik menampilkan pengunjung unik, klik WhatsApp (total, 7 hari, hari ini, grafik 14 hari, per kost/varian/posisi tombol), dan ketersediaan kamar.

## Form kamar kosong

Form web pada bagian Kamar kosong nyaman dipakai dari HP dan dilindungi sesi dashboard yang sama. Kolom yang dikosongkan tidak mengubah/menampilkan tipe itu, angka 0 berarti penuh. POST dari situs lain ditolak (header `Origin` harus sama dengan host).

## Cap "Terakhir diperbarui"

Di halaman `/`, tulisan "Terakhir diperbarui" diisi server dari waktu terbaru antara file `index.html`, file varian tema yang dipakai, dan `rooms.json` (ubah kamar kosong ikut memperbarui cap). Waktu ditampilkan dalam WIB. Halaman `2.html`–`6.html` yang dibuka langsung tetap memakai cap yang ditulis `deploy.ps1`.

## Tes

```sh
npm test
```

Untuk produksi, gunakan layanan hosting yang mendukung aplikasi Node.js dan menjalankan perintah `npm start`. Hosting statis seperti GitHub Pages tidak menjalankan server Node.js.
