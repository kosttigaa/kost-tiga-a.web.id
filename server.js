import { spawn } from "node:child_process";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { promisify } from "node:util";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const publicRoot = path.dirname(fileURLToPath(import.meta.url));
const dashboardDistDir = path.join(publicRoot, "dashboard", "dist");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".xml", "application/xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const privateFiles = new Set(["server.js", "admin-logs.html"]);
const privateDirectories = new Set(["test", "data", "scripts"]);
const clickTargets = new Set(["athaya", "alya"]);
const roomTypes = ["ac", "nonac"];
const clickPages = new Set(["index.html", "2.html", "3.html", "4.html", "5.html", "6.html"]);
const clickSlotPattern = /^[a-z0-9-]{1,30}$/;
const maxClickBodyBytes = 1024;
const maxClicksPerMinute = 120;

const maxHitsPerMinute = 60;

function createVisitorStore(dataDir) {
  const file = path.join(dataDir, "visitors.json");
  let count = null;
  let queue = Promise.resolve();
  let windowStart = 0;
  let windowCount = 0;

  async function load() {
    if (count !== null) {
      return;
    }
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      count = Number.isSafeInteger(saved.count) && saved.count >= 0 ? saved.count : 0;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      count = 0;
    }
  }

  // Semua operasi diserialkan agar hitungan tidak berebut saat ada hit bersamaan
  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  return {
    allowHit() {
      const now = Date.now();
      if (now - windowStart >= 60_000) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      return windowCount <= maxHitsPerMinute;
    },
    read: () =>
      enqueue(async () => {
        await load();
        return count;
      }),
    hit: () =>
      enqueue(async () => {
        await load();
        await mkdir(dataDir, { recursive: true });
        const next = count + 1;
        const temp = `${file}.tmp`;
        await writeFile(temp, JSON.stringify({ count: next }));
        await rename(temp, file);
        count = next;
        return count;
      }),
  };
}

async function handleVisitors(request, response, store) {
  if (request.method !== "GET" && request.method !== "POST") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, POST" });
    return;
  }

  if (request.method === "POST") {
    const origin = request.headers.origin;
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (originHost !== request.headers.host) {
        sendError(response, 403, "Forbidden");
        return;
      }
    }
    if (!store.allowHit()) {
      sendError(response, 429, "Too Many Requests", { "Retry-After": "60" });
      return;
    }
  }

  const value = request.method === "POST" ? await store.hit() : await store.read();
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify({ value }));
}

function createClickStore(dataDir) {
  const file = path.join(dataDir, "clicks.jsonl");
  let windowStart = 0;
  let windowCount = 0;

  return {
    allow() {
      const now = Date.now();
      if (now - windowStart >= 60_000) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      return windowCount <= maxClicksPerMinute;
    },
    async append(entry) {
      await mkdir(dataDir, { recursive: true });
      await appendFile(file, `${JSON.stringify(entry)}\n`);
    },
  };
}

function createAccessLogStore(dataDir) {
  const file = path.join(dataDir, "access.jsonl");
  const maxEntries = 10_000;
  let writesSinceCompact = 0;
  let queue = Promise.resolve();

  async function compact() {
    const lines = (await readOptional(file)).split("\n").filter(Boolean).slice(-maxEntries);
    await writeFile(`${file}.tmp`, `${lines.join("\n")}${lines.length ? "\n" : ""}`);
    await rename(`${file}.tmp`, file);
  }

  return {
    record(entry) {
      const task = queue.then(async () => {
        await mkdir(dataDir, { recursive: true });
        await appendFile(file, `${JSON.stringify(entry)}\n`);
        writesSinceCompact += 1;
        if (writesSinceCompact >= 250) {
          writesSinceCompact = 0;
          await compact();
        }
      });
      queue = task.catch((error) => {
        console.error("Failed to record access log:", error);
      });
      return queue;
    },
    read() {
      return queue.then(async () => {
        const lines = (await readOptional(file)).split("\n").filter(Boolean).slice(-maxEntries);
        return lines.flatMap((line) => {
          try {
            const entry = JSON.parse(line);
            return typeof entry.ip === "string" &&
              typeof entry.time === "string" &&
              typeof entry.path === "string" &&
              typeof entry.method === "string" &&
              Number.isInteger(entry.status) &&
              typeof entry.userAgent === "string"
              ? [entry]
              : [];
          } catch {
            return [];
          }
        }).slice(-1000).reverse();
      });
    },
    flush() {
      return queue;
    },
  };
}

function readSmallBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxClickBodyBytes) {
        request.destroy();
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function handleClick(request, response, store) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method Not Allowed", { Allow: "POST" });
    return;
  }

  const origin = request.headers.origin;
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== request.headers.host) {
      sendError(response, 403, "Forbidden");
      return;
    }
  }

  let payload;
  try {
    payload = JSON.parse(await readSmallBody(request));
  } catch (error) {
    if (error.statusCode === 413) {
      sendError(response, 413, "Payload Too Large", { Connection: "close" });
    } else {
      sendError(response, 400, "Bad Request");
    }
    return;
  }

  const { target, page, slot } = payload ?? {};
  if (!clickTargets.has(target) || !clickPages.has(page) || !clickSlotPattern.test(slot ?? "")) {
    sendError(response, 400, "Bad Request");
    return;
  }

  if (!store.allow()) {
    sendError(response, 429, "Too Many Requests", { "Retry-After": "60" });
    return;
  }

  try {
    await store.append({ ts: new Date().toISOString(), target, page, slot });
  } catch (error) {
    console.error("Failed to record WhatsApp click:", error);
  }
  response.writeHead(204, { "Cache-Control": "no-store" });
  response.end();
}
async function readRooms(dataDir) {
  const rooms = {};
  try {
    const saved = JSON.parse(await readFile(path.join(dataDir, "rooms.json"), "utf8"));
    for (const target of clickTargets) {
      const entry = saved?.[target];
      for (const type of roomTypes) {
        const count = entry?.[type];
        if (Number.isSafeInteger(count) && count >= 0 && count <= 99) {
          rooms[target] = { ...rooms[target], [type]: count };
        }
      }
    }
    if (typeof saved?.updatedAt === "string" && !Number.isNaN(Date.parse(saved.updatedAt))) {
      rooms.updatedAt = saved.updatedAt;
    }
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      throw error;
    }
  }
  return rooms;
}

async function handleRooms(request, response, dataDir) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  const rooms = await readRooms(dataDir);

  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : JSON.stringify(rooms));
}

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" });
const targetNames = { athaya: "Kost Putri: Athaya", alya: "Kost Putri: Alya" };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function summarizeClicks(text, now = new Date()) {
  const summary = { total: 0, today: 0, last7: 0, target: {}, page: {}, slot: {}, days: {} };
  const add = (group, key) => {
    group[key] = (group[key] ?? 0) + 1;
  };
  const today = dayFormat.format(now);
  const weekAgo = dayFormat.format(new Date(now.getTime() - 6 * 86_400_000));

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const time = new Date(entry?.ts);
    if (Number.isNaN(time.getTime())) continue;

    const day = dayFormat.format(time);
    summary.total += 1;
    if (day === today) summary.today += 1;
    if (day >= weekAgo && day <= today) summary.last7 += 1;
    add(summary.target, entry.target);
    add(summary.page, entry.page);
    add(summary.slot, `${entry.target} / ${entry.slot}`);
    add(summary.days, day);
  }
  return summary;
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
function readBody(request, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        request.destroy();
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readRegistrations(dataDir) {
  try {
    const raw = await readFile(path.join(dataDir, "registrations.jsonl"), "utf8");
    const list = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        list.push(JSON.parse(trimmed));
      } catch {}
    }
    return list.reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

let regWriteQueue = Promise.resolve();

async function saveRegistration(dataDir, entry) {
  const task = regWriteQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await appendFile(path.join(dataDir, "registrations.jsonl"), JSON.stringify(entry) + "\n", "utf8");

    // Simpan ke database SQLite kost.db
    try {
      const dbPath = path.join(publicRoot, "dashboard", "server", "data", "kost.db");
      if (existsSync(dbPath)) {
        const db = new DatabaseSync(dbPath);
        db.exec(`
          CREATE TABLE IF NOT EXISTS registrations (
            id TEXT PRIMARY KEY,
            seq INTEGER NOT NULL,
            kost TEXT,
            full_name TEXT,
            nik TEXT,
            phone TEXT,
            address TEXT,
            guardian_name TEXT,
            guardian_phone TEXT,
            vehicle TEXT,
            ktp_image TEXT,
            pdf_file TEXT,
            status TEXT,
            date TEXT,
            note TEXT,
            extra TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
          )
        `);
        const countRow = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM registrations").get();
        const nextSeq = countRow ? countRow.nextSeq : 1;
        const stmt = db.prepare(`
          INSERT INTO registrations (
            id, seq, kost, full_name, nik, phone, address,
            guardian_name, guardian_phone, vehicle, ktp_image, pdf_file,
            status, date, note, extra, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            kost = excluded.kost,
            full_name = excluded.full_name,
            nik = excluded.nik,
            phone = excluded.phone,
            address = excluded.address,
            guardian_name = excluded.guardian_name,
            guardian_phone = excluded.guardian_phone,
            vehicle = excluded.vehicle,
            ktp_image = excluded.ktp_image,
            pdf_file = excluded.pdf_file,
            extra = excluded.extra,
            updated_at = excluded.updated_at
        `);
        const now = new Date().toISOString();
        const dateStr = entry.timestamp ? entry.timestamp.slice(0, 10) : now.slice(0, 10);
        stmt.run(
          entry.id,
          nextSeq,
          entry.kost || null,
          entry.fullName || null,
          entry.nik || null,
          entry.phone || null,
          entry.address || null,
          entry.guardianName || null,
          entry.guardianPhone || null,
          entry.vehicle || null,
          entry.ktpImage || null,
          entry.pdfFile || null,
          "pending",
          dateStr,
          "",
          JSON.stringify({ agreement: entry.agreement }),
          now
        );
        db.close();
      }
    } catch (dbErr) {
      console.error("Failed to insert registration into SQLite:", dbErr);
    }
  });
  regWriteQueue = task.catch(() => {});
  return task;
}


