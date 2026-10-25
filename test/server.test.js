import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildContentSecurityPolicy, createServer, summarizeClicks } from "../server.js";

const execFileAsync = promisify(execFile);

describe("static website server", () => {
  let dataDir;
  let server;
  let baseUrl;

  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "kost-clicks-"));
    server = createServer({ dataDir });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(dataDir, { recursive: true, force: true });
  });

  const postClick = (body, headers = {}) =>
    fetch(`${baseUrl}/api/click`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

  it("serves the homepage and existing page variants", async () => {
    for (const route of ["/", "/2.html", "/6.html"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(await response.text(), /Kost Tiga A/);
    }
  });

  it("serves scripts and supports byte ranges for the room video", async () => {
    const scriptResponse = await fetch(`${baseUrl}/counter.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /javascript/);

    const videoResponse = await fetch(`${baseUrl}/img/athaya%201.mp4`, {
      headers: { Range: "bytes=0-2" },
    });
    assert.equal(videoResponse.status, 206);
    assert.equal(videoResponse.headers.get("content-range"), "bytes 0-2/2596335");
    assert.equal((await videoResponse.arrayBuffer()).byteLength, 3);
  });

  it("does not expose server files or paths outside the site", async () => {
    for (const route of [
      "/server.js",
      "/SERVER.js",
      "/package.json",
      "/test/server.test.js",
      "/..%2fserver.js",
      "/.git/config",
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 404, route);
    }
  });

  it("supports conditional requests with ETag", async () => {
    const first = await fetch(`${baseUrl}/2.html`);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    assert.equal(first.headers.get("cache-control"), "no-cache");
    await first.arrayBuffer();

    const second = await fetch(`${baseUrl}/2.html`, { headers: { "If-None-Match": etag } });
    assert.equal(second.status, 304);
    assert.equal(second.headers.get("etag"), etag);
  });

  it("compresses text files and caches media for a week", async () => {
    for (const encoding of ["br", "gzip"]) {
      const response = await fetch(`${baseUrl}/2.html`, {
        headers: { "Accept-Encoding": encoding },
      });
      assert.equal(response.headers.get("content-encoding"), encoding);
      assert.equal(response.headers.get("vary"), "Accept-Encoding");
      assert.match(await response.text(), /Kost Tiga A/);
    }

    const plain = await fetch(`${baseUrl}/2.html`, { headers: { "Accept-Encoding": "identity" } });
    assert.equal(plain.headers.get("content-encoding"), null);
    await plain.arrayBuffer();

    const video = await fetch(`${baseUrl}/img/athaya%201.mp4`, { headers: { Range: "bytes=0-9" } });
    assert.equal(video.headers.get("cache-control"), "public, max-age=604800");
    assert.equal(video.headers.get("content-encoding"), null);
    await video.arrayBuffer();
  });

  it("sends security headers and a CSP without inline scripts on the homepage", async () => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    await response.arrayBuffer();
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");

    const csp = response.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);

    const plain = await fetch(`${baseUrl}/2.html`);
    assert.equal(plain.headers.get("strict-transport-security"), null);
    await plain.arrayBuffer();
  });

  it("hashes only real inline scripts in the CSP", () => {
    const html = [
      "<script>alert(1)</script>",
      '<script type="application/ld+json">{"a":1}</script>',
      '<script src="x.js" defer></script>',
    ].join("\n");
    const hash = createHash("sha256").update("alert(1)").digest("base64");
    const csp = buildContentSecurityPolicy(html);
    assert.ok(csp.includes(`script-src 'self' 'sha256-${hash}'`));
    assert.equal(csp.match(/sha256-/g).length, 1);
  });

  it("serves the theme chosen for the visitor without client-side swapping", async () => {
    const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const indexBody = indexHtml.slice(indexHtml.indexOf("<body"));

    const fresh = await fetch(`${baseUrl}/`);
    const setCookie = fresh.headers.get("set-cookie");
    assert.match(setCookie, /^kost-variant=(index|[2-6])\.html; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax$/);
    assert.equal(fresh.headers.get("vary"), "Accept-Encoding, Cookie");
    assert.equal(fresh.headers.get("cache-control"), "private, no-cache");
    await fresh.arrayBuffer();

    const secure = await fetch(`${baseUrl}/`, { headers: { "X-Forwarded-Proto": "https" } });
    assert.match(secure.headers.get("set-cookie"), /; Secure$/);
    await secure.arrayBuffer();

    for (const variant of ["index.html", "2.html", "3.html", "4.html", "5.html", "6.html"]) {
      const response = await fetch(`${baseUrl}/`, { headers: { Cookie: `kost-variant=${variant}` } });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("set-cookie"), null, variant);
      assert.ok(html.includes(`<html lang="id" data-variant="${variant}">`), variant);
      assert.ok(!html.includes("kost-tiga-a-page-variant"), variant);
      assert.equal(html.slice(html.indexOf("<body")), indexBody, variant);
      assert.ok(html.includes("application/ld+json"), variant);

      const source = await readFile(new URL(`../${variant}`, import.meta.url), "utf8");
      const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)[1];
      assert.ok(html.includes(style), variant);
      assert.ok(html.includes(/<meta name="theme-color" content="[^"]*">/.exec(source)[0]), variant);
      for (const font of source.match(/<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)) {
        assert.ok(html.includes(font), variant);
      }
      assert.equal(html.match(/fonts\.googleapis\.com\/css2/g).length, source.match(/fonts\.googleapis\.com\/css2/g).length);
    }

    const invalid = await fetch(`${baseUrl}/`, { headers: { Cookie: "kost-variant=../server.js" } });
    assert.match(invalid.headers.get("set-cookie"), /^kost-variant=(index|[2-6])\.html;/);
    await invalid.arrayBuffer();
  });

  it("revalidates and compresses the themed homepage per visitor", async () => {
    const cookie = { Cookie: "kost-variant=4.html" };
    const first = await fetch(`${baseUrl}/index.html`, { headers: { ...cookie, "Accept-Encoding": "br" } });
    assert.equal(first.headers.get("content-encoding"), "br");
    const etag = first.headers.get("etag");
    assert.match(await first.text(), /data-variant="4\.html"/);

    const cached = await fetch(`${baseUrl}/`, { headers: { ...cookie, "If-None-Match": etag } });
    assert.equal(cached.status, 304);

    const other = await fetch(`${baseUrl}/`, { headers: { Cookie: "kost-variant=5.html", "If-None-Match": etag } });
    assert.equal(other.status, 200);
    await other.arrayBuffer();

    const head = await fetch(`${baseUrl}/`, { method: "HEAD", headers: cookie });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    assert.equal((await fetch(`${baseUrl}/`, { method: "POST" })).status, 405);
  });

  it("keeps print pages working without CSP and covers error responses", async () => {
    const poster = await fetch(`${baseUrl}/poster.html`);
    assert.equal(poster.headers.get("content-security-policy"), null);
    assert.equal(poster.headers.get("x-frame-options"), "SAMEORIGIN");
    await poster.arrayBuffer();

    const missing = await fetch(`${baseUrl}/missing.html`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("x-frame-options"), "SAMEORIGIN");
  });

  it("records valid WhatsApp clicks and rejects invalid ones", async () => {
    const ok = await postClick({ target: "alya", page: "3.html", slot: "mobile-bar" });
    assert.equal(ok.status, 204);

    const sameOrigin = await postClick(
      { target: "athaya", page: "index.html", slot: "kontak" },
      { Origin: baseUrl },
    );
    assert.equal(sameOrigin.status, 204);

    const lines = (await readFile(path.join(dataDir, "clicks.jsonl"), "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    const entry = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(entry).sort(), ["page", "slot", "target", "ts"]);
    assert.equal(entry.target, "alya");

    const invalid = [
      { target: "other", page: "index.html", slot: "kontak" },
      { target: "alya", page: "../etc/passwd", slot: "kontak" },
      { target: "alya", page: "index.html", slot: "<script>" },
      { target: "alya", page: "index.html" },
    ];
    for (const body of invalid) {
      assert.equal((await postClick(body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await postClick("not json")).status, 400);

    const foreign = await postClick(
      { target: "alya", page: "index.html", slot: "kontak" },
      { Origin: "https://evil.example" },
    );
    assert.equal(foreign.status, 403);

    const tooLarge = await postClick({ target: "alya", page: "index.html", slot: "kontak", pad: "x".repeat(2000) }).catch(
      () => ({ status: 413 }),
    );
    assert.equal(tooLarge.status, 413);

    const wrongMethod = await fetch(`${baseUrl}/api/click`);
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");

    const finalLines = (await readFile(path.join(dataDir, "clicks.jsonl"), "utf8")).trim().split("\n");
    assert.equal(finalLines.length, 2);
  });

  it("limits click submissions per minute", async () => {
    let limited = 0;
    for (let i = 0; i < 130; i += 1) {
      const response = await postClick({ target: "athaya", page: "2.html", slot: "pilihan" });
      if (response.status === 429) limited += 1;
    }
    assert.ok(limited > 0);
  });

  it("reports room availability from the CLI and ignores bad data", async () => {
    const empty = await fetch(`${baseUrl}/api/rooms`);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), {});

    const env = { ...process.env, DATA_DIR: dataDir };
    const script = fileURLToPath(new URL("../scripts/rooms.js", import.meta.url));
    await execFileAsync(process.execPath, [script, "alya", "ac", "2"], { env });
    await execFileAsync(process.execPath, [script, "alya", "nonac", "0"], { env });
    await execFileAsync(process.execPath, [script, "athaya", "ac", "1"], { env });
    await assert.rejects(execFileAsync(process.execPath, [script, "alya", "ac", "-1"], { env }));
    await assert.rejects(execFileAsync(process.execPath, [script, "alya", "2"], { env }));
    await assert.rejects(execFileAsync(process.execPath, [script, "other", "ac", "1"], { env }));

    const response = await fetch(`${baseUrl}/api/rooms`);
    const rooms = await response.json();
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.deepEqual({ alya: rooms.alya, athaya: rooms.athaya }, { alya: { ac: 2, nonac: 0 }, athaya: { ac: 1 } });
    assert.ok(!Number.isNaN(Date.parse(rooms.updatedAt)));

    await writeFile(
      path.join(dataDir, "rooms.json"),
      JSON.stringify({ alya: { ac: "x", nonac: -3 }, athaya: { ac: 500, available: 4 } }),
    );
    assert.deepEqual(await (await fetch(`${baseUrl}/api/rooms`)).json(), {});

    assert.equal((await fetch(`${baseUrl}/api/rooms`, { method: "POST" })).status, 405);
    await rm(path.join(dataDir, "rooms.json"));
  });

  it("summarizes clicks per day in WIB and ignores malformed lines", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const text = [
      JSON.stringify({ ts: "2026-10-25T09:00:00Z", target: "alya", page: "2.html", slot: "hero" }),
      JSON.stringify({ ts: "2026-10-24T05:00:00Z", target: "alya", page: "2.html", slot: "hero" }),
      JSON.stringify({ ts: "2026-10-10T01:00:00Z", target: "athaya", page: "index.html", slot: "footer" }),
      "not json",
      JSON.stringify({ ts: "bad", target: "alya", page: "2.html", slot: "hero" }),
      "",
    ].join("\n");
    const summary = summarizeClicks(text, now);
    assert.equal(summary.total, 3);
    assert.equal(summary.today, 1);
    assert.equal(summary.last7, 2);
    assert.deepEqual(summary.days, { "2026-10-25": 1, "2026-10-24": 1, "2026-10-10": 1 });
    assert.deepEqual(summary.target, { alya: 2, athaya: 1 });
  });

  it("serves the stats dashboard only with the admin secret", async () => {
    const secret = "s3cret-value";
    const statsDir = await mkdtemp(path.join(tmpdir(), "kost-stats-"));
    const statsServer = createServer({ dataDir: statsDir, adminSecret: secret });
    await new Promise((resolve) => statsServer.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${statsServer.address().port}/admin/stats`;
    try {
      await writeFile(
        path.join(statsDir, "clicks.jsonl"),
        `${JSON.stringify({ ts: new Date().toISOString(), target: "alya", page: "2.html", slot: "<b>x</b>" })}\n`,
      );
      await writeFile(path.join(statsDir, "visitors.json"), JSON.stringify({ count: 77 }));

      assert.equal((await fetch(url)).status, 404);
      assert.equal((await fetch(url, { headers: { "X-Admin-Secret": "wrong" } })).status, 404);

      const ok = await fetch(url, { headers: { "X-Admin-Secret": secret } });
      const html = await ok.text();
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("cache-control"), "no-store");
      assert.match(html, /<strong>77<\/strong>Pengunjung unik/);
      assert.match(html, /<strong>1<\/strong>Total klik WhatsApp/);
      assert.ok(!html.includes("<b>x</b>"));
      assert.equal((await fetch(url, { method: "POST", headers: { "X-Admin-Secret": secret } })).status, 405);
    } finally {
      await new Promise((resolve) => statsServer.close(resolve));
      await rm(statsDir, { recursive: true, force: true });
    }

    assert.equal((await fetch(`${baseUrl}/admin/stats`, { headers: { "X-Admin-Secret": "" } })).status, 404);
  });

  it("does not expose the data and scripts directories", async () => {
    for (const route of ["/data/clicks.jsonl", "/scripts/clicks.js"]) {
      assert.equal((await fetch(`${baseUrl}${route}`)).status, 404, route);
    }
    const tracker = await fetch(`${baseUrl}/wa-track.js`);
    assert.equal(tracker.status, 200);
    await tracker.arrayBuffer();
  });

  it("counts unique visitors, persists the count, and rejects bad requests", async () => {
    const initial = await (await fetch(`${baseUrl}/api/visitors`)).json();
    assert.equal(initial.value, 0);

    const hits = await Promise.all(
      Array.from({ length: 10 }, () => fetch(`${baseUrl}/api/visitors`, { method: "POST" }).then((r) => r.json())),
    );
    assert.deepEqual(hits.map((h) => h.value).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const read = await fetch(`${baseUrl}/api/visitors`);
    assert.equal(read.headers.get("cache-control"), "no-store");
    assert.equal((await read.json()).value, 10);

    const foreign = await fetch(`${baseUrl}/api/visitors`, { method: "POST", headers: { Origin: "https://evil.example" } });
    assert.equal(foreign.status, 403);
    assert.equal((await fetch(`${baseUrl}/api/visitors`, { method: "DELETE" })).status, 405);

    const restarted = createServer({ dataDir });
    await new Promise((resolve) => restarted.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${restarted.address().port}/api/visitors`;
      assert.equal((await (await fetch(url)).json()).value, 10);
      assert.equal((await (await fetch(url, { method: "POST" })).json()).value, 11);
    } finally {
      await new Promise((resolve) => restarted.close(resolve));
    }

    let limited = 0;
    for (let i = 0; i < 70; i += 1) {
      if ((await fetch(`${baseUrl}/api/visitors`, { method: "POST" })).status === 429) limited += 1;
    }
    assert.ok(limited > 0);
  });

  it("returns explicit errors for missing files and unsupported methods", async () => {
    const missingResponse = await fetch(`${baseUrl}/missing.html`);
    assert.equal(missingResponse.status, 404);

    const methodResponse = await fetch(baseUrl, { method: "POST" });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get("allow"), "GET, HEAD");
  });
});
