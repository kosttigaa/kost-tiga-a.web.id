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

## Tes

```sh
npm test
```

Untuk produksi, gunakan layanan hosting yang mendukung aplikasi Node.js dan menjalankan perintah `npm start`. Hosting statis seperti GitHub Pages tidak menjalankan server Node.js.