function escapePdf(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text, maxChars = 92) {
  const words = String(text ?? "").trim().split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function generateRegistrationPdf(entry) {
  // ===================== HALAMAN 1 (A4: 595.28 x 841.89) =====================
  const p1Lines = [];
  const add1 = (cmd) => p1Lines.push(cmd);

  add1("q");
  // Header background bar (#354c3f)
  add1("0.208 0.298 0.247 rg");
  add1("0 766 595.28 76 re f");

  // Mandatory 3A Brand Mark Badge (x=46, y=778, w=48, h=48, r=10)
  add1("0.843 0.839 0.631 rg"); // #d7d6a1
  add1("0.208 0.259 0.224 RG"); // #354239
  add1("1.5 w");
  add1("46 778 m 74 778 l 79.52 778 84 782.48 84 788 c 84 816 l 84 821.52 79.52 826 74 826 c 46 826 l 40.48 826 36 821.52 36 816 c 36 788 l 36 782.48 40.48 778 46 778 c B");

  // 3A text inside badge
  add1("0.133 0.188 0.157 rg");
  add1("BT /F2 21 Tf 46.5 795 Td (3A) Tj ET");

  // Header Title
  add1("1 1 1 rg");
  add1("BT /F2 17 Tf 98 812 Td (KOST TIGA A) Tj ET");
  add1("BT /F1 9.5 Tf 98 794 Td (FORMULIR BUKTI PENDAFTARAN & PERSETUJUAN SEWA) Tj ET");
  add1("BT /F1 8.5 Tf 410 794 Td (Dokumen Resmi Sistem Online) Tj ET");

  // Info Box
  add1("0.965 0.953 0.922 rg");
  add1("36 710 523.28 44 re f");
  add1("0.910 0.882 0.820 RG 1 w");
  add1("36 710 523.28 44 re s");

  add1("0.141 0.176 0.161 rg");
  add1(`BT /F2 9.5 Tf 46 736 Td (ID Pendaftaran: ${escapePdf(entry.id)}) Tj ET`);
  add1(`BT /F1 8.5 Tf 46 720 Td (Waktu Submit: ${escapePdf(entry.timestampWib)}) Tj ET`);
  add1(`BT /F2 9.5 Tf 330 736 Td (Pilihan Unit: ${escapePdf(entry.kost)}) Tj ET`);
  add1("BT /F1 8.5 Tf 330 720 Td (Status: Menunggu Konfirmasi WhatsApp) Tj ET");

  // Section 1: Data Calon Penghuni
  add1("0.208 0.298 0.247 rg");
  add1("BT /F2 10.5 Tf 36 685 Td (1. IDENTITAS CALON PENGHUNI) Tj ET");
  add1("0.8 0.8 0.8 RG 0.5 w 36 678 m 559.28 678 l S");

  const fields1 = [
    ["Nama Lengkap", entry.fullName],
    ["NIK (KTP)", entry.nik],
    ["Nomor WhatsApp", entry.phone],
    ["Kendaraan", entry.vehicle || "Tidak Membawa Kendaraan"],
    ["Alamat Asal", entry.address],
  ];

  let y = 661;
  for (const [label, val] of fields1) {
    add1("0.427 0.443 0.416 rg");
    add1(`BT /F2 8.5 Tf 46 ${y} Td (${escapePdf(label)}:) Tj ET`);
    add1("0.141 0.176 0.161 rg");
    const wrapped = wrapText(val, 72);
    add1(`BT /F1 8.5 Tf 160 ${y} Td (${escapePdf(wrapped[0] || "")}) Tj ET`);
    if (wrapped.length > 1) {
      for (let w = 1; w < wrapped.length; w++) {
        y -= 11.5;
        add1(`BT /F1 8.5 Tf 160 ${y} Td (${escapePdf(wrapped[w])}) Tj ET`);
      }
    }
    y -= 13.5;
  }

  // Section 2: Kontak Darurat
  y -= 4;
  add1("0.208 0.298 0.247 rg");
  add1(`BT /F2 10.5 Tf 36 ${y} Td (2. KONTAK DARURAT (ORANG TUA / WALI)) Tj ET`);
  add1(`0.8 0.8 0.8 RG 0.5 w 36 ${y - 6} m 559.28 ${y - 6} l S`);

  y -= 18;
  const fields2 = [
    ["Nama Orang Tua / Wali", entry.guardianName || "-"],
    ["No. WhatsApp Wali", entry.guardianPhone || "-"],
  ];
  for (const [label, val] of fields2) {
    add1("0.427 0.443 0.416 rg");
    add1(`BT /F2 8.5 Tf 46 ${y} Td (${escapePdf(label)}:) Tj ET`);
    add1("0.141 0.176 0.161 rg");
    add1(`BT /F1 8.5 Tf 160 ${y} Td (${escapePdf(val)}) Tj ET`);
    y -= 13.5;
  }

  // Section 3: Tata Tertib - Bagian 1
  y -= 4;
  add1("0.208 0.298 0.247 rg");
  add1(`BT /F2 10.5 Tf 36 ${y} Td (3. KETENTUAN & TATA TERTIB SEWA KOST (BAGIAN 1 DARI 2)) Tj ET`);
  add1(`0.8 0.8 0.8 RG 0.5 w 36 ${y - 6} m 559.28 ${y - 6} l S`);

  y -= 15;
  add1("0.4 0.4 0.4 rg");
  add1(`BT /F1 7.5 Tf 36 ${y} Td (Untuk kenyamanan bersama antara seluruh penghuni dan pengelola, berikut adalah tata tertib resmi yang berlaku:) Tj ET`);

  const p1Sections = [
    {
      title: "1. Umum",
      items: [
        "Penghuni wajib menjaga ketertiban, kebersihan, dan keamanan lingkungan kost.",
        "Penghuni dilarang membawa, menyimpan, atau menggunakan barang terlarang (narkoba, senjata tajam, miras, dll).",
        "Penghuni wajib menjaga sopan santun dan tidak mengganggu kenyamanan penghuni lain.",
        "Dilarang merokok di dalam kamar dan selasar kost. Merokok hanya di area terbuka yang telah ditentukan (jika ada).",
        "Tamu dilarang menginap di dalam kamar tanpa seizin pengelola kost.",
      ]
    },
    {
      title: "2. Pembayaran",
      items: [
        "Uang sewa dibayarkan maksimal tanggal due date (jatuh tempo) setiap bulannya.",
        "Uang sewa yang sudah dibayarkan tidak dapat dikembalikan atau dialihkan dengan alasan apa pun.",
      ]
    },
    {
      title: "3. Fasilitas & Listrik",
      items: [
        "Fasilitas kost hanya untuk digunakan oleh penghuni dan tidak boleh dipinjamkan ke pihak luar tanpa izin.",
        "Penghuni wajib merawat fasilitas yang disediakan. Kerusakan akibat kelalaian menjadi tanggung jawab penghuni.",
        "Setiap kamar dilengkapi meteran listrik prabayar (token). Penghuni bertanggung jawab mengisi token listrik sendiri.",
        "Penggunaan listrik sepenuhnya menjadi tanggung jawab masing-masing penghuni kamar.",
        "Peralatan listrik berdaya tinggi (kompor listrik, setrika uap, pemanas air besar, AC portable, dll) wajib seizin pemilik demi mencegah korsleting/kebakaran.",
        "Penghuni dilarang memaku, mengebor, atau menempelkan benda di tembok kamar (paku, double tape, stiker, wallpaper, dll) tanpa izin pemilik.",
      ]
    }
  ];

  y -= 13;
  for (const sec of p1Sections) {
    add1("0.141 0.176 0.161 rg");
    add1(`BT /F2 8.5 Tf 42 ${y} Td (${escapePdf(sec.title)}) Tj ET`);
    y -= 11;

    for (let i = 0; i < sec.items.length; i++) {
      const itemText = sec.items[i];
      const numPrefix = `${sec.title.split('.')[0]}.${i + 1}. `;
      const fullText = numPrefix + itemText;
      const wrapped = wrapText(fullText, 98);

      add1("0.25 0.25 0.25 rg");
      add1(`BT /F1 7.5 Tf 48 ${y} Td (${escapePdf(wrapped[0])}) Tj ET`);
      y -= 9.5;
      for (let w = 1; w < wrapped.length; w++) {
        add1(`BT /F1 7.5 Tf 64 ${y} Td (${escapePdf(wrapped[w])}) Tj ET`);
        y -= 9.5;
      }
      y -= 0.5;
    }
    y -= 3;
  }

  // Banner Sambungan ke Halaman 2
  add1("0.96 0.96 0.94 rg");
  add1("36 45 523.28 26 re f");
  add1("0.85 0.85 0.80 RG 0.5 w");
  add1("36 45 523.28 26 re s");
  add1("0.3 0.35 0.32 rg");
  add1("BT /F2 7.5 Tf 46 55 Td (>>> Bersambung ke Halaman 2: Klausul Tamu, Kendaraan, Keamanan, Sanksi, Pelaporan RT, dan Lembar Persetujuan Sewa) Tj ET");

  // Running Footer Page 1
  add1("0.5 0.5 0.5 rg");
  add1("BT /F1 7 Tf 36 26 Td (Halaman 1 dari 2  |  Formulir Bukti Pendaftaran & Persetujuan Sewa Kost Tiga A  |  https://kost-tiga-a.web.id) Tj ET");

  add1("Q");

  // ===================== HALAMAN 2 (A4: 595.28 x 841.89) =====================
  const p2Lines = [];
  const add2 = (cmd) => p2Lines.push(cmd);

  add2("q");
  // Header background bar (#354c3f)
  add2("0.208 0.298 0.247 rg");
  add2("0 788 595.28 54 re f");

  // Mini Brand badge
  add2("0.843 0.839 0.631 rg");
  add2("36 796 34 36 re f");
  add2("0.133 0.188 0.157 rg");
  add2("BT /F2 16 Tf 42 807 Td (3A) Tj ET");

  add2("1 1 1 rg");
  add2("BT /F2 12 Tf 78 817 Td (KOST TIGA A - KETENTUAN & TATA TERTIB SEWA (LANJUTAN)) Tj ET");
  add2(`BT /F1 8 Tf 78 802 Td (No. Registrasi: ${escapePdf(entry.id)}  |  Calon Penghuni: ${escapePdf(entry.fullName)}  |  Pilihan: ${escapePdf(entry.kost)}) Tj ET`);

  let y2 = 764;
  const p2Sections = [
    {
      title: "4. Tamu & Kunjungan",
      items: [
        "Tamu hanya diperbolehkan berkunjung maksimal sampai pukul 23.00 WIB.",
        "Tamu lawan jenis dilarang keras masuk ke dalam kamar kost kecuali ada izin khusus tertulis dari pemilik/pengelola.",
        "Tamu yang menginap dikenakan biaya tambahan sebesar Rp 20.000,- per malam dan wajib seizin pemilik.",
        "Tanggung jawab atas segala perilaku dan ketertiban tamu sepenuhnya berada pada penghuni yang dikunjungi.",
      ]
    },
    {
      title: "5. Kendaraan",
      items: [
        "Penghuni yang membawa kendaraan wajib memarkir di area parkir yang telah disediakan secara tertib dan rapi.",
        "Parkir dilakukan dengan rapi agar tidak menghalangi keluar-masuk kendaraan penghuni lain.",
        "Penghuni wajib mematikan mesin, lampu, dan memasang kunci ganda pengaman saat memarkir kendaraan.",
        "Apabila ada ketentuan iuran parkir atau retribusi lingkungan, akan diberitahukan resmi oleh pihak pengelola kost.",
        "Pemilik/pengelola kost tidak bertanggung jawab atas kehilangan atau kerusakan kendaraan dan helm. Segala risiko menjadi tanggung jawab penghuni.",
      ]
    },
    {
      title: "6. Keamanan Lingkungan",
      items: [
        "Setiap penghuni wajib mengunci pintu kamar masing-masing, pintu utama, dan pintu gerbang kost saat keluar/masuk.",
        "Pemilik/pengelola kost tidak bertanggung jawab atas kehilangan barang berharga pribadi akibat kelalaian penghuni.",
        "Penghuni dilarang keras membawa atau memelihara hewan peliharaan apa pun di lingkungan kost tanpa izin.",
      ]
    },
    {
      title: "7. Ketentuan Sanksi & Denda Kehilangan Kunci",
      items: [
        "Pelanggaran ringan terhadap tata tertib akan diberikan surat peringatan (lisan/tertulis).",
        "KHUSUS KEHILANGAN KUNCI: Penghuni dikenakan biaya duplikasi/penggantian kunci sebesar Rp 100.000,- per kejadian.",
        "Pelanggaran berat (narkoba, tindak asusila/kriminal, merusak fasilitas kost, dll) dikenakan sanksi PENGUSIRAN SEKETIKA tanpa pengembalian uang sewa maupun uang deposit.",
      ]
    },
    {
      title: "8. Pelaporan Mandiri Lingkungan RT (Khusus Kost Putri: Alya)",
      items: [
        "Khusus penghuni Kost Putri: Alya, wajib melapor secara mandiri kepada Pengurus RT 008/09 via WA: 081296191356 setelah resmi menyewa.",
        "Pelaporan dilakukan sekali saat awal masa sewa dan setiap ada perubahan data demi mendukung keamanan dan keteraturan lingkungan.",
      ]
    }
  ];

  for (const sec of p2Sections) {
    add2("0.141 0.176 0.161 rg");
    add2(`BT /F2 8.5 Tf 36 ${y2} Td (${escapePdf(sec.title)}) Tj ET`);
    y2 -= 11;

    for (let i = 0; i < sec.items.length; i++) {
      const itemText = sec.items[i];
      const numPrefix = `${sec.title.split('.')[0]}.${i + 1}. `;
      const fullText = numPrefix + itemText;
      const wrapped = wrapText(fullText, 98);

      add2("0.25 0.25 0.25 rg");
      add2(`BT /F1 7.5 Tf 44 ${y2} Td (${escapePdf(wrapped[0])}) Tj ET`);
      y2 -= 9.5;
      for (let w = 1; w < wrapped.length; w++) {
        add2(`BT /F1 7.5 Tf 60 ${y2} Td (${escapePdf(wrapped[w])}) Tj ET`);
        y2 -= 9.5;
      }
      y2 -= 0.5;
    }
    y2 -= 3;
  }

  // Catatan Penutup Tata Tertib
  y2 -= 2;
  add2("0.4 0.4 0.4 rg");
  add2(`BT /F2 7.5 Tf 36 ${y2} Td (Catatan:) Tj ET`);
  add2(`BT /F1 7.5 Tf 74 ${y2} Td (Tata tertib ini dapat diperbarui sewaktu-waktu sesuai kebijakan pemilik kost demi ketertiban bersama.) Tj ET`);
  y2 -= 10;
  add2(`BT /F1 7.5 Tf 36 ${y2} Td (Dengan menempati kamar, penghuni dinyatakan telah membaca, memahami, dan tunduk pada seluruh aturan yang berlaku.) Tj ET`);

  // Persetujuan Digital Box (Tinggi 64 pt)
  y2 -= 18;
  const boxTop = y2;
  add2("0.93 0.97 0.94 rg");
  add2(`36 ${boxTop - 56} 523.28 62 re f`);
  add2("0.208 0.298 0.247 RG 1 w");
  add2(`36 ${boxTop - 56} 523.28 62 re s`);

  add2("0.133 0.298 0.207 rg");
  add2(`BT /F2 8.5 Tf 46 ${boxTop - 13} Td (LEMBAR PERNYATAAN PERSETUJUAN SEWA KOST (DISAHKAN SECARA DIGITAL):) Tj ET`);
  add2("0.141 0.176 0.161 rg");
  add2(`BT /F1 8 Tf 46 ${boxTop - 27} Td ("Saya menyatakan setuju untuk mematuhi seluruh tata tertib yang berlaku di kost ini, serta bersedia) Tj ET`);
  add2(`BT /F1 8 Tf 46 ${boxTop - 39} Td (menerima seluruh sanksi yang ditetapkan apabila melakukan pelanggaran.") Tj ET`);
  add2("0.4 0.4 0.4 rg");
  add2(`BT /F1 7 Tf 46 ${boxTop - 51} Td (Disetujui secara digital pada: ${escapePdf(entry.timestampWib)} melalui Formulir Online https://kost-tiga-a.web.id/daftar) Tj ET`);

  // Tanda Tangan & Pengesahan
  y2 = boxTop - 76;
  add2("0.427 0.443 0.416 rg");
  add2(`BT /F1 8 Tf 46 ${y2} Td (Calon Penghuni / Penyewa:) Tj ET`);
  add2(`BT /F1 8 Tf 360 ${y2} Td (Manajemen Pengelola Kost:) Tj ET`);

  add2("0.141 0.176 0.161 rg");
  add2(`BT /F2 8 Tf 46 ${y2 - 20} Td ([ TERVERIFIKASI SECARA ELEKTRONIK ]) Tj ET`);
  add2(`BT /F2 8 Tf 360 ${y2 - 20} Td ([ TERTANDA RESMI SISTEM KOST 3A ]) Tj ET`);

  add2(`BT /F2 9.5 Tf 46 ${y2 - 42} Td (${escapePdf(entry.fullName)}) Tj ET`);
  add2(`BT /F1 7.5 Tf 46 ${y2 - 54} Td (NIK KTP: ${escapePdf(entry.nik)}) Tj ET`);

  add2(`BT /F2 9.5 Tf 360 ${y2 - 42} Td (${escapePdf(entry.kost)}) Tj ET`);
  add2(`BT /F1 7.5 Tf 360 ${y2 - 54} Td (https://kost-tiga-a.web.id) Tj ET`);

  // Running Footer Page 2
  add2("0.5 0.5 0.5 rg");
  add2("BT /F1 7 Tf 36 26 Td (Halaman 2 dari 2  |  Dokumen Resmi Persetujuan Sewa Kost Tiga A  |  Sistem Informasi Pendaftaran Online) Tj ET");

  add2("Q");

  // Stream calculation
  const s1 = p1Lines.join("\n");
  const s2 = p2Lines.join("\n");
  const l1 = Buffer.byteLength(s1, "latin1");
  const l2 = Buffer.byteLength(s2, "latin1");

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
  objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 5 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>";
  objects[4] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 6 0 R /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> >>";
  objects[5] = `<< /Length ${l1} >>\nstream\n${s1}\nendstream`;
  objects[6] = `<< /Length ${l2} >>\nstream\n${s2}\nendstream`;
  objects[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[8] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= 8; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += "xref\n";
  out += "0 9\n";
  out += "0000000000 65535 f \n";
  for (let i = 1; i <= 8; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out += "trailer\n";
  out += "<< /Size 9 /Root 1 0 R >>\n";
  out += "startxref\n";
  out += `${xrefOffset}\n`;
  out += "%%EOF\n";

  return Buffer.from(out, "latin1");
}

async function saveKtpImage(dataDir, id, base64Data) {
  const uploadsDir = path.join(dataDir, "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const cleaned = base64Data.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");
  const buffer = Buffer.from(cleaned, "base64");
  const filename = `${id}-ktp.jpg`;
  const filePath = path.join(uploadsDir, filename);
  await writeFile(filePath, buffer);
  return filename;
}


const adminStyles = `
:root{color-scheme:light;--paper:#f6f3eb;--ink:#242d29;--muted:#6d716a;--line:#e8e1d1;--blue:#526b5b;--blue-dark:#354c3f;--night:#1f3028;--acid:#d7d6a1;--border-acid:#bca878;--cream:#eeeadf;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:var(--ink);background:radial-gradient(ellipse at 14% 8%,rgb(82 107 91 / 7%),transparent 30rem),radial-gradient(ellipse at 88% 42%,rgb(216 195 145 / 10%),transparent 32rem),var(--paper)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;padding:0 max(24px,calc((100% - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,253,248,0.9);backdrop-filter:blur(12px);position:sticky;top:0;z-index:10}
.brand{display:inline-flex;align-items:center;gap:12px;color:var(--ink);text-decoration:none;font-family:Manrope,sans-serif;font-weight:800;font-size:16px;letter-spacing:-.01em}
.mark{display:grid;width:36px;aspect-ratio:1;place-items:center;border:1px solid var(--border-acid);border-radius:10px;background:var(--acid);color:var(--night);font-family:Manrope,sans-serif;font-size:13px;font-weight:800;transform:rotate(-3deg);box-shadow:0 1px 2px rgba(0,0,0,0.05);transition:transform .2s ease}
.mark:hover{transform:rotate(0)}
.private-label{color:#515651;background:var(--cream);padding:4px 10px;border-radius:999px;border:1px solid var(--line);font-size:11px;font-weight:700;letter-spacing:.04em}
main{width:min(1120px,calc(100% - 40px));margin:36px auto 60px}
nav.admin-nav{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 28px}
nav.admin-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 16px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#3c4540;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.03);transition:all .15s ease}
nav.admin-nav a:hover{border-color:#d8cba9;background:var(--cream);color:var(--ink)}
nav.admin-nav a[aria-current=page]{border-color:var(--night);background:var(--night);color:#fffdf8;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
nav.admin-nav form{margin-left:auto}
nav.admin-nav button{width:auto;min-height:38px;padding:0 16px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#3c4540;font-size:13px;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,0.03);cursor:pointer;transition:all .15s ease}
nav.admin-nav button:hover{border-color:#d8cba9;background:var(--cream);color:var(--ink)}
.eyebrow{margin:0 0 6px;color:var(--blue);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{margin:0;font-family:Manrope,sans-serif;font-size:clamp(26px,4vw,34px);font-weight:800;line-height:1.15;letter-spacing:-.025em;color:var(--ink)}
h2{margin:0 0 12px;font-family:Manrope,sans-serif;font-size:16px;font-weight:700;color:var(--ink)}
.intro{margin:8px 0 24px;color:var(--muted);font-size:14px}
.muted{color:var(--muted);font-size:13px}
.panel{padding:20px;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(36,45,41,0.04)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px}
.card strong{display:block;font-family:Manrope,sans-serif;font-size:32px;font-weight:800;line-height:1.2;color:var(--ink)}
.card span{display:block;margin-top:4px;color:var(--muted);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px}
table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
th,td{padding:11px 14px;border-bottom:1px solid var(--paper)}
th{background:var(--cream);color:#3c4540;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid var(--line)}
tr:hover td{background:#faf8f3}
tr:last-child td{border-bottom:0}
th.num,td.num{text-align:right}
.num{font-variant-numeric:tabular-nums}
ul.chart{margin:0;padding:0;list-style:none}
ul.chart li{display:grid;grid-template-columns:3.4rem 1fr 2.5rem;align-items:center;gap:10px;padding:4px 0;font-size:13px}
.day{color:var(--muted);font-size:12px}
.bar{display:block;height:12px;min-width:2px;border-radius:4px;background:var(--blue)}
.ok{margin:0 0 16px;padding:12px 14px;border:1px solid #c2dfcf;border-radius:10px;background:#edf7f1;color:#1b6339;font-size:13px;font-weight:600}
form{margin:0}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(36,45,41,0.04)}
.table-wrap table{min-width:650px}
.toolbar{display:flex;gap:12px;margin-bottom:14px}
.toolbar input{flex:1;min-width:0;min-height:42px;font-size:14px;border-radius:10px;border:1px solid var(--line);padding:0 14px;background:#fff;color:var(--ink);transition:border-color .15s ease}
.toolbar input:focus{outline:none;border-color:var(--blue-dark);box-shadow:0 0 0 3px rgba(53,76,63,0.12)}
.toolbar button{width:auto;flex:none;min-height:42px;padding-inline:20px;border-radius:10px;border:0;background:var(--blue-dark);color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);transition:background .15s ease}
.toolbar button:hover{background:var(--night)}
.pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}
.pagination button{width:auto;min-height:38px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:#fff;color:#3c4540;font-size:13px;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,0.03);cursor:pointer;transition:all .15s ease}
.pagination button:hover:not(:disabled){border-color:#d8cba9;background:var(--cream);color:var(--ink)}
.pagination button:disabled{background:var(--paper);color:#a49f93;border-color:var(--line);cursor:not-allowed;box-shadow:none}
#page-info{min-width:110px;color:var(--muted);font-size:12px;text-align:center}
.dashboard-section{padding:24px 0;scroll-margin-top:24px}
.dashboard-section[hidden]{display:none}
.dashboard-section+.dashboard-section{border-top:1px solid var(--line)}
.dashboard-section h1{margin:0;font-family:Manrope,sans-serif;font-size:clamp(24px,4vw,30px);font-weight:800;letter-spacing:-.02em}
.dashboard-section>.intro{margin-bottom:18px}
.status-code,.ip,.time{white-space:nowrap;font-variant-numeric:tabular-nums}
.path{min-width:180px;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:var(--blue-dark)}
.browser{min-width:140px}
.empty{padding:28px 14px;color:var(--muted);text-align:center}
.box{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-bottom:14px}
.box h2{grid-column:1/-1;margin:0}
label{display:grid;gap:6px;min-width:0;font-size:12px;font-weight:700;color:#515651}
input{width:100%;min-height:42px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-size:16px;transition:border-color .15s ease}
input:focus{outline:none;border-color:var(--blue-dark);box-shadow:0 0 0 3px rgba(53,76,63,0.12)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--blue-dark);outline-offset:2px}
button{width:100%;min-height:42px;padding:0 16px;border:0;border-radius:10px;background:var(--blue-dark);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);transition:background .15s ease}
button:hover{background:var(--night)}
.ktp-btn{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;background:var(--cream);border:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:12px;font-weight:700;transition:all .15s}
.ktp-btn:hover{background:#d8cba9}
.wa-link{color:#15803d;text-decoration:none;font-weight:700}
.wa-link:hover{text-decoration:underline}
@media (max-width:700px){
header{min-height:56px;padding-inline:max(16px,env(safe-area-inset-left))}
main{width:calc(100% - 24px);margin:16px auto;padding-bottom:env(safe-area-inset-bottom)}
.toolbar{flex-direction:column}
.toolbar button{width:100%}
.dashboard-section{padding:18px 0}
.box{grid-template-columns:1fr}
nav.admin-nav{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
nav.admin-nav a,nav.admin-nav button{min-height:42px;padding:0 8px;font-size:12px}
nav.admin-nav form{grid-column:1/-1;margin:0}
nav.admin-nav button{width:100%}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
#logs .table-wrap{overflow:visible;border:0;background:none;box-shadow:none}
#logs .table-wrap table{min-width:0}
#logs thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#logs table,#logs tbody{display:block}
#entries tr{display:block;margin-bottom:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;box-shadow:0 1px 2px rgba(36,45,41,0.04)}
#entries td{display:grid;grid-template-columns:84px minmax(0,1fr);gap:10px;padding:5px 0;border:0;overflow-wrap:anywhere}
#entries td::before{content:attr(data-label);color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
#entries td.empty{display:block;padding:28px 14px;text-align:center}
#entries td.empty::before{content:none}
#entries td.path,#entries td.browser{min-width:0}
.pagination{display:grid;grid-template-columns:1fr 1fr}
.pagination button{width:100%;min-height:42px}
#page-info{grid-column:1/-1;order:-1;min-width:0}
}
`;

const adminLinks = [
  ["/admin#logs", "Log akses"],
  ["/admin#stats", "Statistik"],
  ["/admin#rooms", "Kamar kosong"],
];
const legacyAdminRoutes = new Map([
  ["/admin/logs", "/admin#logs"],
  ["/admin/logs/", "/admin#logs"],
  ["/admin/stats", "/admin#stats"],
  ["/admin/kamar", "/admin#rooms"],
]);

function renderAdminPage({ title, content, showNavigation = true, showLogout = false, basePath = "/admin" }) {
  const links = [
    [basePath + "#logs", "Log akses"],
    [basePath + "#stats", "Statistik"],
    [basePath + "#rooms", "Kamar kosong"],
  ]
    .map(([href, label], index) => `<a href="${href}"${index === 0 ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("") + (showLogout ? `<form method="post" action="${basePath}"><input type="hidden" name="action" value="logout"><button type="submit">Keluar</button></form>` : "");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${title} | Kost Tiga A</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Manrope:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>${adminStyles}</style>
</head>
<body>
<header>
<a class="brand" href="/"><span class="mark">3A</span><span>Kost Tiga A</span></a>
<span class="private-label">PANEL PRIVAT</span>
</header>
<main>
${showNavigation ? `<nav class="admin-nav" aria-label="Menu admin">${links}</nav>` : ""}
${content}
<footer style="margin-top:40px;padding-top:20px;border-top:1px solid var(--line);text-align:center;font-size:12px;color:var(--muted)">
<p style="margin:0">Panel Pengelola Kost Tiga A · Terakhir diperbarui: <time datetime="2026-11-15T12:55:51+07:00">15 November 2026, 12:55:51 WIB</time></p>
</footer>
</main>
</body>
</html>
`;
}

function renderStatsPage({ clicks, visitors, rooms, now }) {
  const ranked = (group) =>
    Object.entries(group).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const table = (title, group, label = (key) => key) => {
    const rows = ranked(group)
      .map(([key, value]) => `<tr><td>${escapeHtml(label(key))}</td><td class="num">${value}</td></tr>`)
      .join("");
    return `<section class="panel"><h2>${title}</h2><table>${rows || '<tr><td colspan="2">Belum ada data</td></tr>'}</table></section>`;
  };

  const days = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    days.push(dayFormat.format(new Date(now.getTime() - offset * 86_400_000)));
  }
  const peak = Math.max(1, ...days.map((day) => clicks.days[day] ?? 0));
  const bars = days
    .map((day) => {
      const value = clicks.days[day] ?? 0;
      return `<li><span class="day">${day.slice(5)}</span><span class="bar" style="width:${Math.round((value / peak) * 100)}%"></span><span class="num">${value}</span></li>`;
    })
    .join("");

  const roomRows = Object.entries(targetNames)
    .map(([key, name]) => {
      const cell = (type) => (Number.isInteger(rooms[key]?.[type]) ? String(rooms[key][type]) : "-");
      return `<tr><td>${name}</td><td class="num">${cell("ac")}</td><td class="num">${cell("nonac")}</td></tr>`;
    })
    .join("");
  const roomsUpdated = rooms.updatedAt ? `Diperbarui ${escapeHtml(rooms.updatedAt)}` : "Belum diatur";

  const content = `<div class="cards">
<div class="panel card"><strong>${visitors}</strong><span>Pengunjung unik</span></div>
<div class="panel card"><strong>${clicks.total}</strong><span>Total klik WhatsApp</span></div>
<div class="panel card"><strong>${clicks.last7}</strong><span>Klik 7 hari terakhir</span></div>
<div class="panel card"><strong>${clicks.today}</strong><span>Klik hari ini</span></div>
</div>
<section class="panel"><h2>Klik 14 hari terakhir</h2><ul class="chart">${bars}</ul></section>
<div class="grid">
${table("Per kost", clicks.target, (key) => targetNames[key] ?? key)}
${table("Per varian halaman", clicks.page)}
${table("Per posisi tombol", clicks.slot)}
<section class="panel"><h2>Ketersediaan kamar</h2><table><tr><th>Kost</th><th class="num">AC</th><th class="num">Non-AC</th></tr>${roomRows}</table><p class="muted">${roomsUpdated}</p></section>
</div>`;

  return `<section id="stats" class="dashboard-section" aria-labelledby="stats-title" hidden>
<p class="eyebrow">Administrasi situs</p><h1 id="stats-title">Statistik situs</h1>
<p class="intro">Dibuat ${escapeHtml(now.toISOString())}. Data klik dihitung per hari WIB.</p>${content}
</section>`;
}

function matchesSecret(suppliedValue, expectedValue) {
  const supplied = Buffer.from(String(suppliedValue ?? ""));
  const expected = Buffer.from(expectedValue ?? "");
  return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const adminSessionCookie = "kost-admin-session";
const adminSessionMaxAge = 8 * 60 * 60;

function getAdminSession(request, sessions) {
  const cookie = new RegExp(`(?:^|;\\s*)${adminSessionCookie}=([a-f0-9]{64})(?:;|$)`).exec(request.headers.cookie ?? "");
  if (!cookie) return null;
  const expiresAt = sessions.get(cookie[1]);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(cookie[1]);
    return null;
  }
  return cookie[1];
}

function hasValidBasicAuth(request, auth) {
  if (!auth.adminUser || !auth.adminPassword) return false;
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon === -1) return false;
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);
    return matchesSecret(user, auth.adminUser) && matchesSecret(pass, auth.adminPassword);
  } catch {
    return false;
  }
}

