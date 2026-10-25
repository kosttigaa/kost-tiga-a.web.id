import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { promisify } from "node:util";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const publicRoot = path.dirname(fileURLToPath(import.meta.url));
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
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
const targetNames = { athaya: "Kost Athaya", alya: "Kost Putri: Alya" };

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

const adminStyles = `
:root{color-scheme:light;--paper:#f8f5ff;--ink:#251d38;--muted:#6d667d;--line:#e8e1f2;--blue:#5339c0;--acid:#dcfa67;font-family:"DM Sans",sans-serif;font-synthesis:none;text-rendering:optimizeLegibility}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:var(--ink);background:radial-gradient(ellipse at 8% 0,rgb(114 85 232/10%),transparent 30rem),var(--paper)}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:68px;padding:0 max(24px,calc((100% - 1120px)/2));border-bottom:1px solid var(--line);background:rgb(255 255 255/80%)}
.brand{display:inline-flex;align-items:center;gap:11px;color:inherit;text-decoration:none;font-family:Manrope,sans-serif;font-weight:800}
.mark{display:grid;width:36px;aspect-ratio:1;place-items:center;border:2px solid var(--ink);border-radius:12px;background:var(--acid);font-size:12px;transform:rotate(-5deg)}
.private-label{color:var(--muted);font-size:12px;font-weight:700}
main{width:min(1120px,calc(100% - 40px));margin:48px auto}
nav.admin-nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
nav.admin-nav a{padding:8px 14px;border:1px solid #d7cfe5;border-radius:6px;background:#fff;color:var(--ink);font-size:13px;font-weight:700;text-decoration:none}
nav.admin-nav a:hover{border-color:var(--blue);color:var(--blue)}
nav.admin-nav a[aria-current=page]{border-color:var(--ink);background:var(--ink);color:#fff}
.eyebrow{margin:0 0 8px;color:var(--blue);font-size:12px;font-weight:700;text-transform:uppercase}
h1{margin:0;font-family:Manrope,sans-serif;font-size:clamp(26px,4vw,34px);line-height:1.15}
h2{margin:0 0 12px;font-family:Manrope,sans-serif;font-size:16px}
.intro{margin:10px 0 26px;color:var(--muted);font-size:14px}
.muted{color:var(--muted);font-size:13px}
.panel{padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px}
.card strong{display:block;font-family:Manrope,sans-serif;font-size:30px;line-height:1.2}
.card span{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:14px}
table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
th,td{padding:10px 8px;border-bottom:1px solid #eeeaf4}
th{background:#f1ecfb;color:#403657;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
tr:last-child td{border-bottom:0}
th.num,td.num{text-align:right}
.num{font-variant-numeric:tabular-nums}
ul.chart{margin:0;padding:0;list-style:none}
ul.chart li{display:grid;grid-template-columns:3.4rem 1fr 2.5rem;align-items:center;gap:10px;padding:3px 0;font-size:13px}
.day{color:var(--muted)}
.bar{display:block;height:12px;min-width:2px;border-radius:3px;background:var(--blue)}
.ok{margin:0 0 16px;padding:11px 14px;border:1px solid #b9e3c6;border-radius:6px;background:#e6f6ec;color:#146c2e;font-size:14px;font-weight:700}
form{margin:0}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.table-wrap table{min-width:650px}
.toolbar{display:flex;gap:12px;margin-bottom:12px}
.toolbar input{min-height:42px;font-size:14px}
.pagination{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:14px}
.pagination button{width:auto;min-height:38px}
.pagination button:disabled{background:#d8d3e1;color:#6d667d;cursor:not-allowed}
#page-info{min-width:110px;color:var(--muted);font-size:13px;text-align:center}
.dashboard-section{padding:24px 0;scroll-margin-top:16px}
.dashboard-section+.dashboard-section{border-top:1px solid var(--line)}
.dashboard-section h1{margin:0;font-family:Manrope,sans-serif;font-size:clamp(24px,4vw,32px)}
.dashboard-section>.intro{margin-bottom:18px}
.status-code,.ip,.time{white-space:nowrap;font-variant-numeric:tabular-nums}
.path{min-width:180px;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.browser{min-width:140px}
.empty{padding:28px 14px;color:var(--muted);text-align:center}
.box{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:14px}
.box h2{grid-column:1/-1;margin:0}
label{display:grid;gap:6px;min-width:0;font-size:13px;font-weight:700}
input{width:100%;min-height:46px;padding:0 13px;border:1px solid #d7cfe5;border-radius:6px;background:#fff;color:var(--ink);font:inherit;font-size:20px}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #9b87f0;outline-offset:2px}
button{width:100%;min-height:46px;padding:0 16px;border:0;border-radius:6px;background:var(--ink);color:#fff;font:inherit;font-weight:700;cursor:pointer}
button:hover{background:var(--blue)}
@media (max-width:600px){header{min-height:60px;padding-inline:16px}main{width:calc(100% - 28px);margin:32px auto}.toolbar{flex-direction:column}.dashboard-section{padding:18px 0}}
`;

