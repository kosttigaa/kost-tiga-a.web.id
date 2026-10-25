# Kost Tiga A

Website ini menggunakan HTML, CSS, dan JavaScript di sisi browser, dengan server Node.js bawaan untuk menyajikan halaman dan aset statis. Server tidak memerlukan framework atau dependensi tambahan.

## Menjalankan secara lokal

Pastikan Node.js 18 atau yang lebih baru sudah terpasang, lalu jalankan:

```sh
npm start
```

Buka alamat yang ditampilkan di terminal (secara default `http://localhost:3000`). Untuk memilih port lain, atur variabel lingkungan `PORT`. Atur `HOST=127.0.0.1` jika server hanya boleh diakses lewat reverse proxy seperti nginx.

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

`/admin/stats` menampilkan pengunjung unik, klik WhatsApp (total, 7 hari, hari ini, grafik 14 hari, per kost/varian/posisi tombol), dan ketersediaan kamar. Halaman ini hanya dilayani jika request membawa header `X-Admin-Secret` yang sama dengan env `ADMIN_SECRET`; tanpa env itu, atau dengan header salah, jawabannya 404. Di produksi nginx yang menambahkan header tersebut setelah basic auth:

```nginx
location = /admin/stats {
    auth_basic "Admin";
    auth_basic_user_file /etc/nginx/.htpasswd;   # samakan dengan yang dipakai /admin/logs
    proxy_set_header X-Admin-Secret "ISI_RAHASIA";
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:3000;
}
```

Nilai `ISI_RAHASIA` sama dengan `ADMIN_SECRET` di unit systemd (`Environment=ADMIN_SECRET=...`). Untuk mencoba lokal: `ADMIN_SECRET=abc npm start`, lalu `curl -H "X-Admin-Secret: abc" http://localhost:3000/admin/stats`.

## Tes

```sh
npm test
```

Untuk produksi, gunakan layanan hosting yang mendukung aplikasi Node.js dan menjalankan perintah `npm start`. Hosting statis seperti GitHub Pages tidak menjalankan server Node.js.