function isAdmin(request, auth, sessions) {
  return Boolean(getAdminSession(request, sessions)) || hasValidBasicAuth(request, auth) || matchesSecret(request.headers["x-admin-secret"], auth.adminSecret);
}

function isSameOriginRequest(request) {
  let originHost = null;
  try {
    originHost = new URL(request.headers.origin ?? "").host;
  } catch {}
  if (!originHost) {
    try {
      originHost = new URL(request.headers.referer ?? "").host;
    } catch {}
  }
  return originHost === request.headers.host || request.headers["sec-fetch-site"] === "same-origin";
}

function adminPageHeaders(body) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": dashboardCsp(),
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function renderAdminLoginPage(message = "", action = "/admin") {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Kost Tiga A | Panel Pengelola</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Manrope:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--color-paper:#f6f3eb;--color-white:#fffdf8;--color-ink:#242d29;--color-muted:#6d716a;--color-line:#e8e1d1;--color-blue-dark:#354c3f;--color-night:#1f3028;--color-acid:#d7d6a1;--color-border-acid:#bca878}
*{box-sizing:border-box}
html,body{min-height:100vh;margin:0;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--color-ink);background:radial-gradient(ellipse at 14% 8%,rgb(82 107 91 / 7%),transparent 30rem),radial-gradient(ellipse at 88% 42%,rgb(216 195 145 / 10%),transparent 32rem),var(--color-paper);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.login-card{width:100%;max-width:384px;background:#fff;border-radius:24px;box-shadow:0 16px 40px rgba(36,45,41,0.08);border:1px solid var(--color-line);padding:32px}
.login-header{text-align:center;margin-bottom:24px}
.login-badge{display:inline-flex;width:56px;height:56px;align-items:center;justify-content:center;border-radius:16px;border:1px solid var(--color-border-acid);background:var(--color-acid);font-family:Manrope,sans-serif;font-size:20px;font-weight:800;color:var(--color-night);box-shadow:0 1px 2px rgba(0,0,0,0.05);margin-bottom:12px;transform:rotate(-3deg);transition:transform .2s ease}
.login-badge:hover{transform:rotate(0)}
.login-title{margin:0;font-family:Manrope,sans-serif;font-size:24px;font-weight:900;color:var(--color-ink);letter-spacing:-.025em}
.login-subtitle{margin:4px 0 0;font-size:12px;color:var(--color-muted)}
form.login-form{display:flex;flex-direction:column;gap:16px}
.field-group{display:flex;flex-direction:column;gap:4px}
.field-label{font-size:12px;font-weight:600;color:#515651}
.input-wrapper{position:relative;display:flex;align-items:center}
.input-icon{position:absolute;left:12px;width:16px;height:16px;color:#9c978b;pointer-events:none}
.login-input{width:100%;min-height:42px;padding:9px 12px 9px 36px;font-family:inherit;font-size:16px;border:1px solid var(--color-line);border-radius:12px;background:#fff;color:var(--color-ink);transition:border-color .15s ease}
.login-input:focus{outline:none;border-color:var(--color-blue-dark)}
.login-error{margin:0;padding:10px 12px;border-radius:8px;background:#fdf5f2;border:1px solid #f8e5de;color:#b97862;font-size:12px;font-weight:500}
.login-btn{width:100%;min-height:42px;padding:10px;border:0;border-radius:12px;background:var(--color-blue-dark);color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);transition:background .15s ease}
.login-btn:hover{background:var(--color-night)}
.login-footer{margin:24px 0 0;text-align:center;font-size:11px;color:#9c978b;line-height:1.6}
@media (max-width:480px){
  .login-screen{padding:16px 12px}
  .login-card{padding:26px 18px;border-radius:20px}
  .login-title{font-size:22px}
  .login-subtitle{font-size:11px}
}
</style>
</head>
<body>
<div class="login-screen">
  <div class="login-card">
    <div class="login-header">
      <div class="login-badge">3A</div>
      <h1 class="login-title">Kost Tiga A</h1>
      <p class="login-subtitle">Masuk ke Panel Pengelola Kost</p>
    </div>
    <form method="post" action="${action}" class="login-form">
      <div class="field-group">
        <label for="username" class="field-label">Username</label>
        <div class="input-wrapper">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <input id="username" required autofocus name="username" autocomplete="username" placeholder="admin / penjaga" autocapitalize="none" autocorrect="off" class="login-input">
        </div>
      </div>
      <div class="field-group">
        <label for="password" class="field-label">Kata Sandi</label>
        <div class="input-wrapper">
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <input id="password" required type="password" name="password" autocomplete="current-password" placeholder="••••••••" class="login-input">
        </div>
      </div>
      ${message ? `<p class="login-error" role="alert">${message}</p>` : ""}
      <button type="submit" class="login-btn">Masuk Dashboard</button>
    </form>
    <p class="login-footer">Panel Pengelola Kost Tiga A<br>Terakhir diperbarui: <time datetime="2026-11-15T12:55:51+07:00">15 November 2026, 12:55:51 WIB</time></p>
  </div>
</div>
</body>
</html>`;
}

function rejectAdmin(response, auth) {
  if (auth.adminUser && auth.adminPassword) {
    sendError(response, 401, "Authentication Required", {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Kost Tiga A", charset="UTF-8"',
    });
    return;
  }
  if (auth.adminSecret) {
    sendError(response, 404, "Not Found");
    return;
  }
  sendError(response, 503, "Admin authentication is not configured");
}

function renderLogsSection() {
  return `<section id="logs" class="dashboard-section" aria-labelledby="logs-title">
<p class="eyebrow">Administrasi situs</p><h1 id="logs-title">Log akses</h1>
<p class="intro" id="status" aria-live="polite">Memuat log...</p>
<div class="toolbar"><input id="search" type="search" aria-label="Cari log" placeholder="Cari IP, halaman, browser, atau status"><button id="refresh" type="button">Muat ulang</button></div>
<div class="table-wrap"><table>
<thead><tr><th scope="col">IP</th><th scope="col">Waktu WIB</th><th scope="col">Halaman</th><th scope="col">Browser</th><th scope="col">Metode</th><th scope="col">Status</th></tr></thead>
<tbody id="entries"><tr><td class="empty" colspan="6">Memuat log...</td></tr></tbody>
</table></div>
<nav class="pagination" aria-label="Navigasi halaman log"><button id="previous-page" type="button">Sebelumnya</button><span id="page-info" aria-live="polite">Halaman 1 dari 1</span><button id="next-page" type="button">Berikutnya</button></nav>
</section>`;
}

const dashboardScript = `const pageSize=50,statusElement=document.getElementById("status"),entriesElement=document.getElementById("entries"),searchElement=document.getElementById("search"),previousPageButton=document.getElementById("previous-page"),nextPageButton=document.getElementById("next-page"),pageInfoElement=document.getElementById("page-info");let entries=[],currentPage=1;
function getBrowser(userAgent){const browsers=[["Edge",/Edg(?:e|A|iOS)?\\/([\\d.]+)/],["Opera",/(?:OPR|Opera)\\/([\\d.]+)/],["Samsung Internet",/SamsungBrowser\\/([\\d.]+)/],["Firefox",/(?:Firefox|FxiOS)\\/([\\d.]+)/],["Chrome",/(?:Chrome|CriOS)\\/([\\d.]+)/],["Safari",/Version\\/([\\d.]+).*Safari/]];for(const [name,pattern] of browsers){const match=userAgent.match(pattern);if(match)return name+" "+match[1]}return "Tidak diketahui"}
function renderEntries(){const query=searchElement.value.trim().toLowerCase(),visible=entries.filter(entry=>(entry.ip+" "+entry.path+" "+entry.browser+" "+entry.method+" "+entry.status).toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(visible.length/pageSize));currentPage=Math.min(currentPage,pages);const start=(currentPage-1)*pageSize,items=visible.slice(start,start+pageSize);entriesElement.replaceChildren();pageInfoElement.textContent="Halaman "+currentPage+" dari "+pages;previousPageButton.disabled=currentPage===1;nextPageButton.disabled=currentPage===pages;statusElement.textContent=visible.length?"Menampilkan "+(start+1)+"-"+(start+items.length)+" dari "+visible.length+" request.":"Menampilkan 0 dari "+(entries.length?"hasil pencarian":"request");if(!items.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.className="empty";cell.colSpan=6;cell.textContent=entries.length?"Tidak ada hasil yang cocok.":"Belum ada request tercatat.";row.append(cell);entriesElement.append(row);return}for(const entry of items){const row=document.createElement("tr"),time=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"medium"}).format(new Date(entry.time))+" WIB";for(const [value,className,label] of [[entry.ip,"ip","IP"],[time,"time","Waktu WIB"],[entry.path,"path","Halaman"],[getBrowser(entry.userAgent),"browser","Browser"],[entry.method,"","Metode"],[String(entry.status),"status-code","Status"]]){const cell=document.createElement("td");cell.className=className;cell.dataset.label=label;cell.textContent=value;row.append(cell)}entriesElement.append(row)}}
async function loadLog(){statusElement.textContent="Memuat log...";try{const base=location.pathname.startsWith("/dashboard")?"/dashboard":"/admin";const response=await fetch(base+"?data=logs",{cache:"no-store",credentials:"same-origin"});if(!response.ok)throw new Error("HTTP "+response.status);entries=await response.json();currentPage=1;renderEntries()}catch{entries=[];currentPage=1;renderEntries();statusElement.textContent="Log gagal dimuat. Pastikan autentikasi berhasil, lalu muat ulang."}}
const sections=[...document.querySelectorAll(".dashboard-section")],tabs=[...document.querySelectorAll(".admin-nav a")];function activateSection(id){const active=sections.some(section=>section.id===id)?id:"logs";for(const section of sections)section.hidden=section.id!==active;for(const tab of tabs){if(tab.hash==="#"+active)tab.setAttribute("aria-current","page");else tab.removeAttribute("aria-current")}}for(const tab of tabs)tab.addEventListener("click",event=>{event.preventDefault();const id=tab.hash.slice(1);if(location.hash!=="#"+id)history.pushState(null,"","#"+id);activateSection(id)});addEventListener("hashchange",()=>activateSection(location.hash.slice(1)));activateSection(location.hash.slice(1)||"logs");
document.getElementById("refresh").addEventListener("click",loadLog);previousPageButton.addEventListener("click",()=>{currentPage--;renderEntries()});nextPageButton.addEventListener("click",()=>{currentPage++;renderEntries()});searchElement.addEventListener("input",()=>{currentPage=1;renderEntries()});loadLog();`;

function dashboardCsp() {
  const hash = createHash("sha256").update(dashboardScript).digest("base64");
  return [
    "default-src 'none'",
    "script-src 'sha256-" + hash + "'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function handleAdminDashboard(request, response, dataDir, accessLogs, auth, sessions) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";
  const basePath = isDashboard ? "/dashboard" : "/admin";
  const isAdminPath = pathname === "/admin" || pathname === "/admin/" || isDashboard;
  let form;
  if (isAdminPath && request.method === "POST" && auth.adminUser && auth.adminPassword) {
    if (!isSameOriginRequest(request)) {
      sendError(response, 403, "Forbidden");
      return;
    }
    try {
      form = new URLSearchParams(await readSmallBody(request));
    } catch (error) {
      sendError(response, error.statusCode === 413 ? 413 : 400, error.statusCode === 413 ? "Payload Too Large" : "Bad Request");
      return;
    }
    if (form.get("action") === "logout") {
      const token = getAdminSession(request, sessions);
      if (token) sessions.delete(token);
      const secure = request.headers["x-forwarded-proto"]?.split(",")[0].trim() === "https" ? "; Secure" : "";
      response.writeHead(303, {
        Location: basePath,
        "Cache-Control": "no-store",
        "Set-Cookie": `${adminSessionCookie}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`,
      });
      response.end();
      return;
    }
    if (form.has("username") || form.has("password")) {
      if (!matchesSecret(form.get("username"), auth.adminUser) || !matchesSecret(form.get("password"), auth.adminPassword)) {
        const body = renderAdminLoginPage("Username atau password salah.", basePath);
        response.writeHead(401, adminPageHeaders(body));
        response.end(body);
        return;
      }
      const token = randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + adminSessionMaxAge * 1000);
      const secure = request.headers["x-forwarded-proto"]?.split(",")[0].trim() === "https" ? "; Secure" : "";
      response.writeHead(303, {
        Location: basePath,
        "Cache-Control": "no-store",
        "Set-Cookie": `${adminSessionCookie}=${token}; Max-Age=${adminSessionMaxAge}; Path=/; HttpOnly; SameSite=Strict${secure}`,
      });
      response.end();
      return;
    }
  }
  if (!isAdmin(request, auth, sessions)) {
    if ((request.method === "GET" || request.method === "HEAD") && isAdminPath && url.searchParams.get("data") !== "logs" && auth.adminUser && auth.adminPassword) {
      const body = renderAdminLoginPage("", basePath);
      response.writeHead(200, adminPageHeaders(body));
      response.end(request.method === "HEAD" ? undefined : body);
    } else {
      rejectAdmin(response, auth);
    }
    return;
  }

  if (isAdminPath && url.searchParams.get("data") === "registrations_csv") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
      return;
    }
    const registrations = await readRegistrations(dataDir);
    const headers = [
      "Waktu",
      "Pilihan Kost",
      "Nama Lengkap",
      "NIK",
      "Alamat Asal",
      "No WA Penghuni",
      "Nama Orang Tua / Wali",
      "No WA Orang Tua / Wali",
      "Kendaraan",
      "Foto KTP",
      "Arsip PDF",
      "Persetujuan Tata Tertib",
    ];
    const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = registrations.map((r) => [
      new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" }).format(new Date(r.timestamp)) + " WIB",
      r.kost,
      r.fullName,
      `'${r.nik}`,
      r.address,
      `'${r.phone}`,
      r.guardianName,
      `'${r.guardianPhone}`,
      r.vehicle || "-",
      r.ktpImage ? `${basePath}/uploads/${r.ktpImage}` : "-",
      r.pdfFile ? `${basePath}/uploads/${r.pdfFile}` : (r.id ? `${basePath}/uploads/${r.id}-bukti.pdf` : "-"),
      r.agreement,
    ]);
    const csvData = "\uFEFF" + [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const dateStr = new Date().toISOString().slice(0, 10);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pendaftaran-penghuni-${dateStr}.csv"`,
    });
    response.end(request.method === "HEAD" ? undefined : csvData);
    return;
  }

  if (isAdminPath && url.searchParams.get("data") === "logs") {
    if (request.method !== "GET") {
      sendError(response, 405, "Method Not Allowed", { Allow: "GET" });
      return;
    }
    const body = JSON.stringify(await accessLogs.read());
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    });
    response.end(body);
    return;
  }
  if (!isAdminPath) {
    sendError(response, 404, "Not Found");
    return;
  }

  if (request.method === "POST") {
    if (!isSameOriginRequest(request)) {
      sendError(response, 403, "Forbidden");
      return;
    }
    if (!form) {
      try {
        form = new URLSearchParams(await readSmallBody(request));
      } catch (error) {
        sendError(response, error.statusCode === 413 ? 413 : 400, error.statusCode === 413 ? "Payload Too Large" : "Bad Request");
        return;
      }
    }
    const counts = {};
    for (const target of clickTargets) {
      for (const type of roomTypes) {
        const raw = (form.get(`${target}-${type}`) ?? "").trim();
        if (raw === "") continue;
        const count = Number(raw);
        if (!/^\d{1,2}$/.test(raw) || !Number.isInteger(count)) {
          sendError(response, 400, "Bad Request");
          return;
        }
        counts[target] = { ...counts[target], [type]: count };
      }
    }
    await saveRooms(dataDir, counts);
    response.writeHead(303, { Location: `${basePath}?saved=1#rooms`, "Cache-Control": "no-store" });
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD, POST" });
    return;
  }
  const now = new Date();
  const [clickText, visitorText, rooms] = await Promise.all([
    readOptional(path.join(dataDir, "clicks.jsonl")),
    readOptional(path.join(dataDir, "visitors.json")),
    readRooms(dataDir),
  ]);
  let visitors = 0;
  try {
    const saved = JSON.parse(visitorText || "{}");
    visitors = Number.isSafeInteger(saved.count) && saved.count >= 0 ? saved.count : 0;
  } catch {}
  const notice = url.searchParams.get("saved") === "1" ? "Tersimpan. Perubahan sudah tampil di situs." : "";
  const content = `<p class="eyebrow">Administrasi situs</p><h1>Dashboard</h1><p class="intro">Log akses, statistik, dan ketersediaan kamar dalam satu halaman.</p>
${renderLogsSection()}
${renderStatsPage({ clicks: summarizeClicks(clickText, now), visitors, rooms, now })}
<section id="rooms" class="dashboard-section" aria-labelledby="rooms-title" hidden><p class="eyebrow">Administrasi situs</p><h1 id="rooms-title">Kamar kosong</h1><p class="intro">Atur jumlah kamar kosong. Angka 0 tampil "penuh"; kosongkan kolom untuk tidak menampilkan tipe. ${rooms.updatedAt ? `Terakhir diperbarui ${escapeHtml(rooms.updatedAt)}.` : "Belum pernah diatur."}</p>${renderRoomsForm(rooms, notice, basePath)}</section>
<script>${dashboardScript}</script>`;
  const body = renderAdminPage({ title: "Dashboard", content, showLogout: Boolean(getAdminSession(request, sessions)), basePath });
  response.writeHead(200, adminPageHeaders(body));
  response.end(request.method === "HEAD" ? undefined : body);
}

