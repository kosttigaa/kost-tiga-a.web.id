import assert from "node:assert/strict";
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

  it("returns explicit errors for missing files and unsupported methods", async () => {
    const missingResponse = await fetch(`${baseUrl}/missing.html`);
    assert.equal(missingResponse.status, 404);

    const methodResponse = await fetch(baseUrl, { method: "POST" });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get("allow"), "GET, HEAD");
  });
});
