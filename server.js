import { createHash, randomInt } from "node:crypto";
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
const privateFiles = new Set(["server.js"]);
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
async function handleRooms(request, response, dataDir) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

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

  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : JSON.stringify(rooms));
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

async function renderHome(variant) {
  const indexPath = path.join(publicRoot, "index.html");
  const variantPath = path.join(publicRoot, variant);
  const [indexInfo, variantInfo] = await Promise.all([stat(indexPath), stat(variantPath)]);
  const key = `${variant}|${indexInfo.mtimeMs}|${variantInfo.mtimeMs}`;

  let entry = renderedHomeCache.get(key);
  if (!entry) {
    const [indexHtml, variantHtml] = await Promise.all([
      readFile(indexPath, "utf8"),
      variant === "index.html" ? null : readFile(variantPath, "utf8"),
    ]);
    const html = applyVariant(indexHtml, variantHtml, variant);
    const body = Buffer.from(html);
    entry = {
      body,
      csp: buildContentSecurityPolicy(html),
      etag: `W/"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
      lastModified: new Date(Math.max(indexInfo.mtimeMs, variantInfo.mtimeMs)).toUTCString(),
    };
    if (renderedHomeCache.size >= maxRenderedHomeEntries) {
      renderedHomeCache.clear();
    }
    renderedHomeCache.set(key, entry);
  }
  return entry;
}

async function serveHome(request, response) {
  const cookieVariant = readVariantCookie(request.headers.cookie);
  const variant = cookieVariant ?? variantPages[randomInt(variantPages.length)];
  const entry = await renderHome(variant);

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

async function serveStaticFile(request, response) {
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

  const requestedPath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
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
    "Cache-Control": getCacheControl(extension),
    "Content-Type": contentType,
    ETag: etag,
    "Last-Modified": fileInfo.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
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

export function createServer({ dataDir = process.env.DATA_DIR || path.join(publicRoot, "data") } = {}) {
  const clickStore = createClickStore(dataDir);
  const visitorStore = createVisitorStore(dataDir);

  return createHttpServer((request, response) => {
    setSecurityHeaders(request, response);
    const { pathname } = new URL(request.url, "http://localhost");
    let handler;
    if (pathname === "/api/click") {
      handler = handleClick(request, response, clickStore);
    } else if (pathname === "/api/visitors") {
      handler = handleVisitors(request, response, visitorStore);
    } else if (pathname === "/api/rooms") {
      handler = handleRooms(request, response, dataDir);
    } else if ((pathname === "/" || pathname === "/index.html") && (request.method === "GET" || request.method === "HEAD")) {
      handler = serveHome(request, response);
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