let roomsWriteQueue = Promise.resolve();

async function saveRooms(dataDir, counts) {
  const task = roomsWriteQueue.then(async () => {
    let saved = {};
    try {
      saved = JSON.parse(await readFile(path.join(dataDir, "rooms.json"), "utf8")) ?? {};
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error;
      }
    }
    for (const [target, types] of Object.entries(counts)) {
      saved[target] = { ...saved[target], ...types };
    }
    saved.updatedAt = new Date().toISOString();
    await mkdir(dataDir, { recursive: true });
    const file = path.join(dataDir, "rooms.json");
    await writeFile(`${file}.tmp`, `${JSON.stringify(saved, null, 2)}\n`);
    await rename(`${file}.tmp`, file);
  });
  roomsWriteQueue = task.catch(() => {});
  return task;
}


function renderRoomsForm(rooms, message, basePath = "/admin") {
  const typeLabels = { ac: "AC", nonac: "Non-AC" };
  const fieldsets = Object.entries(targetNames)
    .map(([target, name]) => {
      const inputs = roomTypes
        .map((type) => {
          const value = Number.isInteger(rooms[target]?.[type]) ? rooms[target][type] : "";
          return `<label>${typeLabels[type]}<input type="number" name="${target}-${type}" value="${value}" min="0" max="99" inputmode="numeric" placeholder="-"></label>`;
        })
        .join("");
      return `<div class="panel box" role="group" aria-labelledby="g-${target}"><h2 id="g-${target}">${escapeHtml(name)}</h2>${inputs}</div>`;
    })
    .join("");
  return `${message ? `<p class="ok" role="status">${escapeHtml(message)}</p>` : ""}
<form method="post" action="${basePath}#rooms">
${fieldsets}
<button type="submit">Simpan</button>
</form>`;
}

