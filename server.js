import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
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
const privateDirectories = new Set(["test"]);
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
  "connect-src 'self' https://abacus.jasoncameron.dev",
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

async function getContentSecurityPolicy(filePath, etag) {
  const key = `${filePath}|${etag}`;
  let scriptSources = scriptHashCache.get(key);
  if (!scriptSources) {
    const html = await readFile(filePath, "utf8");
    const hashes = [];
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/type\s*=\s*["']?(?!module)[^"'\s>]*json/i.test(match[1]) && match[2].trim()) {
        hashes.push(`'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`);
      }
    }
    scriptSources = ["'self'", ...hashes].join(" ");
    if (scriptHashCache.size >= maxCompressedEntries) {
      scriptHashCache.clear();
    }
    scriptHashCache.set(key, scriptSources);
  }
  return [...cspDirectives, `script-src ${scriptSources}`].join("; ");
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

async function getCompressedBody(filePath, encoding, etag) {
  const key = `${filePath}|${encoding}|${etag}`;
  const cached = compressedCache.get(key);
  if (cached) {
    return cached;
  }

  const source = await readFile(filePath);
  const body =
    encoding === "br"
      ? await brotliCompressAsync(source, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length },
        })
      : await gzipAsync(source, { level: 9 });

  if (compressedCache.size >= maxCompressedEntries) {
    compressedCache.clear();
  }
  compressedCache.set(key, body);
  return body;
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

export function createServer() {
  return createHttpServer((request, response) => {
    setSecurityHeaders(request, response);
    void serveStaticFile(request, response).catch((error) => {
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