const adminLinks = [
  ["/dashboard#logs", "Log akses"],
  ["/dashboard#stats", "Statistik"],
  ["/dashboard#rooms", "Kamar kosong"],
];
const legacyAdminRoutes = new Map([
  ["/admin/logs", "/dashboard#logs"],
  ["/admin/logs/", "/dashboard#logs"],
  ["/admin/stats", "/dashboard#stats"],
  ["/admin/kamar", "/dashboard#rooms"],
]);

function renderAdminPage({ title, content }) {
  const links = adminLinks
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join("");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${title} | Kost Tiga A</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap" rel="stylesheet">
<style>${adminStyles}</style>
</head>
<body>
<header>
<a class="brand" href="/"><span class="mark">3A</span><span>Kost Tiga A</span></a>
<span class="private-label">PANEL PRIVAT</span>
</header>
<main>
<nav class="admin-nav" aria-label="Menu admin">${links}</nav>
${content}
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

  return `<section id="stats" class="dashboard-section" aria-labelledby="stats-title">
<p class="eyebrow">Administrasi situs</p><h1 id="stats-title">Statistik situs</h1>
<p class="intro">Dibuat ${escapeHtml(now.toISOString())}. Data klik dihitung per hari WIB.</p>${content}
</section>`;
}

function matchesSecret(suppliedValue, expectedValue) {
  const supplied = Buffer.from(String(suppliedValue ?? ""));
  const expected = Buffer.from(expectedValue ?? "");
  return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isAdmin(request, auth) {
  const authorization = request.headers.authorization ?? "";
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(authorization);
  if (match && auth.adminUser && auth.adminPassword) {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (
      separator >= 0 &&
      matchesSecret(decoded.slice(0, separator), auth.adminUser) &&
      matchesSecret(decoded.slice(separator + 1), auth.adminPassword)
    ) {
      return true;
    }
  }
  return matchesSecret(request.headers["x-admin-secret"], auth.adminSecret);
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
<div class="toolbar"><input id="search" type="search" aria-label="Cari log" placeholder="Cari IP, halaman, browser, metode, atau status"><button id="refresh" type="button">Muat ulang</button></div>
<div class="table-wrap"><table>
<thead><tr><th scope="col">IP</th><th scope="col">Waktu WIB</th><th scope="col">Halaman</th><th scope="col">Browser</th><th scope="col">Metode</th><th scope="col">Status</th></tr></thead>
<tbody id="entries"><tr><td class="empty" colspan="6">Memuat log...</td></tr></tbody>
</table></div>
<nav class="pagination" aria-label="Navigasi halaman log"><button id="previous-page" type="button">Sebelumnya</button><span id="page-info" aria-live="polite">Halaman 1 dari 1</span><button id="next-page" type="button">Berikutnya</button></nav>
</section>`;
}

const dashboardScript = `const pageSize=50,statusElement=document.getElementById("status"),entriesElement=document.getElementById("entries"),searchElement=document.getElementById("search"),previousPageButton=document.getElementById("previous-page"),nextPageButton=document.getElementById("next-page"),pageInfoElement=document.getElementById("page-info");let entries=[],currentPage=1;
function getBrowser(userAgent){const browsers=[["Edge",/Edg(?:e|A|iOS)?\\/([\\d.]+)/],["Opera",/(?:OPR|Opera)\\/([\\d.]+)/],["Samsung Internet",/SamsungBrowser\\/([\\d.]+)/],["Firefox",/(?:Firefox|FxiOS)\\/([\\d.]+)/],["Chrome",/(?:Chrome|CriOS)\\/([\\d.]+)/],["Safari",/Version\\/([\\d.]+).*Safari/]];for(const [name,pattern] of browsers){const match=userAgent.match(pattern);if(match)return name+" "+match[1]}return "Tidak diketahui"}
function renderEntries(){const query=searchElement.value.trim().toLowerCase(),visible=entries.filter(entry=>(entry.ip+" "+entry.path+" "+entry.browser+" "+entry.method+" "+entry.status).toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(visible.length/pageSize));currentPage=Math.min(currentPage,pages);const start=(currentPage-1)*pageSize,items=visible.slice(start,start+pageSize);entriesElement.replaceChildren();pageInfoElement.textContent="Halaman "+currentPage+" dari "+pages;previousPageButton.disabled=currentPage===1;nextPageButton.disabled=currentPage===pages;statusElement.textContent=visible.length?"Menampilkan "+(start+1)+"-"+(start+items.length)+" dari "+visible.length+" request.":"Menampilkan 0 dari "+(entries.length?"hasil pencarian":"request");if(!items.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.className="empty";cell.colSpan=6;cell.textContent=entries.length?"Tidak ada hasil yang cocok.":"Belum ada request tercatat.";row.append(cell);entriesElement.append(row);return}for(const entry of items){const row=document.createElement("tr"),time=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"medium"}).format(new Date(entry.time))+" WIB";for(const [value,className] of [[entry.ip,"ip"],[time,"time"],[entry.path,"path"],[getBrowser(entry.userAgent),"browser"],[entry.method,""],[String(entry.status),"status-code"]]){const cell=document.createElement("td");cell.className=className;cell.textContent=value;row.append(cell)}entriesElement.append(row)}}
async function loadLog(){statusElement.textContent="Memuat log...";try{const response=await fetch("/dashboard?data=logs",{cache:"no-store",credentials:"same-origin"});if(!response.ok)throw new Error("HTTP "+response.status);entries=await response.json();currentPage=1;renderEntries()}catch{entries=[];currentPage=1;renderEntries();statusElement.textContent="Log gagal dimuat. Pastikan autentikasi berhasil, lalu muat ulang."}}
document.getElementById("refresh").addEventListener("click",loadLog);previousPageButton.addEventListener("click",()=>{currentPage--;renderEntries()});nextPageButton.addEventListener("click",()=>{currentPage++;renderEntries()});searchElement.addEventListener("input",()=>{currentPage=1;renderEntries()});loadLog();`;

function dashboardCsp() {
  const hash = createHash("sha256").update(dashboardScript).digest("base64");
  return [
    "default-src 'none'",
    "script-src 'sha256-" + hash + "'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function handleAdminDashboard(request, response, dataDir, accessLogs, auth) {
  if (!isAdmin(request, auth)) {
    rejectAdmin(response, auth);
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;
  if (pathname === "/dashboard" && url.searchParams.get("data") === "logs") {
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
  if (pathname !== "/dashboard" && pathname !== "/dashboard/") {
    sendError(response, 404, "Not Found");
    return;
  }

  if (request.method === "POST") {
    let originHost = null;
    try {
      originHost = new URL(request.headers.origin ?? "").host;
    } catch {}
    if (originHost !== request.headers.host && request.headers["sec-fetch-site"] !== "same-origin") {
      sendError(response, 403, "Forbidden");
      return;
    }
    let form;
    try {
      form = new URLSearchParams(await readSmallBody(request));
    } catch (error) {
      sendError(response, error.statusCode === 413 ? 413 : 400, error.statusCode === 413 ? "Payload Too Large" : "Bad Request");
      return;
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
    response.writeHead(303, { Location: "/dashboard?saved=1#rooms", "Cache-Control": "no-store" });
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
<section id="rooms" class="dashboard-section" aria-labelledby="rooms-title"><p class="eyebrow">Administrasi situs</p><h1 id="rooms-title">Kamar kosong</h1><p class="intro">Atur jumlah kamar kosong. Angka 0 tampil "penuh"; kosongkan kolom untuk tidak menampilkan tipe. ${rooms.updatedAt ? `Terakhir diperbarui ${escapeHtml(rooms.updatedAt)}.` : "Belum pernah diatur."}</p>${renderRoomsForm(rooms, notice)}</section>
<script>${dashboardScript}</script>`;
  const body = renderAdminPage({ title: "Dashboard", content });
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": dashboardCsp(),
    "X-Robots-Tag": "noindex, nofollow",
  });
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