function renderRoomsSection(rooms, message) {
  const updated = rooms.updatedAt ? `Terakhir diperbarui ${escapeHtml(rooms.updatedAt)}.` : "Belum pernah diatur.";
  return `<section id="rooms" class="dashboard-section" aria-labelledby="rooms-title">
<p class="eyebrow">Administrasi situs</p><h1 id="rooms-title">Kamar kosong</h1>
<p class="intro">Isi jumlah kamar kosong. Angka 0 tampil "penuh"; kosongkan kolom untuk tidak menampilkan tipe itu. ${updated}</p>
${renderRoomsForm(rooms, message)}
</section>`;
}


const daftarScript = `(function(){
let ktpBase64 = "";
const fileInput = document.getElementById("ktp-file");
const uploadZone = document.getElementById("upload-zone");
const uploadPreview = document.getElementById("upload-preview");
const thumbImg = document.getElementById("upload-thumb");
const fileNameEl = document.getElementById("upload-name");
const fileSizeEl = document.getElementById("upload-size");
const changeBtn = document.getElementById("upload-change");
const form = document.getElementById("reg-form");
const errorBanner = document.getElementById("error-banner");
const submitBtn = document.getElementById("submit-btn");
const successScreen = document.getElementById("success-screen");
const formCard = document.getElementById("form-card");
const headSec = document.getElementById("head-sec");

uploadZone.addEventListener("click", () => fileInput.click());
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.style.borderColor = "var(--blue-dark)"; });
uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = "";
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});

changeBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showError("File yang diunggah harus berupa gambar (JPG, PNG, atau WEBP).");
    return;
  }
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 1280;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      ktpBase64 = canvas.toDataURL("image/jpeg", 0.82);
      thumbImg.src = ktpBase64;
      fileNameEl.textContent = file.name;
      const kb = Math.round((ktpBase64.length * 3 / 4) / 1024);
      fileSizeEl.textContent = kb + " KB (teroptimasi siap unggah)";
      uploadZone.style.display = "none";
      uploadPreview.style.display = "flex";
      hideError();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

const nikInput = document.getElementById("nik");
const nikCount = document.getElementById("nik-count");
nikInput.addEventListener("input", function() {
  this.value = this.value.replace(/\\D/g, "").slice(0, 16);
  nikCount.textContent = this.value.length + " / 16 digit";
});

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.style.display = "block";
  errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
}
function hideError() {
  errorBanner.style.display = "none";
}

form.addEventListener("submit", async function(e) {
  e.preventDefault();
  hideError();
  const kostEl = form.querySelector('input[name="kost"]:checked');
  if (!kostEl) return showError("Silakan pilih unit kost yang diinginkan.");
  const kost = kostEl.value;
  const fullName = form.fullName.value.trim();
  const nik = form.nik.value.trim();
  const address = form.address.value.trim();
  const phone = form.phone.value.trim();
  const guardianName = form.guardianName.value.trim();
  const guardianPhone = form.guardianPhone.value.trim();
  const vehicleEl = form.querySelector('input[name="vehicle"]:checked');
  const vehicle = vehicleEl ? vehicleEl.value : "Tidak Membawa Kendaraan";
  const agreement = form.agreement.checked;

  if (!fullName) return showError("Nama lengkap calon penghuni wajib diisi.");
  if (nik.length !== 16) return showError("NIK harus berjumlah tepat 16 digit angka sesuai KTP.");
  if (!address) return showError("Alamat asal sesuai KTP wajib diisi.");
  if (phone.length < 9) return showError("Nomor WhatsApp calon penghuni tidak valid.");
  if (!guardianName) return showError("Nama orang tua / wali wajib diisi.");
  if (guardianPhone.length < 9) return showError("Nomor WhatsApp orang tua / wali tidak valid.");
  if (!ktpBase64) return showError("Silakan unggah foto KTP asli calon penghuni.");
  if (!agreement) return showError("Anda harus mencentang persetujuan tata tertib kost untuk mendaftar.");

  submitBtn.disabled = true;
  submitBtn.textContent = "Mengirim...";

  try {
    const res = await fetch("/daftar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kost, fullName, nik, address, phone, guardianName, guardianPhone, vehicle, agreement, ktpImage: ktpBase64
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showError(data.error || "Terjadi kesalahan saat menyimpan pendaftaran.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
      return;
    }

    formCard.style.display = "none";
    headSec.style.display = "none";
    document.getElementById("sum-name").textContent = fullName;
    document.getElementById("sum-kost").textContent = data.kost || kost;
    document.getElementById("sum-nik").textContent = nik;
    document.getElementById("sum-phone").textContent = phone;
    document.getElementById("sum-vehicle").textContent = vehicle;
    document.getElementById("wa-link-btn").href = data.whatsappUrl;

    if (data.pdfUrl) {
      const pdfBtn = document.getElementById("pdf-download-btn");
      if (pdfBtn) {
        pdfBtn.href = data.pdfUrl;
        pdfBtn.setAttribute("download", "Bukti-Pendaftaran-" + fullName.replace(/[^\\w\\s-]/g, "").trim().replace(/\\s+/g, "-") + ".pdf");
      }
      // Auto-trigger download
      try {
        const dlLink = document.createElement("a");
        dlLink.href = data.pdfUrl;
        dlLink.download = "Bukti-Pendaftaran-" + fullName.replace(/[^\\w\\s-]/g, "").trim().replace(/\\s+/g, "-") + ".pdf";
        document.body.appendChild(dlLink);
        dlLink.click();
        dlLink.remove();
      } catch (dlErr) {}
    }

    successScreen.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    showError("Gagal terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});
})();`;

