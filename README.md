# Kost Tiga A

Website ini menggunakan HTML, CSS, dan JavaScript di sisi browser, dengan server Node.js bawaan untuk menyajikan halaman dan aset statis. Server tidak memerlukan framework atau dependensi tambahan.

## Menjalankan secara lokal

Pastikan Node.js 18 atau yang lebih baru sudah terpasang, lalu jalankan:

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

## Dasbor statistik

`/admin/logs`, `/admin/stats`, dan `/admin/kamar` dilayani Node.js dan memakai HTTP Basic Auth dengan pasangan `ADMIN_USER` dan `ADMIN_PASSWORD` yang sama. Atur kedua environment variable tersebut sebelum menjalankan server. Jangan simpan password ke Git.

Di PowerShell lokal:

```powershell
$env:ADMIN_USER = "admin"
$env:ADMIN_PASSWORD = "pilih-password-lokal-yang-kuat"
npm start
```

Di VPS, atur `ADMIN_USER` dan `ADMIN_PASSWORD` di drop-in systemd service Node. Gunakan kredensial yang sama dengan user/password pada file htpasswd Nginx. Nginx tetap melakukan Basic Auth, lalu meneruskan header `Authorization` ke Node untuk pemeriksaan kedua:

```ini
[Service]
Environment=ADMIN_USER=nama-user-htpasswd
Environment=ADMIN_PASSWORD=password-yang-sama-dengan-htpasswd
```

Tambahkan nilai tersebut secara privat lewat `sudo systemctl edit kost-tiga-a`; jangan menaruhnya di repository atau mengirimkannya lewat chat. Simpan konfigurasi, lalu jalankan `sudo systemctl daemon-reload`.

```nginx
location ^~ /admin/ {
    auth_basic "Kost Tiga A";
    auth_basic_user_file /etc/nginx/kost-tiga-a-logs.htpasswd;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3000;
}
```

Sebelum memakai blok tersebut, hapus/ganti semua location Nginx lama yang khusus menangani `/admin/logs`, `/admin/stats`, atau `/admin/kamar`; location exact yang lama akan tetap mengalahkan blok di atas. Setelah perubahan Nginx, uji dengan `sudo nginx -t` lalu reload Nginx. Pastikan password yang dipakai Basic Auth cocok dengan `ADMIN_USER`/`ADMIN_PASSWORD` di systemd.

Urutan migrasi VPS: set pasangan environment baru, deploy file aplikasi, restart service Node, lalu ganti location Nginx dan reload. Untuk sementara, server masih menerima header rahasia lama pada statistik/form kamar dan halaman log masih bisa membaca format log Nginx lama, sehingga perpindahan bisa dilakukan bertahap. Setelah blok Nginx baru aktif, hapus konfigurasi `X-Admin-Secret` lama dan `ADMIN_SECRET` dari systemd, lalu restart service.

`deploy.ps1` mengirim branch yang sedang aktif ke VPS dan GitHub. Jadi branch fitur dapat diuji tanpa mengubah `main`; untuk deploy dari branch fitur, jalankan `.\deploy.ps1 -Message "Uji dashboard lokal dan VPS"` setelah semua perubahan di-commit. Kode Node.js yang berubah memerlukan `sudo systemctl restart kost-tiga-a` di VPS. Konfigurasi Nginx dan kredensial systemd tetap harus diterapkan manual sesuai langkah di atas. Untuk kembali, pindah ke `main` lalu deploy lagi; data di `DATA_DIR` tetap terpisah dari kode.

`/admin/logs` menampilkan hingga 1.000 request terakhir yang mencapai Node.js. Data disimpan di `access.jsonl` di dalam `DATA_DIR` (hingga 10.000 baris); query string tidak dicatat. Di VPS, Nginx masih dapat menyajikan file aset statis secara langsung, jadi akses aset yang tidak diteruskan ke Node tidak muncul di dashboard log.

`/admin/stats` menampilkan pengunjung unik, klik WhatsApp (total, 7 hari, hari ini, grafik 14 hari, per kost/varian/posisi tombol), dan ketersediaan kamar.

## Form kamar kosong (`/admin/kamar`)

Alternatif dari CLI: form web yang nyaman dipakai dari HP dan dilindungi Basic Auth yang sama. Kolom yang dikosongkan tidak mengubah/menampilkan tipe itu, angka 0 berarti penuh. Karena browser mengirim Basic Auth otomatis, POST dari situs lain ditolak (header `Origin` harus sama dengan host).

## Cap "Terakhir diperbarui"

Di halaman `/`, tulisan "Terakhir diperbarui" diisi server dari waktu terbaru antara file `index.html`, file varian tema yang dipakai, dan `rooms.json` (ubah kamar kosong ikut memperbarui cap). Waktu ditampilkan dalam WIB. Halaman `2.html`–`6.html` yang dibuka langsung tetap memakai cap yang ditulis `deploy.ps1`.

## Tes

```sh
npm test
```

Untuk produksi, gunakan layanan hosting yang mendukung aplikasi Node.js dan menjalankan perintah `npm start`. Hosting statis seperti GitHub Pages tidak menjalankan server Node.js.
