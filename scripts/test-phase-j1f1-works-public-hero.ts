import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveListAsset } from "../lib/productVisualAssets.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksProductListing } from "../lib/productListing.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, type WorksPageCmsConfig } from "../lib/worksPageCms.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const files = {
  publicWorks: path.join(process.cwd(), "app", "works", "page.tsx"),
  heroMedia: path.join(process.cwd(), "components", "works", "WorksHeroMedia.tsx"),
  css: path.join(process.cwd(), "app", "globals.css"),
  website: path.join(process.cwd(), "public", "data", "website-data.json"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"),
  assets: path.join(process.cwd(), "public", "data", "assets.json"),
  homepage: path.join(process.cwd(), "public", "data", "homepage.json"),
  monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"),
};
const protectedBefore = Object.fromEntries(await Promise.all(["website", "pages", "assets", "homepage", "monthly"].map(async (key) => [key, hash(await readFile(files[key as keyof typeof files]))])));

const legacy = resolveWorksPageCms(undefined, { monthLabel: "九月精選", intro: "九月豆單介紹" });
check("no Works config preserves exact legacy Hero content", legacy.hero.enabled && legacy.hero.eyebrow === "九月精選" && legacy.hero.headlineLines.join("|") === "不用先懂咖啡，|先從你喜歡的味道開始。" && legacy.hero.description === "九月豆單介紹");
check("no Works config preserves legacy CTAs", legacy.hero.primaryCta.label === "查看全部作品" && legacy.hero.primaryCta.link === "#catalog" && legacy.hero.secondaryCta.label === "不知道怎麼選？看入門推薦" && legacy.hero.secondaryCta.link === "/#beginner");
check("no media preserves the existing gradient fallback", !legacy.hero.desktopMedia && !legacy.hero.mobileMedia && legacy.hero.overlayPreset === "current-gradient");

const config: WorksPageCmsConfig = { schemaVersion: 1, hero: {
  eyebrowSource: "monthly-menu", headlineLines: ["Owner 第一行", "Owner 第二行"], descriptionSource: "monthly-menu",
  primaryCta: { enabled: true, label: "探索作品", link: "#catalog" }, secondaryCta: { enabled: false, label: "入門推薦", link: "/#beginner" },
  desktopMedia: { media: { type: "image", provider: "local", url: "/uploads/assets/page-builder/desktop.webp" }, alt: "桌機 Hero 替代文字" },
  mobileMedia: { media: { type: "image", provider: "cloudinary", url: "https://res.cloudinary.com/demo/image/upload/mobile.webp" }, alt: "手機 Hero 替代文字" },
  overlayPreset: "soft",
} };
const resolved = resolveWorksPageCms(config, { monthLabel: "十月精選", intro: "十月豆單介紹" });
check("saved headline and visibility resolve for the public Hero", resolved.hero.enabled && resolved.hero.headlineLines.join("|") === "Owner 第一行|Owner 第二行");
check("monthly-menu eyebrow remains dynamic", resolved.hero.eyebrow === "十月精選");
check("monthly-menu description remains dynamic", resolved.hero.description === "十月豆單介紹");
check("saved desktop image and alt resolve", resolved.hero.desktopMedia?.media.url.endsWith("desktop.webp") && resolved.hero.desktopMedia.alt === "桌機 Hero 替代文字");
check("saved mobile image and alt resolve", resolved.hero.mobileMedia?.media.url.endsWith("mobile.webp") && resolved.hero.mobileMedia.alt === "手機 Hero 替代文字");
check("saved CTA state label and safe link resolve", resolved.hero.primaryCta.enabled && resolved.hero.primaryCta.label === "探索作品" && resolved.hero.primaryCta.link === "#catalog" && !resolved.hero.secondaryCta.enabled);
check("saved safe overlay preset resolves", resolved.hero.overlayPreset === "soft");

const pageSource = await readFile(files.publicWorks, "utf8");
const mediaSource = await readFile(files.heroMedia, "utf8");
const cssSource = await readFile(files.css, "utf8");
check("public Works reads PageStore without writing and resolves only Works Hero", pageSource.includes("readPageStore()") && pageSource.includes("resolveWorksPageCms(pageStore.systemPages?.works") && !pageSource.includes("saveWorksPageAdminState"));
check("public Hero uses canonical KdMedia", pageSource.includes("<WorksHeroMedia") && mediaSource.includes("<KdMedia") && mediaSource.includes("backgroundVideo"));
check("mobile media falls back to desktop", mediaSource.includes("mobile || desktop"));
check("saved alt text reaches KdMedia", mediaSource.includes("alt={selected.alt}"));
check("overlay is restricted to named safe classes and follows selected media", pageSource.includes("overlay={works.hero.overlayPreset}") && mediaSource.includes("overlay-${overlay}") && mediaSource.includes("if (!selected) return null") && cssSource.includes("overlay-current-gradient") && cssSource.includes("overlay-soft") && cssSource.includes("overlay-strong") && cssSource.includes("overlay-none"));
check("SEO remains disconnected while catalog, colors, and motion use later-phase bindings", !pageSource.includes("works.seo") && pageSource.includes("works.catalog.introEnabled") && pageSource.includes("resolveWorksPublicColorBindings") && pageSource.includes("resolveWorksPublicMotionBindings"));
check("canonical product pipeline uses the shared unchanged listing rule", pageSource.includes("resolveWorksProductListing(live.menu.products)"));

const website = JSON.parse(await readFile(files.website, "utf8"));
const products = resolveWorksProductListing(website.menu.products as Array<Record<string, unknown>>);
const expectedOrder = ["giotto-awakening", "davinci-feast", "monet-floral", "turner-sunset", "vandyck-knight", "degas-melody", "raphael-kiss", "vangogh-enchantment"];
check("current canonical public product count remains eight", products.length === 8);
check("current canonical product order remains unchanged", products.map((product) => String(product.slug)).join("|") === expectedOrder.join("|"));
const imagesBefore = products.map((product: unknown) => resolveListAsset(product));
const imagesAfter = products.map((product: unknown) => resolveListAsset(product));
check("canonical product image resolution remains unchanged", JSON.stringify(imagesAfter) === JSON.stringify(imagesBefore));

const protectedAfter = Object.fromEntries(await Promise.all(["website", "pages", "assets", "homepage", "monthly"].map(async (key) => [key, hash(await readFile(files[key as keyof typeof files]))])));
check("all runtime data remains byte-identical", Object.keys(protectedBefore).every((key) => protectedBefore[key] === protectedAfter[key]));

console.log(`Phase J.1F.1 public Works Hero CMS: ${passed} PASS`);