function renderDaftarPage() {
  const hash = createHash("sha256").update(daftarScript).digest("base64");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Registrasi | Kost Tiga A</title>
<meta name="description" content="Formulir resmi registrasi calon penghuni Kost Putri: Athaya dan Kost Putri: Alya di Jatimakmur, Pondok Gede, Bekasi.">
<link rel="canonical" href="https://kost-tiga-a.web.id/daftar">
<meta property="og:type" content="website">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="Kost Tiga A">
<meta property="og:title" content="Registrasi | Kost Tiga A">
<meta property="og:description" content="Formulir resmi registrasi calon penghuni Kost Putri: Athaya dan Kost Putri: Alya di Jatimakmur, Pondok Gede, Bekasi.">
<meta property="og:url" content="https://kost-tiga-a.web.id/daftar">
<meta property="og:image" content="https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&amp;fit=crop&amp;w=1200&amp;q=85">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Registrasi | Kost Tiga A">
<meta name="twitter:description" content="Formulir resmi registrasi calon penghuni Kost Putri: Athaya dan Kost Putri: Alya di Jatimakmur, Pondok Gede, Bekasi.">
<meta name="twitter:image" content="https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&amp;fit=crop&amp;w=1200&amp;q=85">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Manrope:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--paper:#f6f3eb;--white:#fffdf8;--ink:#242d29;--muted:#6d716a;--line:#e8e1d1;--blue:#526b5b;--blue-dark:#354c3f;--night:#1f3028;--acid:#d7d6a1;--border-acid:#bca878;--cream:#eeeadf;--green:#15803d;--green-dark:#166534}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:radial-gradient(ellipse at 14% 8%,rgb(82 107 91 / 7%),transparent 30rem),radial-gradient(ellipse at 88% 42%,rgb(216 195 145 / 10%),transparent 32rem),var(--paper);-webkit-font-smoothing:antialiased}
header{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;padding:0 max(20px,calc((100% - 900px)/2));background:rgba(255,253,248,0.92);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-family:Manrope,sans-serif;font-weight:800;font-size:16px}
.mark{display:grid;width:36px;aspect-ratio:1;place-items:center;border:1px solid var(--border-acid);border-radius:10px;background:var(--acid);color:var(--night);font-family:Manrope,sans-serif;font-size:13px;font-weight:800;transform:rotate(-3deg)}
.nav-back{font-size:13px;font-weight:700;color:var(--blue-dark);text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:#fff;transition:all .15s ease}
.nav-back:hover{background:var(--cream);border-color:#d8cba9}
main{width:min(680px,calc(100% - 32px));margin:32px auto 80px}
.hero-head{text-align:center;margin-bottom:28px}
.eyebrow{display:inline-block;margin:0 0 8px;padding:4px 12px;border-radius:999px;background:var(--cream);border:1px solid var(--line);color:var(--blue-dark);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
h1{margin:0 0 10px;font-family:Manrope,sans-serif;font-size:clamp(26px,5vw,34px);font-weight:900;line-height:1.2;letter-spacing:-.025em;color:var(--ink)}
.subtitle{margin:0;color:var(--muted);font-size:14px;line-height:1.6}
.form-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:32px;box-shadow:0 12px 36px rgba(36,45,41,0.05)}
.form-section{padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid var(--paper)}
.form-section:last-of-type{border-bottom:0;padding-bottom:0;margin-bottom:0}
.sec-title{margin:0 0 14px;font-family:Manrope,sans-serif;font-size:15px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px}
.sec-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--cream);color:var(--blue-dark);font-size:11px;font-weight:800}
.choice-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.choice-label{display:block;position:relative;cursor:pointer}
.choice-label input{position:absolute;opacity:0;pointer-events:none}
.choice-box{padding:16px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper);transition:all .15s ease}
.choice-label input:checked + .choice-box{border-color:var(--blue-dark);background:#f0f5f2;box-shadow:0 0 0 2px var(--blue-dark)}
.choice-title{display:block;font-family:Manrope,sans-serif;font-size:14px;font-weight:800;color:var(--ink);margin-bottom:4px}
.choice-desc{display:block;font-size:12px;color:var(--muted);line-height:1.4}
.field-grid{display:grid;grid-template-columns:1fr;gap:16px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-label{font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;justify-content:space-between}
.req{color:#dc2626;margin-left:2px}
.form-input,.form-textarea{width:100%;padding:11px 14px;font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:10px;transition:border-color .15s ease,box-shadow .15s ease}
.form-input:focus,.form-textarea:focus{outline:none;border-color:var(--blue-dark);box-shadow:0 0 0 3px rgba(53,76,63,0.12)}
.form-hint{font-size:11px;color:var(--muted);margin-top:2px}
.upload-zone{border:2px dashed #cfc5b0;border-radius:12px;padding:24px;text-align:center;background:#fbf9f4;cursor:pointer;transition:all .15s ease}
.upload-zone:hover{border-color:var(--blue-dark);background:#f4f8f5}
.upload-icon{width:40px;height:40px;margin:0 auto 10px;color:var(--blue)}
.upload-preview{display:none;margin-top:12px;padding:12px;border-radius:10px;background:#fff;border:1px solid var(--line);align-items:center;gap:14px}
.upload-thumb{width:80px;height:52px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
.upload-info{flex:1;text-align:left}
.upload-info-name{font-size:12px;font-weight:700;color:var(--ink)}
.upload-info-size{font-size:11px;color:var(--muted)}
.radio-list{display:flex;flex-direction:column;gap:10px}
.radio-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600}
.radio-item:hover{background:#f0ece3}
.rules-card{border:1px solid var(--line);border-radius:14px;background:var(--paper);padding:18px 20px;margin-bottom:14px}
.rules-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.rules-header strong{font-family:Manrope,sans-serif;font-size:15px;color:var(--ink)}
.rules-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:var(--cream);color:var(--blue-dark);padding:3px 8px;border-radius:999px;border:1px solid var(--line)}
.rules-intro{margin:0 0 12px;font-size:12px;color:var(--muted)}
.rules-content{max-height:280px;overflow-y:auto;padding-right:8px;display:flex;flex-direction:column;gap:14px}
.rules-content::-webkit-scrollbar{width:6px}
.rules-content::-webkit-scrollbar-thumb{background:#cfc5b0;border-radius:999px}
.rule-group h4{margin:0 0 6px;font-family:Manrope,sans-serif;font-size:13px;font-weight:800;color:var(--blue-dark)}
.rule-group ul{margin:0;padding-left:18px;font-size:12px;line-height:1.6;color:#374151}
.rule-group li{margin-bottom:4px}
.rule-special{background:#fdf8eb;border:1px solid #ebd9b2;border-radius:10px;padding:12px 14px}
.rule-special h4{color:#854d0e}
.rule-special p{margin:0 0 6px;font-size:12px;line-height:1.55;color:#713f12}
.rule-special p:last-child{margin-bottom:0}
.rule-note{font-size:11px;color:var(--muted);line-height:1.5;border-top:1px dashed var(--line);padding-top:10px}
.agreement-card{padding:14px 16px;border-radius:12px;background:#fdfbf7;border:1px solid #e5dcce;display:flex;align-items:flex-start;gap:12px}
.agreement-card input{margin-top:3px;width:18px;height:18px;accent-color:var(--blue-dark);cursor:pointer}
.agreement-text{font-size:12px;line-height:1.6;color:#4b5563;margin:0;cursor:pointer}
.submit-btn{width:100%;min-height:48px;padding:12px 24px;border:0;border-radius:12px;background:var(--blue-dark);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(53,76,63,0.25);transition:all .15s ease;margin-top:24px}
.submit-btn:hover{background:var(--night);transform:translateY(-1px)}
.submit-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.error-banner{display:none;padding:12px 16px;border-radius:10px;background:#fdf2f2;border:1px solid #f8d7da;color:#b91c1c;font-size:13px;font-weight:600;margin-bottom:20px}
.success-screen{display:none;background:#fff;border:1px solid var(--line);border-radius:20px;padding:40px 32px;text-align:center;box-shadow:0 12px 36px rgba(36,45,41,0.05)}
.success-icon{width:64px;height:64px;border-radius:50%;background:#dcfce7;color:#16a34a;display:grid;place-items:center;margin:0 auto 20px}
.success-icon svg{width:36px;height:36px}
.success-title{margin:0 0 10px;font-family:Manrope,sans-serif;font-size:24px;font-weight:900;color:var(--ink)}
.success-desc{margin:0 0 24px;color:var(--muted);font-size:14px;line-height:1.6}
.summary-box{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:16px 20px;text-align:left;margin-bottom:28px}
.summary-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px;padding:6px 0;font-size:13px;border-bottom:1px dashed var(--line)}
.summary-row:last-child{border-bottom:0}
.summary-label{color:var(--muted)}
.summary-val{font-weight:700;color:var(--ink);text-align:right}
.pdf-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:46px;padding:12px 20px;border-radius:12px;background:#fff;border:1.5px solid var(--blue-dark);color:var(--blue-dark);font-family:inherit;font-size:14px;font-weight:800;text-decoration:none;transition:all .15s ease}
.pdf-btn:hover{background:var(--cream);border-color:#d8cba9}
.pdf-btn svg{width:20px;height:20px}
.wa-confirm-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;padding:12px 24px;border-radius:12px;background:#25d366;color:#fff;font-family:inherit;font-size:15px;font-weight:800;text-decoration:none;box-shadow:0 4px 12px rgba(37,211,102,0.3);transition:all .15s ease}
.wa-confirm-btn:hover{background:#1ebc59;transform:translateY(-1px)}
.wa-confirm-btn svg{width:22px;height:22px;fill:currentColor}
.back-link{display:inline-block;margin-top:16px;color:var(--muted);font-size:13px;font-weight:600;text-decoration:none}
.back-link:hover{color:var(--ink);text-decoration:underline}
@media (max-width:600px){
  header{padding:0 max(16px,env(safe-area-inset-left))}
  main{width:min(680px,calc(100% - 24px));margin:20px auto 60px}
  .choice-grid{grid-template-columns:1fr}
  .choice-box{padding:14px 12px}
  .form-card{padding:20px 14px;border-radius:16px}
  .form-input,.form-textarea{font-size:16px}
  .rules-card{padding:14px 12px}
  .rules-content{max-height:240px;-webkit-overflow-scrolling:touch}
  .success-screen{padding:28px 16px;border-radius:16px}
  .summary-box{padding:14px 12px}
}
</style>
</head>
<body>
<header>
<a class="brand" href="/"><span class="mark">3A</span><span>Kost Tiga A</span></a>
<a class="nav-back" href="/">← Beranda</a>
</header>
<main>
<div class="hero-head" id="head-sec">
  <span class="eyebrow">Formulir Resmi</span>
  <h1>Registrasi</h1>
  <p class="subtitle">Lengkapi formulir di bawah ini dengan data asli dan valid untuk keperluan administrasi sewa kamar di Kost Putri: Athaya atau Kost Putri: Alya.</p>
</div>

<div class="form-card" id="form-card">
  <div id="error-banner" class="error-banner" role="alert"></div>
  <form id="reg-form" novalidate>
    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">1</span> Pilihan Unit Kost</h2>
      <div class="choice-grid">
        <label class="choice-label">
          <input type="radio" name="kost" value="Kost Putri: Athaya" required checked>
          <div class="choice-box">
            <span class="choice-title">Kost Putri: Athaya</span>
            <span class="choice-desc">Putri • Kamar AC & Non-AC</span>
          </div>
        </label>
        <label class="choice-label">
          <input type="radio" name="kost" value="Kost Putri: Alya" required>
          <div class="choice-box">
            <span class="choice-title">Kost Putri: Alya</span>
            <span class="choice-desc">Putri • Kamar AC & Non-AC</span>
          </div>
        </label>
      </div>
    </div>

    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">2</span> Identitas Calon Penghuni</h2>
      <div class="field-grid">
        <div class="form-group">
          <label class="form-label" for="full-name">Nama Lengkap <span class="req">*</span></label>
          <input class="form-input" id="full-name" name="fullName" required placeholder="Sesuai nama di KTP" autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="nik">
            <span>Nomor Induk Kependudukan (NIK) <span class="req">*</span></span>
            <span class="form-hint" id="nik-count">0 / 16 digit</span>
          </label>
          <input class="form-input" id="nik" name="nik" required maxlength="16" inputmode="numeric" placeholder="16 digit angka KTP">
          <span class="form-hint">Wajib tepat 16 digit angka sesuai KTP asli.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="address">Alamat Asal Sesuai KTP <span class="req">*</span></label>
          <textarea class="form-textarea" id="address" name="address" rows="3" required placeholder="Contoh: Jl. Mawar No. 12, RT 01/RW 02, Desa Kauman, Ponorogo, Jawa Timur"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="phone">Nomor WhatsApp / HP Penghuni <span class="req">*</span></label>
          <input class="form-input" id="phone" name="phone" type="tel" required placeholder="08xxxxxxxxxx" inputmode="tel" autocomplete="tel">
          <span class="form-hint">Nomor aktif WhatsApp untuk komunikasi harian & konfirmasi kamar.</span>
        </div>
      </div>
    </div>

    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">3</span> Kontak Orang Tua / Wali</h2>
      <div class="field-grid">
        <div class="form-group">
          <label class="form-label" for="guardian-name">Nama Orang Tua / Wali <span class="req">*</span></label>
          <input class="form-input" id="guardian-name" name="guardianName" required placeholder="Nama ayah, ibu, atau wali keluarga">
        </div>
        <div class="form-group">
          <label class="form-label" for="guardian-phone">Nomor WhatsApp Orang Tua / Wali <span class="req">*</span></label>
          <input class="form-input" id="guardian-phone" name="guardianPhone" type="tel" required placeholder="08xxxxxxxxxx" inputmode="tel">
          <span class="form-hint">Nomor darurat keluarga yang dapat dihubungi pengelola sewaktu-waktu.</span>
        </div>
      </div>
    </div>

    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">4</span> Unggah Foto KTP Asli</h2>
      <input type="file" id="ktp-file" accept="image/*" capture="environment" style="display:none">
      <div class="upload-zone" id="upload-zone">
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        <div style="font-weight:700;font-size:14px;color:var(--ink);margin-bottom:4px">Klik atau Seret Foto KTP ke Sini</div>
        <div class="form-hint">Format JPG, PNG, atau WEBP. Foto otomatis dioptimalkan agar cepat terkirim.</div>
      </div>
      <div class="upload-preview" id="upload-preview">
        <img id="upload-thumb" class="upload-thumb" alt="Pratinjau KTP">
        <div class="upload-info">
          <div class="upload-info-name" id="upload-name">ktp.jpg</div>
          <div class="upload-info-size" id="upload-size">Teroptimasi</div>
        </div>
        <button type="button" class="nav-back" id="upload-change" style="cursor:pointer">Ganti</button>
      </div>
    </div>

    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">5</span> Kendaraan yang Dibawa</h2>
      <div class="radio-list">
        <label class="radio-item">
          <input type="radio" name="vehicle" value="Kendaraan Roda Dua / Motor" checked>
          <span>Kendaraan Roda Dua / Motor</span>
        </label>
        <label class="radio-item">
          <input type="radio" name="vehicle" value="Tidak Membawa Kendaraan">
          <span>Tidak Membawa Kendaraan</span>
        </label>
      </div>
    </div>

    <div class="form-section">
      <h2 class="sec-title"><span class="sec-num">6</span> Tata Tertib &amp; Persetujuan Sewa</h2>
      
      <div class="rules-card">
        <div class="rules-header">
          <strong>Tata Tertib Sewa Kost</strong>
          <span class="rules-badge">Wajib Dibaca</span>
        </div>
        <p class="rules-intro">Untuk kenyamanan bersama antara penghuni dan pemilik, berikut adalah tata tertib yang berlaku di kost ini:</p>
        <div class="rules-content">
          <div class="rule-group">
            <h4>1. Umum</h4>
            <ul>
              <li>Penghuni wajib menjaga ketertiban, kebersihan, dan keamanan lingkungan kost.</li>
              <li>Penghuni dilarang membawa, menyimpan, atau menggunakan barang terlarang (narkoba, senjata tajam, minuman keras, dll).</li>
              <li>Penghuni wajib menjaga sopan santun dan tidak mengganggu penghuni lain.</li>
              <li>Dilarang merokok di dalam kamar dan selasar kost. Merokok hanya diperbolehkan di area yang telah ditentukan (jika ada).</li>
              <li>Tamu dilarang menginap tanpa seizin pemilik kost.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>2. Pembayaran</h4>
            <ul>
              <li>Uang sewa dibayarkan maksimal tanggal due date setiap bulan.</li>
              <li>Uang sewa yang sudah dibayarkan tidak dapat dikembalikan.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>3. Fasilitas &amp; Listrik</h4>
            <ul>
              <li>Fasilitas kost hanya untuk digunakan penghuni dan tidak boleh dipinjamkan ke pihak luar tanpa izin.</li>
              <li>Penghuni wajib merawat fasilitas yang disediakan. Kerusakan akibat kelalaian akan menjadi tanggung jawab penghuni.</li>
              <li>Setiap kamar dilengkapi meteran listrik prabayar (token). Penghuni bertanggung jawab mengisi token listrik sendiri.</li>
              <li>Penggunaan listrik sepenuhnya menjadi tanggung jawab masing-masing penghuni.</li>
              <li>Penggunaan peralatan listrik berdaya tinggi (misalnya: kompor listrik, setrika uap, pemanas air besar, AC portable, dll) wajib seizin pemilik untuk menghindari risiko korsleting atau kebakaran.</li>
              <li>Penghuni dilarang memaku, mengebor, atau menempelkan benda apa pun di tembok kamar (misalnya paku, double tape, stiker, wallpaper, dll) tanpa izin pemilik.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>4. Tamu &amp; Kunjungan</h4>
            <ul>
              <li>Tamu hanya diperbolehkan berkunjung sampai pukul 23.00 WIB.</li>
              <li>Tamu lawan jenis dilarang masuk ke dalam kamar kost kecuali ada izin khusus dari pemilik.</li>
              <li>Tamu yang menginap dikenakan biaya tambahan sebesar Rp 20.000 per malam dan wajib seizin pemilik.</li>
              <li>Tanggung jawab atas perilaku tamu berada pada penghuni yang dikunjungi.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>5. Kendaraan</h4>
            <ul>
              <li>Penghuni yang membawa kendaraan wajib memarkir di area parkir yang telah disediakan.</li>
              <li>Parkir dilakukan dengan rapi dan tertib agar tidak mengganggu kendaraan lain.</li>
              <li>Penghuni wajib mematikan mesin, lampu, dan mengunci kendaraannya.</li>
              <li>Apabila ada iuran parkir atau biaya tambahan, akan diberitahukan oleh pemilik kost.</li>
              <li>Pemilik kost tidak bertanggung jawab atas kehilangan atau kerusakan kendaraan, segala risiko menjadi tanggung jawab penghuni.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>6. Keamanan</h4>
            <ul>
              <li>Setiap penghuni wajib mengunci pintu kamar masing-masing, pintu utama, dan pintu gerbang saat keluar.</li>
              <li>Pemilik kost tidak bertanggung jawab atas kehilangan barang pribadi akibat kelalaian penghuni.</li>
              <li>Tidak diperbolehkan membawa hewan peliharaan tanpa izin.</li>
            </ul>
          </div>

          <div class="rule-group">
            <h4>7. Sanksi</h4>
            <ul>
              <li>Pelanggaran ringan akan diberikan peringatan lisan/tertulis.</li>
              <li>Kehilangan kunci kost dikenakan biaya duplikasi/penggantian kunci sebesar Rp 100.000,-.</li>
              <li>Pelanggaran berat (misalnya: membawa narkoba, tindak kriminal, merusak fasilitas, dll) akan dikenakan sanksi pengusiran tanpa pengembalian uang sewa maupun deposit.</li>
            </ul>
          </div>

          <div class="rule-group rule-special">
            <h4>8. Pelaporan Mandiri</h4>
            <p><strong>Khusus penghuni Kost Putri: Alya</strong> wajib melapor secara mandiri kepada RT. 008/09 melalui WA: <strong>081296191356</strong> setelah resmi menjadi penyewa.</p>
            <p>Pelaporan dilakukan sekali saat awal masa sewa dan setiap ada perubahan data atau keadaan yang perlu diketahui oleh pihak RT.</p>
            <p>Kepatuhan terhadap klausul ini penting untuk mendukung keamanan dan keteraturan lingkungan.</p>
          </div>

          <div class="rule-note">
            <em><strong>Catatan:</strong> Tata tertib ini dapat diperbarui sewaktu-waktu sesuai kebijakan pemilik kost. Dengan menempati kamar, penghuni dianggap setuju dan bersedia mematuhi aturan yang berlaku.</em>
          </div>
        </div>
      </div>

      <label class="agreement-card" style="margin-top:14px">
        <input type="checkbox" name="agreement" required>
        <p class="agreement-text">Saya menyatakan setuju untuk mematuhi seluruh tata tertib yang berlaku di kost ini serta bersedia menerima sanksi apabila melakukan pelanggaran.</p>
      </label>
    </div>

    <button type="submit" class="submit-btn" id="submit-btn">Submit</button>
  </form>
</div>

<div class="success-screen" id="success-screen">
  <div class="success-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  </div>
  <h2 class="success-title">Pendaftaran Berhasil Dikirim!</h2>
  <p class="success-desc">Data pendaftaran calon penghuni telah tersimpan di sistem Kost Tiga A. Silakan lanjutkan konfirmasi langsung ke pengelola kost melalui WhatsApp di bawah ini.</p>
  
  <div class="summary-box">
    <div class="summary-row"><span class="summary-label">Nama Lengkap</span><span class="summary-val" id="sum-name">-</span></div>
    <div class="summary-row"><span class="summary-label">Pilihan Unit</span><span class="summary-val" id="sum-kost">-</span></div>
    <div class="summary-row"><span class="summary-label">NIK</span><span class="summary-val" id="sum-nik">-</span></div>
    <div class="summary-row"><span class="summary-label">No. WhatsApp</span><span class="summary-val" id="sum-phone">-</span></div>
    <div class="summary-row"><span class="summary-label">Kendaraan</span><span class="summary-val" id="sum-vehicle">-</span></div>
  </div>

  <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:8px">
    <a id="pdf-download-btn" href="#" class="pdf-btn" download>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
      <span>Unduh Ulang Bukti Pendaftaran (PDF)</span>
    </a>
    <a id="wa-link-btn" href="#" target="_blank" rel="noopener noreferrer" class="wa-confirm-btn">
      <svg viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.59.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.3"/></svg>
      <span>Konfirmasi ke Pengelola via WhatsApp</span>
    </a>
  </div>
  <div>
    <a href="/" class="back-link">Kembali ke Halaman Utama</a>
  </div>
</div>
<footer style="margin-top:40px;text-align:center;font-size:12px;color:var(--muted)">
<p style="margin:0">Kost Tiga A · Terakhir diperbarui: <time datetime="2026-11-15T12:55:51+07:00">15 November 2026, 12:55:51 WIB</time></p>
</footer>
</main>
<script>${daftarScript}</script>
</body>
</html>`;
}

async function handleDaftar(request, response, dataDir) {
  if (request.method === "GET" || request.method === "HEAD") {
    const body = renderDaftarPage();
    const hash = createHash("sha256").update(daftarScript).digest("base64");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy": [
        "default-src 'none'",
        `script-src 'sha256-${hash}'`,
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  if (request.method !== "POST") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD, POST" });
    return;
  }

  let payload;
  try {
    const raw = await readBody(request, 2 * 1024 * 1024);
    payload = JSON.parse(raw);
  } catch (error) {
    response.writeHead(error.statusCode === 413 ? 413 : 400, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ ok: false, error: error.statusCode === 413 ? "Ukuran data/foto terlalu besar (maksimal 2MB)." : "Format data tidak valid." }));
    return;
  }

  const kost = String(payload.kost || "").trim();
  const fullName = String(payload.fullName || "").trim();
  const nik = String(payload.nik || "").trim();
  const address = String(payload.address || "").trim();
  const phone = String(payload.phone || "").trim();
  const guardianName = String(payload.guardianName || "").trim();
  const guardianPhone = String(payload.guardianPhone || "").trim();
  const vehicle = String(payload.vehicle || "").trim();
  const agreement = String(payload.agreement || "").trim();
  const ktpBase64 = String(payload.ktpImage || "");

  const isAthaya = kost.toLowerCase().includes("athaya");
  const isAlya = kost.toLowerCase().includes("alya");
  if (!isAthaya && !isAlya) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Silakan pilih kost yang valid (Kost Putri: Athaya atau Kost Putri: Alya)." }));
    return;
  }
  const officialKost = isAthaya ? "Kost Putri: Athaya" : "Kost Putri: Alya";
  if (!fullName || fullName.length > 100) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Nama lengkap calon penghuni wajib diisi (maksimal 100 karakter)." }));
    return;
  }
  if (!/^\d{16}$/.test(nik)) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "NIK harus berjumlah tepat 16 digit angka sesuai KTP." }));
    return;
  }
  if (!address || address.length > 500) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Alamat asal sesuai KTP wajib diisi." }));
    return;
  }
  if (!phone || phone.length < 9 || phone.length > 20) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Nomor WhatsApp / HP penghuni wajib diisi dengan format yang benar." }));
    return;
  }
  if (!guardianName || guardianName.length > 100) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Nama orang tua / wali wajib diisi." }));
    return;
  }
  if (!guardianPhone || guardianPhone.length < 9 || guardianPhone.length > 20) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Nomor WhatsApp orang tua / wali wajib diisi dengan format yang benar." }));
    return;
  }
  if (!ktpBase64 || ktpBase64.length < 50) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Foto KTP wajib diunggah." }));
    return;
  }
  if (!agreement) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Anda harus menyetujui tata tertib kost untuk mendaftar." }));
    return;
  }

  const id = `reg_${Date.now()}_${randomBytes(4).toString("hex")}`;
  let ktpFilename = "";
  try {
    ktpFilename = await saveKtpImage(dataDir, id, ktpBase64);
  } catch (err) {
    console.error("Failed to save KTP image:", err);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Gagal menyimpan foto KTP. Silakan coba lagi." }));
    return;
  }

  const timestampWib = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date()) + " WIB";

  const pdfFilename = `${id}-bukti.pdf`;
  try {
    const pdfBuffer = generateRegistrationPdf({
      id,
      timestampWib,
      kost: officialKost,
      fullName,
      nik,
      address,
      phone,
      guardianName,
      guardianPhone,
      vehicle: vehicle || "Tidak Membawa Kendaraan",
    });
    const uploadsDir = path.join(dataDir, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, pdfFilename), pdfBuffer);
  } catch (pdfErr) {
    console.error("Failed to generate registration PDF:", pdfErr);
  }

  const entry = {
    id,
    timestamp: new Date().toISOString(),
    kost: officialKost,
    fullName,
    nik,
    address,
    phone,
    guardianName,
    guardianPhone,
    ktpImage: ktpFilename,
    pdfFile: pdfFilename,
    vehicle: vehicle || "Tidak Membawa Kendaraan",
    agreement: typeof agreement === "boolean" ? "Saya menyatakan setuju untuk mematuhi seluruh tata tertib yang berlaku di kost ini serta bersedia menerima sanksi apabila melakukan pelanggaran." : agreement,
  };

  await saveRegistration(dataDir, entry);

  const managerPhone = isAthaya ? "628990004926" : "628990004926";
  const managerName = isAthaya ? "Bu Athaya" : "Mbak Alya";
  const waText = `Halo Pengelola Kost Tiga A (${managerName}),\nSaya sudah mengisi formulir pendaftaran penghuni baru:\n\n*Nama:* ${fullName}\n*Pilihan Kost:* ${officialKost}\n*NIK:* ${nik}\n*No. WA:* ${phone}\n*Kendaraan:* ${entry.vehicle}\n*Alamat Asal:* ${address}\n\nMohon konfirmasi pendaftaran saya. Terima kasih!`;
  const whatsappUrl = `https://wa.me/${managerPhone}?text=${encodeURIComponent(waText)}`;

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    ok: true,
    id,
    kost: officialKost,
    fullName,
    managerPhone,
    whatsappUrl,
    pdfUrl: `/daftar/pdf/${pdfFilename}`,
    message: "Pendaftaran berhasil disimpan!",
  }));
}


async function handlePublicPdfDownload(request, response, dataDir) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }
  const url = new URL(request.url, "http://localhost");
  const filename = path.basename(url.pathname);
  if (!filename || !/^reg_\d+_[a-zA-Z0-9]+-bukti\.pdf$/.test(filename)) {
    sendError(response, 404, "Not Found");
    return;
  }
  const filePath = path.join(dataDir, "uploads", filename);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendError(response, 404, "Not Found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": fileStat.size,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Not Found");
      return;
    }
    sendError(response, 500, "Internal Server Error");
  }
}

async function handleKtpDownload(request, response, dataDir, auth, sessions) {
  if (!isAdmin(request, auth, sessions)) {
    rejectAdmin(response, auth);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }
  const url = new URL(request.url, "http://localhost");
  const filename = path.basename(url.pathname);
  if (!filename || filename === "uploads" || filename.includes("..")) {
    sendError(response, 404, "Not Found");
    return;
  }
  const filePath = path.join(dataDir, "uploads", filename);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendError(response, 404, "Not Found");
      return;
    }
    const contentType = filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": fileStat.size,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Not Found");
      return;
    }
    sendError(response, 500, "Internal Server Error");
  }
}

const compressibleTypes = new Set([".html", ".js", ".svg", ".xml", ".txt"]);
const longCacheTypes = new Set([".mp4", ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp"]);
const compressedCache = new Map();
const maxCompressedEntries = 100;
const minCompressSize = 1024;

const pagesWithoutCsp = new Set(["pamflet.html", "poster.html"]);
const scriptHashCache = new Map();
const cspDirectives = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://images.unsplash.com",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
];

function setSecurityHeaders(request, response) {
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (request.headers["x-forwarded-proto"] === "https") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}

export function buildContentSecurityPolicy(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/type\s*=\s*["']?(?!module)[^"'\s>]*json/i.test(match[1]) && match[2].trim()) {
      hashes.push(`'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`);
    }
  }
  return [...cspDirectives, `script-src ${["'self'", ...hashes].join(" ")}`].join("; ");
}

async function getContentSecurityPolicy(filePath, etag) {
  const key = `${filePath}|${etag}`;
  let policy = scriptHashCache.get(key);
  if (!policy) {
    policy = buildContentSecurityPolicy(await readFile(filePath, "utf8"));
    if (scriptHashCache.size >= maxCompressedEntries) {
      scriptHashCache.clear();
    }
    scriptHashCache.set(key, policy);
  }
  return policy;
}

function getCacheControl(extension) {
  if (longCacheTypes.has(extension)) {
    return "public, max-age=604800";
  }
  if (extension === ".svg") {
    return "public, max-age=86400";
  }
  return "no-cache";
}

function getEtag(fileInfo) {
  return `W/"${fileInfo.size.toString(16)}-${Math.floor(fileInfo.mtimeMs).toString(16)}"`;
}

function matchesEtag(header, etag) {
  if (!header) {
    return false;
  }
  if (header.trim() === "*") {
    return true;
  }
  const normalize = (value) => value.trim().replace(/^W\//, "");
  return header.split(",").some((candidate) => normalize(candidate) === normalize(etag));
}

function chooseEncoding(acceptEncoding = "") {
  const accepted = new Set(
    acceptEncoding
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part && !/;\s*q=0(\.0*)?$/.test(part))
      .map((part) => part.split(";")[0]),
  );
  if (accepted.has("br")) {
    return "br";
  }
  if (accepted.has("gzip")) {
    return "gzip";
  }
  return null;
}

async function compress(source, encoding) {
  return encoding === "br"
    ? brotliCompressAsync(source, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length },
      })
    : gzipAsync(source, { level: 9 });
}

function rememberCompressed(key, body) {
  if (compressedCache.size >= maxCompressedEntries) {
    compressedCache.clear();
  }
  compressedCache.set(key, body);
  return body;
}

async function getCompressedBuffer(source, encoding, key) {
  const cacheKey = `${key}|${encoding}`;
  return compressedCache.get(cacheKey) ?? rememberCompressed(cacheKey, await compress(source, encoding));
}

async function getCompressedBody(filePath, encoding, etag) {
  const key = `${filePath}|${encoding}|${etag}`;
  const cached = compressedCache.get(key);
  if (cached) {
    return cached;
  }

  return rememberCompressed(key, await compress(await readFile(filePath), encoding));
}

const variantPages = ["index.html", "2.html", "3.html", "4.html", "5.html", "6.html"];
const variantCookieName = "kost-variant";
const variantCookieMaxAge = 60 * 60 * 24 * 365;
const renderedHomeCache = new Map();
const maxRenderedHomeEntries = 20;

function readVariantCookie(header = "") {
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === variantCookieName) {
      const selected = value.join("=");
      return variantPages.includes(selected) ? selected : null;
    }
  }
  return null;
}

// Menyalin perilaku skrip pemilih tema di index.html: hanya tema yang diganti, isi halaman tetap dari index.html
function applyVariant(indexHtml, variantHtml, variant) {
  let html = indexHtml.replace(/<script>([\s\S]*?)<\/script>\s*/g, (match, body) =>
    body.includes("kost-tiga-a-page-variant") ? "" : match,
  );

  if (variantHtml !== null) {
    const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(variantHtml);
    if (style) {
      html = html.replace(/(<style id="variant-theme">)[\s\S]*?(<\/style>)/, (match, open, close) => open + style[1] + close);
    }

    const fontLink = /<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/gi;
    const variantFonts = variantHtml.match(fontLink);
    if (variantFonts) {
      let replaced = false;
      html = html.replace(fontLink, () => {
        if (replaced) {
          return "";
        }
        replaced = true;
        return variantFonts.join("\n  ");
      });
    }

    const themeColor = /<meta name="theme-color" content="[^"]*">/.exec(variantHtml);
    if (themeColor) {
      html = html.replace(/<meta name="theme-color" content="[^"]*">/, () => themeColor[0]);
    }
  }

  return html.replace(/<html\b([^>]*)>/i, (match, attributes) => `<html${attributes} data-variant="${variant}">`);
}

const indonesianMonths = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatUpdatedTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const pad = (value) => String(value).padStart(2, "0");
  return {
    iso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${parts.hour}:${parts.minute}:${parts.second}+07:00`,
    label: `${Number(parts.day)} ${indonesianMonths[parts.month - 1]} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} WIB`,
  };
}

function stampUpdated(html, date) {
  const { iso, label } = formatUpdatedTime(date);
  return html.replace(
    /Terakhir diperbarui: <time datetime="[^"]*">[^<]*<\/time>/,
    () => "Terakhir diperbarui: " + `<time datetime="${iso}">${label}</time>`,
  );
}

async function statOptional(file) {
  try {
    return await stat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function renderHome(variant, dataDir) {
  const indexPath = path.join(publicRoot, "index.html");
  const variantPath = path.join(publicRoot, variant);
  const [indexInfo, variantInfo, roomsInfo] = await Promise.all([
    stat(indexPath),
    stat(variantPath),
    statOptional(path.join(dataDir, "rooms.json")),
  ]);
  const updatedMs = Math.max(indexInfo.mtimeMs, variantInfo.mtimeMs, roomsInfo?.mtimeMs ?? 0);
  const key = `${variant}|${indexInfo.mtimeMs}|${variantInfo.mtimeMs}|${roomsInfo?.mtimeMs ?? 0}`;

  let entry = renderedHomeCache.get(key);
  if (!entry) {
    const [indexHtml, variantHtml] = await Promise.all([
      readFile(indexPath, "utf8"),
      variant === "index.html" ? null : readFile(variantPath, "utf8"),
    ]);
    const html = stampUpdated(applyVariant(indexHtml, variantHtml, variant), new Date(updatedMs));
    const body = Buffer.from(html);
    entry = {
      body,
      csp: buildContentSecurityPolicy(html),
      etag: `W/"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
      lastModified: new Date(updatedMs).toUTCString(),
    };
    if (renderedHomeCache.size >= maxRenderedHomeEntries) {
      renderedHomeCache.clear();
    }
    renderedHomeCache.set(key, entry);
  }
  return entry;
}

