// Run against a local production server: npm run check:og -- http://127.0.0.1:3205
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3205");
const sitemap = await fetch(new URL("/sitemap.xml", base));
assert.equal(sitemap.status, 200);
const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)];
assert.ok(urls.length > 0, "Sitemap contains pages");
const pages = [
  ...new Set([...urls.map(([, url]) => new URL(url).pathname), "/irl"]),
];
const defaults = new Set(["/pricing", "/changelog", "/privacy", "/terms"]);

for (const page of pages) {
  const response = await fetch(new URL(page, base), {
    headers: { "user-agent": "Twitterbot/1.0" },
    redirect: "manual",
  });
  if (page === "/irl") {
    assert.equal(response.status, 307, "Inactive IRL page redirects");
    assert.equal(new URL(response.headers.get("location"), base).pathname, "/");
    const image = await fetch(new URL("/irl-og.png", base));
    assert.equal(image.status, 200);
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.ok(
      bytes.equals(await readFile("public/irl-og.png")),
      "Custom IRL image unchanged",
    );
    console.info("/irl: redirect and original custom PNG pass");
    continue;
  }
  assert.equal(response.status, 200, page);
  const html = await response.text();
  const tags = [...html.matchAll(/<meta\s[^>]*>/g)].map(([tag]) => ({
    key: tag.match(/(?:property|name)="([^"]+)"/)?.[1],
    content: tag.match(/content="([^"]*)"/)?.[1]?.replaceAll("&amp;", "&"),
  }));
  const og = tags.filter((tag) => tag.key === "og:image");
  const twitter = tags.filter((tag) => tag.key === "twitter:image");
  assert.equal(og.length, 1, `${page}: one OG image`);
  assert.equal(twitter.length, 1, `${page}: one Twitter image`);
  assert.equal(
    og[0].content,
    twitter[0].content,
    `${page}: matching social images`,
  );

  const image = new URL(og[0].content, base);
  if (page === "/") {
    assert.match(image.pathname, /^\/opengraph-image(?:-[\w]+)?$/);
  } else {
    assert.equal(
      image.pathname,
      defaults.has(page) ? "/opengraph-image" : `${page}/opengraph-image`,
    );
  }
  const result = await fetch(new URL(image.pathname + image.search, base));
  assert.equal(result.status, 200, `${page}: image response`);
  assert.match(result.headers.get("content-type") ?? "", /^image\/png/);
  const png = Buffer.from(await result.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  console.info(`${page}: metadata and 1200x630 PNG pass`);
}
console.info(`Checked ${pages.length} pages, including preserved IRL.`);
