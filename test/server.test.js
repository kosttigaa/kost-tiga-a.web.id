import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createServer } from "../server.js";

describe("static website server", () => {
  const server = createServer();
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

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

  it("returns explicit errors for missing files and unsupported methods", async () => {
    const missingResponse = await fetch(`${baseUrl}/missing.html`);
    assert.equal(missingResponse.status, 404);

    const methodResponse = await fetch(baseUrl, { method: "POST" });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get("allow"), "GET, HEAD");
  });
});