async function serveHome(request, response, dataDir) {
  const cookieVariant = readVariantCookie(request.headers.cookie);
  const variant = cookieVariant ?? variantPages[randomInt(variantPages.length)];
  const entry = await renderHome(variant, dataDir);

  const headers = {
    "Cache-Control": "private, no-cache",
    "Content-Security-Policy": entry.csp,
    "Content-Type": contentTypes.get(".html"),
    ETag: entry.etag,
    "Last-Modified": entry.lastModified,
    Vary: "Accept-Encoding, Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (!cookieVariant) {
    const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    headers["Set-Cookie"] =
      `${variantCookieName}=${variant}; Max-Age=${variantCookieMaxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  }

  if (matchesEtag(request.headers["if-none-match"], entry.etag)) {
    delete headers["Content-Type"];
    response.writeHead(304, headers);
    response.end();
    return;
  }

  let body = entry.body;
  const encoding = chooseEncoding(request.headers["accept-encoding"]);
  if (encoding) {
    body = await getCompressedBuffer(entry.body, encoding, `home|${entry.etag}`);
    headers["Content-Encoding"] = encoding;
  }
  headers["Content-Length"] = body.length;
  response.writeHead(200, headers);
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendError(response, statusCode, message, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(message);
}

function getByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || size === 0 || (!match[1] && !match[2])) {
    return null;
  }

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (suffixLength === 0) {
      return null;
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || start > end) {
      return null;
    }
    end = Math.min(end, size - 1);
  }

  return { start, end };
}

async function serveStaticFile(request, response, requestedPathOverride) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    sendError(response, 400, "Bad Request");
    return;
  }

  if (decodedPath.includes("\\") || decodedPath.includes("\0")) {
    sendError(response, 400, "Bad Request");
    return;
  }

  const segments = decodedPath.split("/");
  const routeSegments = segments.slice(1);
  const firstSegment = routeSegments[0]?.toLowerCase();
  if (
    segments.some((segment) => segment.startsWith(".")) ||
    privateFiles.has(firstSegment) ||
    privateDirectories.has(firstSegment)
  ) {
    sendError(response, 404, "Not Found");
    return;
  }

  const requestedPath = requestedPathOverride ?? (decodedPath === "/" ? "index.html" : decodedPath.slice(1));
  const filePath = path.resolve(publicRoot, requestedPath);
  const relativePath = path.relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendError(response, 404, "Not Found");
    return;
  }

  const contentType = contentTypes.get(path.extname(filePath).toLowerCase());
  if (!contentType) {
    sendError(response, 404, "Not Found");
    return;
  }

  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      sendError(response, 404, "Not Found");
      return;
    }
    throw error;
  }

  if (!fileInfo.isFile()) {
    sendError(response, 404, "Not Found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const etag = getEtag(fileInfo);
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": requestedPathOverride ? "no-store" : getCacheControl(extension),
    "Content-Type": contentType,
    ETag: etag,
    "Last-Modified": fileInfo.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
  if (requestedPathOverride) {
    headers["X-Robots-Tag"] = "noindex, nofollow";
  }
  const isCompressible = compressibleTypes.has(extension);
  if (isCompressible) {
    headers.Vary = "Accept-Encoding";
  }
  if (extension === ".html" && !pagesWithoutCsp.has(path.basename(filePath).toLowerCase())) {
    headers["Content-Security-Policy"] = await getContentSecurityPolicy(filePath, etag);
  }

  if (matchesEtag(request.headers["if-none-match"], etag)) {
    delete headers["Content-Type"];
    response.writeHead(304, headers);
    response.end();
    return;
  }

  const encoding =
    isCompressible && !request.headers.range && fileInfo.size >= minCompressSize
      ? chooseEncoding(request.headers["accept-encoding"])
      : null;
  if (encoding) {
    const body = await getCompressedBody(filePath, encoding, etag);
    delete headers["Accept-Ranges"];
    headers["Content-Encoding"] = encoding;
    headers["Content-Length"] = body.length;
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  let streamOptions;

  if (request.headers.range) {
    const range = getByteRange(request.headers.range, fileInfo.size);
    if (!range) {
      sendError(response, 416, "Range Not Satisfiable", {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileInfo.size}`,
      });
      return;
    }

    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileInfo.size}`;
    headers["Content-Length"] = range.end - range.start + 1;
    streamOptions = range;
    response.writeHead(206, headers);
  } else {
    headers["Content-Length"] = fileInfo.size;
    response.writeHead(200, headers);
  }

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(filePath, streamOptions);
  stream.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    console.error("Failed to read static file:", error);
    sendError(response, 500, "Internal Server Error");
  });
  stream.pipe(response);
}

function proxyToDashboardApi(request, response, url) {
  const targetPath = url.pathname.replace(/^\/dashboard/, "") + url.search;
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: 5000,
      path: targetPath,
      method: request.method,
      headers: {
        ...request.headers,
        host: "127.0.0.1:5000",
        "x-forwarded-proto": request.headers["x-forwarded-proto"] || "http",
        "x-forwarded-for": request.socket.remoteAddress,
      },
    },
    (proxyRes) => {
      response.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(response);
    }
  );
  proxyReq.on("error", (err) => {
    console.error("Dashboard API proxy error:", err.message);
    sendError(response, 502, "Bad Gateway: Backend dashboard API (port 5000) belum aktif atau tidak dapat dihubungi.");
  });
  request.pipe(proxyReq);
}

async function serveDashboardSpaFile(request, response, filePath, isHtml = false) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendError(response, 404, "Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes.get(ext) || (isHtml ? "text/html; charset=utf-8" : "application/octet-stream");
    const headers = {
      "Content-Type": contentType,
      "Content-Length": fileStat.size,
      "X-Content-Type-Options": "nosniff",
    };
    if (isHtml) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    } else {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    if (request.method === "HEAD") {
      response.writeHead(200, headers);
      response.end();
      return;
    }
    response.writeHead(200, headers);
    createReadStream(filePath).pipe(response);
  } catch (err) {
    if (err.code === "ENOENT") {
      sendError(response, 404, "Not Found");
    } else {
      console.error("Error serving dashboard SPA file:", err);
      sendError(response, 500, "Internal Server Error");
    }
  }
}

function ensureDashboardApiServer() {
  const socket = connect(5000, "127.0.0.1", () => {
    socket.destroy();
  });
  socket.on("error", () => {
    const apiServerPath = path.join(publicRoot, "dashboard", "server", "server.js");
    if (existsSync(apiServerPath)) {
      console.log("Memulai backend API dashboard di port 5000...");
      const child = spawn(process.execPath, [apiServerPath], {
        cwd: path.dirname(apiServerPath),
        stdio: "inherit",
        detached: false,
      });
      child.on("error", (err) => console.error("Gagal memulai backend dashboard:", err));
      process.on("exit", () => child.kill());
    }
  });
}

export function createServer({
  dataDir = process.env.DATA_DIR || path.join(publicRoot, "data"),
  adminSecret = process.env.ADMIN_SECRET,
  adminUser = process.env.ADMIN_USER,
  adminPassword = process.env.ADMIN_PASSWORD,
  serveDashboardSpa = false,
} = {}) {
  if (Boolean(adminUser) !== Boolean(adminPassword)) {
    throw new Error("ADMIN_USER and ADMIN_PASSWORD must be configured together.");
  }
  if (adminUser?.includes(":")) {
    throw new Error("ADMIN_USER must not contain a colon.");
  }
  const adminAuth = { adminUser, adminPassword, adminSecret };
  const adminSessions = new Map();
  const clickStore = createClickStore(dataDir);
  const visitorStore = createVisitorStore(dataDir);
  const accessLogs = createAccessLogStore(dataDir);

  const server = createHttpServer((request, response) => {
    setSecurityHeaders(request, response);
    response.once("finish", () => {
      let clientIp = request.socket.remoteAddress ?? "unknown";
      if (clientIp === "::1" || clientIp === "127.0.0.1" || clientIp === "::ffff:127.0.0.1") {
        clientIp = request.headers["x-real-ip"] ?? clientIp;
      }
      const entry = {
        ip: clientIp,
        time: new Date().toISOString(),
        method: request.method ?? "UNKNOWN",
        path: new URL(request.url, "http://localhost").pathname,
        status: response.statusCode,
        userAgent: request.headers["user-agent"] ?? "",
      };
      void accessLogs.record(entry);
    });
    const { pathname, search } = new URL(request.url, "http://localhost");
    let handler;
    if (pathname === "/api/click") {
      handler = handleClick(request, response, clickStore);
    } else if (pathname === "/api/visitors") {
      handler = handleVisitors(request, response, visitorStore);
    } else if (pathname === "/api/rooms") {
      handler = handleRooms(request, response, dataDir);
    } else if (pathname.startsWith("/daftar/pdf/")) {
      handler = handlePublicPdfDownload(request, response, dataDir);
    } else if (pathname === "/daftar" || pathname === "/daftar/") {
      handler = handleDaftar(request, response, dataDir);
    } else if (pathname === "/formulir" || pathname === "/formulir/") {
      response.writeHead(301, { Location: "/daftar", "Cache-Control": "public, max-age=86400" });
      response.end();
      return;
    } else if (pathname.startsWith("/admin/uploads/") || pathname.startsWith("/dashboard/uploads/")) {
      handler = handleKtpDownload(request, response, dataDir, adminAuth, adminSessions);
    } else if (serveDashboardSpa && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
      if (pathname === "/dashboard") {
        response.writeHead(301, { Location: "/dashboard/", "Cache-Control": "no-cache" });
        response.end();
        return;
      }
      if (pathname.startsWith("/dashboard/api/")) {
        proxyToDashboardApi(request, response, new URL(request.url, "http://localhost"));
        return;
      }
      if (pathname.startsWith("/dashboard/assets/")) {
        const assetName = path.basename(pathname);
        const assetPath = path.join(dashboardDistDir, "assets", assetName);
        handler = serveDashboardSpaFile(request, response, assetPath);
      } else if (pathname === "/dashboard/favicon.svg" || pathname === "/dashboard/apple-touch-icon.png") {
        const iconPath = path.join(dashboardDistDir, path.basename(pathname));
        handler = serveDashboardSpaFile(request, response, iconPath);
      } else {
        const indexPath = path.join(dashboardDistDir, "index.html");
        handler = serveDashboardSpaFile(request, response, indexPath, true);
      }
    } else if (pathname === "/admin" || pathname === "/admin/" || pathname === "/dashboard" || pathname === "/dashboard/") {
      handler = handleAdminDashboard(request, response, dataDir, accessLogs, adminAuth, adminSessions);
    } else if (legacyAdminRoutes.has(pathname)) {
      if (!isAdmin(request, adminAuth, adminSessions)) {
        rejectAdmin(response, adminAuth);
        return;
      }
      response.writeHead(308, { Location: legacyAdminRoutes.get(pathname), "Cache-Control": "no-store" });
      response.end();
      return;
    } else if (pathname.startsWith("/admin/")) {
      sendError(response, 404, "Not Found");
      return;
    } else if ((pathname === "/" || pathname === "/index.html") && (request.method === "GET" || request.method === "HEAD")) {
      handler = serveHome(request, response, dataDir);
    } else {
      handler = serveStaticFile(request, response);
    }
    void handler.catch((error) => {
      console.error("Failed to serve request:", error);
      if (!response.headersSent) {
        sendError(response, 500, "Internal Server Error");
      } else {
        response.destroy(error);
      }
    });
  });
  server.flushAccessLogs = () => accessLogs.flush();
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = path.join(publicRoot, ".env");
  if (existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {}
  }

  ensureDashboardApiServer();

  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const server = createServer({ serveDashboardSpa: true });
  server.on("error", (error) => {
    console.error("Unable to start the web server:", error);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || "0.0.0.0", () => {
    const address = server.address();
    console.log(`Kost Tiga A is running at http://localhost:${address.port}`);
  });
}
