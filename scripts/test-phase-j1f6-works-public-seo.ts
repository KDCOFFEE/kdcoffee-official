import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
// @ts-expect-error explicit extension for Node strip-types test.
import { DEFAULT_WORKS_PAGE_CMS_CONFIG, resolveWorksPageCms, validateWorksPageCms } from "../lib/worksPageCms.ts";

let passed = 0;
const check = (name: string, condition: unknown) => { assert.ok(condition, name); passed += 1; console.log(`PASS ${passed}: ${name}`); };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const files = {
  page: path.join(process.cwd(), "app", "works", "page.tsx"),
  admin: path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"),
  website: path.join(process.cwd(), "public", "data", "website-data.json"),
  assets: path.join(process.cwd(), "public", "data", "assets.json"),
  homepage: path.join(process.cwd(), "public", "data", "homepage.json"),
  monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"),
};
const protectedKeys = ["pages", "website", "assets", "homepage", "monthly"] as const;
const before = Object.fromEntries(await Promise.all(protectedKeys.map(async key => [key, hash(await readFile(files[key]))]))) as Record<string,string>;

const fallback = resolveWorksPageCms(undefined, { monthLabel: "九月", intro: "豆單" });
check("legacy Works SEO title remains unchanged", fallback.seo.title === DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.title);
check("legacy Works SEO description remains unchanged", fallback.seo.description === DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.description);
const custom = resolveWorksPageCms({ schemaVersion: 1, seo: { title: "自訂 Works SEO", description: "自訂搜尋說明", shareImage: { media: { type: "image", url: "/uploads/share.webp" }, alt: "Works 分享圖" } } }, { monthLabel: "九月", intro: "豆單" });
check("saved SEO title and description resolve", custom.seo.title === "自訂 Works SEO" && custom.seo.description === "自訂搜尋說明");
check("safe image share reference resolves", custom.seo.shareImage?.media.url === "/uploads/share.webp" && custom.seo.shareImage.alt === "Works 分享圖");
const videoShare = resolveWorksPageCms({ schemaVersion: 1, seo: { shareImage: { media: { type: "video", url: "https://example.com/a.mp4" }, alt: "video" } } }, { monthLabel: "九月", intro: "豆單" });
check("video cannot resolve as SEO share image", videoShare.seo.shareImage === undefined);
let unsafeRejected = false;
try { validateWorksPageCms({ schemaVersion: 1, seo: { shareImage: { media: { type: "image", url: "javascript:alert(1)" }, alt: "bad" } } } as never); } catch { unsafeRejected = true; }
check("unsafe share image URL is rejected", unsafeRejected);

const page = await readFile(files.page, "utf8");
const admin = await readFile(files.admin, "utf8");
check("public /works uses dynamic generateMetadata from the same Works resolver", page.includes("export async function generateMetadata") && page.includes("resolveWorksPageCms(pageStore.systemPages?.works"));
check("metadata publishes title description canonical and Open Graph", page.includes('alternates: { canonical: "/works" }') && page.includes("openGraph:") && page.includes("title: { absolute: seoTitle }") && page.includes("title: seoTitle") && page.includes("description: seoDescription"));
check("share image feeds Open Graph and Twitter only when configured", page.includes("const image = works.seo.shareImage") && page.includes('card: image ? "summary_large_image" : "summary"') && page.includes("images: image ? [image.media.url] : undefined"));
check("blank saved title/description have safe public fallback", page.includes("works.seo.title.trim() || DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.title!") && page.includes("works.seo.description.trim() || DEFAULT_WORKS_PAGE_CMS_CONFIG.seo!.description!"));
check("Admin Works exposes dedicated SEO controls", admin.includes('["seo", "SEO"]') && admin.includes("SEO 與分享") && admin.includes("SEO 標題") && admin.includes("SEO 說明"));
check("Admin share image reuses Asset Library instead of a second media authority", admin.includes('setPickerFor("seoShareImage")') && admin.includes("<ImageLibraryPicker") && admin.includes("localImageMedia(asset.path)"));
check("SEO integration does not replace the accepted Hero motion runtime", page.includes("<WorksMotionRuntime") && page.includes("<WorksHeroMedia"));
check("SEO integration leaves canonical product listing authority intact", page.includes("resolveWorksProductListing(live.menu.products)") && page.includes("resolveListAsset(product)") && page.includes("ProductVisualMedia"));

const after = Object.fromEntries(await Promise.all(protectedKeys.map(async key => [key, hash(await readFile(files[key]))]))) as Record<string,string>;
check("automated SEO validation preserves Owner runtime JSON byte-identically", protectedKeys.every(key => before[key] === after[key]));
console.log(`Phase J.1F.6 public Works SEO: ${passed} PASS`);