function renderRoomsForm(rooms, message) {
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
<form method="post" action="/dashboard#rooms">
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
    () => `Terakhir diperbarui: <time datetime="${iso}">${label}</time>`,
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

export function createServer({
  dataDir = process.env.DATA_DIR || path.join(publicRoot, "data"),
  adminSecret = process.env.ADMIN_SECRET,
  adminUser = process.env.ADMIN_USER,
  adminPassword = process.env.ADMIN_PASSWORD,
} = {}) {
  if (Boolean(adminUser) !== Boolean(adminPassword)) {
    throw new Error("ADMIN_USER and ADMIN_PASSWORD must be configured together.");
  }
  if (adminUser?.includes(":")) {
    throw new Error("ADMIN_USER must not contain a colon.");
  }
  const adminAuth = { adminUser, adminPassword, adminSecret };
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
    const { pathname } = new URL(request.url, "http://localhost");
    let handler;
    if (pathname === "/api/click") {
      handler = handleClick(request, response, clickStore);
    } else if (pathname === "/api/visitors") {
      handler = handleVisitors(request, response, visitorStore);
    } else if (pathname === "/api/rooms") {
      handler = handleRooms(request, response, dataDir);
    } else if (pathname === "/dashboard" || pathname === "/dashboard/") {
      handler = handleAdminDashboard(request, response, dataDir, accessLogs, adminAuth);
    } else if (legacyAdminRoutes.has(pathname)) {
      if (!isAdmin(request, adminAuth)) {
        rejectAdmin(response, adminAuth);
        return;
      }
      response.writeHead(308, { Location: legacyAdminRoutes.get(pathname), "Cache-Control": "no-store" });
      response.end();
      return;
    } else if (pathname === "/admin" || pathname.startsWith("/admin/")) {
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
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const server = createServer();
  server.on("error", (error) => {
    console.error("Unable to start the web server:", error);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || "0.0.0.0", () => {
    const address = server.address();
    console.log(`Kost Tiga A is running at http://localhost:${address.port}`);
  });
}
