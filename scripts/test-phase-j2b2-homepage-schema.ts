import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveHomepageOwnerPresentation,
  validateHomepageCms,
// @ts-expect-error -- Node's type-stripping runtime needs the explicit TypeScript extension.
} from "../lib/homepageCms.ts";

const productionText = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");
const production = JSON.parse(productionText);
assert.equal(validateHomepageCms(structuredClone(production)), true, "legacy homepage remains valid");
assert.deepEqual(resolveHomepageOwnerPresentation(production), {}, "legacy homepage has no synthetic visual/SEO defaults");

const fixture = structuredClone(production);
fixture.visual = {
  colors: { pageBackground: "#15110f", primaryText: "ink", accent: "gold", border: "#eae8e7" },
  heroOverlayPreset: "soft",
  cardPresentationPreset: "bordered",
};
fixture.seo = {
  title: "KD Coffee 精品咖啡",
  description: "從風味、作品與烘焙方式認識 KD Coffee。",
  shareImage: { media: { type: "image", provider: "local", url: "/images/home-share.webp" }, alt: "KD Coffee 首頁分享圖片" },
};
assert.equal(validateHomepageCms(fixture), true, "safe visual and SEO schema validates");
assert.deepEqual(resolveHomepageOwnerPresentation(fixture), { visual: fixture.visual, seo: fixture.seo }, "owner presentation resolves without changing values");

for (const color of ["red", "#fff", "url(javascript:alert(1))", "#12345g"]) {
  const invalid = structuredClone(production); invalid.visual = { colors: { accent: color } };
  assert.throws(() => validateHomepageCms(invalid), /顏色不安全/u, `unsafe color rejected: ${color}`);
}
for (const preset of ["blur-everything", "raw-css"]) {
  const invalid = structuredClone(production); invalid.visual = { heroOverlayPreset: preset };
  assert.throws(() => validateHomepageCms(invalid), /遮罩樣式不支援/u, "unsafe overlay preset rejected");
}
{
  const invalid = structuredClone(production); invalid.visual = { rawCss: "body{display:none}" };
  assert.throws(() => validateHomepageCms(invalid), /不支援的欄位/u, "raw CSS field rejected");
}
{
  const invalid = structuredClone(production); invalid.seo = { title: "x".repeat(71) };
  assert.throws(() => validateHomepageCms(invalid), /SEO 標題/u, "SEO title length enforced");
}
{
  const invalid = structuredClone(production); invalid.seo = { description: "x".repeat(181) };
  assert.throws(() => validateHomepageCms(invalid), /SEO 說明/u, "SEO description length enforced");
}
for (const media of [
  { type: "video", provider: "local", url: "/videos/share.mp4" },
  { type: "image", provider: "local", url: "http://example.com/share.jpg" },
  { type: "image", provider: "local", url: "/../secret.jpg" },
]) {
  const invalid = structuredClone(production); invalid.seo = { shareImage: { media, alt: "share" } };
  assert.throws(() => validateHomepageCms(invalid), /分享圖片/u, "unsafe/non-image SEO media rejected");
}
{
  const invalid = structuredClone(production); invalid.seo = { shareImage: { media: { type: "image", provider: "local", url: "/images/share.webp" }, alt: "" } };
  assert.throws(() => validateHomepageCms(invalid), /替代文字/u, "share image alt is required");
}

const productionAfter = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");
assert.equal(productionAfter, productionText, "production homepage JSON remains byte-identical");
console.log("PHASE J.2B.2 Homepage schema assertions: 14 PASS");
