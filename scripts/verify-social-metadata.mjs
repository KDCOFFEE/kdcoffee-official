import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Read-only HTTP acceptance against a running production build or dev server.
const local = process.argv[2] || "http://127.0.0.1:3101";
const outputDirectory = path.resolve(process.argv[3] || "qa-output/seo");
const relativeOutput = path.relative(path.resolve("qa-output"), outputDirectory);
assert.ok(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput), "Evidence must remain under qa-output");
assert.match(local, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
const production = "https://www.kdcoffee1962.com";
const paths = ["/", "/works", "/works/giotto-awakening", "/monthly-menu", "/gallery", "/gifts", "/store", "/customer-service"];
const agents = ["Mozilla/5.0", "facebookexternalhit/1.1", "Twitterbot/1.0", "Line/1.0"];
const evidence = [];
const images = new Set();
function tags(html) {
  const result = {};
  for (const tag of html.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const key = attrs.property || attrs.name || attrs.rel;
    if (key && /^(og:|twitter:|canonical|robots)/.test(key)) result[key] = attrs.content || attrs.href;
  }
  return result;
}
for (const path of paths) {
  let first;
  for (const agent of agents) {
    const response = await fetch(local + path + "?ref=ABC123&utm_source=seo-test", { headers: { "user-agent": agent } });
    assert.equal(response.status, 200, `${path} HTTP status`);
    const html = await response.text();
    const metadata = tags(html), head = tags(html.split("</head>")[0]);
    for (const key of ["og:title", "og:description", "og:url", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "canonical"]) {
      assert.ok(metadata[key], `${path} ${agent} ${key}`);
      // Social fetchers must discover images without executing JavaScript.
      if (agent !== "Mozilla/5.0") assert.ok(head[key], `${path} ${agent} head ${key}`);
    }
    assert.equal(new URL(metadata.canonical).href, production + path);
    assert.equal(new URL(metadata["og:url"]).href, production + path);
    assert.equal(metadata["og:image"], metadata["twitter:image"]);
    assert.equal(metadata["twitter:card"], "summary_large_image");
    assert.match(metadata["og:image"], /^https:\/\//);
    assert.ok(!/localhost|\.mp4(?:$|\?)|member-avatars|order-notifications/.test(metadata["og:image"]));
    if (first) assert.deepEqual(metadata, first, `${path} user-agent parity`);
    first = metadata;
    images.add(metadata["og:image"]);
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    if (path === "/" || path.startsWith("/works/")) assert.ok(jsonLd.length);
    evidence.push({ path, agent, status: response.status, metadata, jsonLd });
  }
}
const imageEvidence = [];
for (const image of images) {
  const source = new URL(image);
  const target = source.origin === production ? local + source.pathname : image;
  const response = await fetch(target, { headers: { "user-agent": "facebookexternalhit/1.1" } });
  assert.equal(response.status, 200, `image ${image}`);
  assert.equal(response.redirected, false, `image redirect ${image}`);
  assert.match(response.headers.get("content-type"), /^image\/(?:png|jpeg|webp)/);
  const details = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  imageEvidence.push({ image, checkedAt: target, status: response.status, contentType: response.headers.get("content-type"), width: details.width, height: details.height });
}
await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(path.join(outputDirectory, "rendered.json"), JSON.stringify({ server: local, pages: evidence, images: imageEvidence }, null, 2));
console.log(`Rendered SEO: ${evidence.length} page/user-agent responses PASS; ${imageEvidence.length} anonymous image responses PASS.`);
