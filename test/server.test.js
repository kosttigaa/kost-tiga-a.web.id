import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createServer } from "../server.js";

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
    const first = await fetch(`${baseUrl}/index.html`);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    assert.equal(first.headers.get("cache-control"), "no-cache");
    await first.arrayBuffer();

    const second = await fetch(`${baseUrl}/index.html`, { headers: { "If-None-Match": etag } });
    assert.equal(second.status, 304);
    assert.equal(second.headers.get("etag"), etag);
  });

  it("compresses text files and caches media for a week", async () => {
    for (const encoding of ["br", "gzip"]) {
      const response = await fetch(`${baseUrl}/index.html`, {
        headers: { "Accept-Encoding": encoding },
      });
      assert.equal(response.headers.get("content-encoding"), encoding);
      assert.equal(response.headers.get("vary"), "Accept-Encoding");
      assert.match(await response.text(), /Kost Tiga A/);
    }

    const plain = await fetch(`${baseUrl}/index.html`, { headers: { "Accept-Encoding": "identity" } });
    assert.equal(plain.headers.get("content-encoding"), null);
    await plain.arrayBuffer();

    const video = await fetch(`${baseUrl}/img/athaya%201.mp4`, { headers: { Range: "bytes=0-9" } });
    assert.equal(video.headers.get("cache-control"), "public, max-age=604800");
    assert.equal(video.headers.get("content-encoding"), null);
    await video.arrayBuffer();
  });

  it("sends security headers and a CSP that allows only the page's own inline script", async () => {
    const response = await fetch(`${baseUrl}/index.html`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    const html = await response.text();
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");

    const csp = response.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);

    const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const hash = createHash("sha256").update(inlineScript).digest("base64");
    assert.ok(csp.includes(`'sha256-${hash}'`));

    const plain = await fetch(`${baseUrl}/index.html`);
    assert.equal(plain.headers.get("strict-transport-security"), null);
    await plain.arrayBuffer();
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
