import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WEBSITE_VISUAL_STYLE } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { readWorksPageAdminState, saveWorksPageAdminState, WorksPageVersionConflictError } from "../lib/worksPageAdminStore.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, validateWorksPageCms, type WorksPageCmsConfig } from "../lib/worksPageCms.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name); passed += 1; console.log(`PASS ${passed}: ${name}`);
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));

const originalDataDir = process.env.KD_DATA_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-j1d-works-editor-"));
const storeDir = path.join(root, "store");
await mkdir(storeDir, { recursive: true });
process.env.KD_DATA_DIR = root;

const files = {
  pages: path.join(storeDir, "pages.json"),
  website: path.join(storeDir, "website-data.json"),
  homepage: path.join(storeDir, "homepage.json"),
  assets: path.join(storeDir, "assets.json"),
  monthly: path.join(storeDir, "monthly-menus.json"),
};
const publicSources = {
  works: path.join(process.cwd(), "app", "works", "page.tsx"),
  css: path.join(process.cwd(), "app", "globals.css"),
};
const page = {
  id: "page-abcdef", slug: "campaign-safe", type: "campaign" as const, status: "published" as const,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  draft: { title: "安全活動頁", seoTitle: "", seoDescription: "", sections: [] },
  publishedSnapshot: { title: "安全活動頁", seoTitle: "", seoDescription: "", sections: [] },
};
const assetA = { id: "asset-hero-a", category: "page-builder", name: "Hero A", usage: "Hero", path: "/uploads/assets/page-builder/hero-a.webp", recommendedSize: "1600x900", displaySize: "1600x900", format: "webp", alt: "咖啡 Hero A", seoStem: "hero-a", status: "active" as const };
const assetB = { ...assetA, id: "asset-hero-b", name: "Hero B", path: "/uploads/assets/page-builder/hero-b.webp", alt: "咖啡 Hero B", seoStem: "hero-b" };
const website = { menu: { monthLabel: "九月精選", intro: "九月豆單說明", products: [{ slug: "coffee-one", name: "咖啡一號", active: true, listAsset: { url: "/product.webp" }, price: 500, stock: 9 }] } };
const initialStore = { version: 21, updatedAt: "2026-09-01T00:00:00.000Z", visualStyle: DEFAULT_WEBSITE_VISUAL_STYLE, pages: [page], systemPages: { anotherSystemPage: { retained: true } }, unrelated: { retained: true } };

try {
  await writeFile(files.pages, `${JSON.stringify(initialStore, null, 2)}\n`);
  await writeFile(files.website, `${JSON.stringify(website, null, 2)}\n`);
  await writeFile(files.homepage, "{\"protectedHomepage\":true}\n");
  await writeFile(files.assets, `${JSON.stringify({ version: 4, updatedAt: "2026-09-01T00:00:00.000Z", assets: [assetA, assetB] }, null, 2)}\n`);
  await writeFile(files.monthly, "{\"protectedMonthlyMenus\":true}\n");

  const sourceBefore = { works: hash(await readFile(publicSources.works)), css: hash(await readFile(publicSources.css)) };
  const getBefore = await readFile(files.pages, "utf8");
  const initial = await readWorksPageAdminState();
  check("GET remains write-free", await readFile(files.pages, "utf8") === getBefore);
  check("GET exposes active canonical Asset Library media", initial.assets.length === 2 && initial.assets[0].path === assetA.path);
  check("GET exposes safe Smart Link product summaries without commerce authority", initial.products.length === 1 && initial.products[0].slug === "coffee-one" && !("price" in initial.products[0]));
  check("GET exposes published Page Builder destinations", initial.publishedPages.length === 1 && initial.publishedPages[0].href === "/pages/campaign-safe");

  const fullConfig: WorksPageCmsConfig = {
    schemaVersion: 1 as const,
    hero: {
      enabled: false,
      eyebrowSource: "custom" as const,
      customEyebrow: "Owner 精選",
      headlineLines: ["Owner 第一行", "Owner 第二行"] as [string, string],
      descriptionSource: "custom" as const,
      customDescription: "Owner 首屏說明",
      primaryCta: { enabled: true, label: "看作品", link: "#catalog" },
      secondaryCta: { enabled: false, label: "入門推薦", link: "/#beginner" },
      desktopMedia: { media: { type: "image" as const, provider: "local" as const, url: assetA.path }, alt: "桌機首屏咖啡" },
      mobileMedia: { media: { type: "video" as const, provider: "cloudinary" as const, url: "https://res.cloudinary.com/demo/video/upload/hero.mp4", publicId: "kd-coffee/videos/hero" }, alt: "手機首屏咖啡影片" },
      overlayPreset: "strong" as const,
    },
    catalog: {
      introEnabled: false, countPrefix: "共有", countSuffix: "款作品", helperText: "Owner 列表說明", emptyStateText: "目前沒有作品",
      presentation: { showIndex: false, showArtist: false, showTag: true, showFlavors: true, showFacts: false, showCommerceSummary: true, cardPreset: "bordered" as const },
    },
  };
  check("complete J.1D Works configuration validates", validateWorksPageCms(fullConfig));
  const saved = await saveWorksPageAdminState({ version: 21, works: fullConfig, now: new Date("2026-09-01T02:00:00.000Z") });
  check("Hero visibility persists", saved.savedConfig?.hero?.enabled === false);
  check("custom eyebrow persists", saved.resolved.hero.eyebrow === "Owner 精選");
  check("custom description persists", saved.resolved.hero.description === "Owner 首屏說明");
  check("both headline lines persist", saved.resolved.hero.headlineLines.join("|") === "Owner 第一行|Owner 第二行");
  check("primary CTA visibility label and #catalog persist", saved.resolved.hero.primaryCta.enabled && saved.resolved.hero.primaryCta.label === "看作品" && saved.resolved.hero.primaryCta.link === "#catalog");
  check("secondary CTA visibility label and /#beginner persist", !saved.resolved.hero.secondaryCta.enabled && saved.resolved.hero.secondaryCta.link === "/#beginner");
  check("catalog content persists", !saved.resolved.catalog.introEnabled && saved.resolved.catalog.countPrefix === "共有" && saved.resolved.catalog.countSuffix === "款作品" && saved.resolved.catalog.helperText === "Owner 列表說明" && saved.resolved.catalog.emptyStateText === "目前沒有作品");
  check("card presentation toggles persist", !saved.resolved.catalog.presentation.showIndex && !saved.resolved.catalog.presentation.showArtist && !saved.resolved.catalog.presentation.showFacts && saved.resolved.catalog.presentation.cardPreset === "bordered");
  check("desktop Hero media and alt text persist", saved.resolved.hero.desktopMedia?.media.url === assetA.path && saved.resolved.hero.desktopMedia.alt === "桌機首屏咖啡");
  check("mobile Hero media and alt text persist", saved.resolved.hero.mobileMedia?.media.type === "video" && saved.resolved.hero.mobileMedia.alt === "手機首屏咖啡影片");
  check("safe Hero overlay preset persists", saved.resolved.hero.overlayPreset === "strong");

  const storedAfterFullSave = await readJson(files.pages);
  check("save only adds systemPages.works plus store metadata", storedAfterFullSave.systemPages.works.hero.customEyebrow === "Owner 精選" && storedAfterFullSave.systemPages.anotherSystemPage.retained && storedAfterFullSave.unrelated.retained);
  check("existing campaign pages remain logically unchanged", JSON.stringify(storedAfterFullSave.pages) === JSON.stringify(initialStore.pages));
  check("existing visual style remains logically unchanged", JSON.stringify(storedAfterFullSave.visualStyle) === JSON.stringify(initialStore.visualStyle));

  const monthlyConfig = structuredClone(fullConfig);
  monthlyConfig.hero!.eyebrowSource = "monthly-menu";
  monthlyConfig.hero!.descriptionSource = "monthly-menu";
  monthlyConfig.hero!.customEyebrow = "不應顯示的舊小標";
  monthlyConfig.hero!.customDescription = "不應顯示的舊說明";
  await saveWorksPageAdminState({ version: 22, works: monthlyConfig, now: new Date("2026-09-01T02:01:00.000Z") });
  website.menu.monthLabel = "十月精選"; website.menu.intro = "十月豆單說明";
  await writeFile(files.website, `${JSON.stringify(website, null, 2)}\n`);
  const dynamic = await readWorksPageAdminState();
  check("monthly-menu eyebrow remains live and dynamic", dynamic.resolved.hero.eyebrow === "十月精選");
  check("monthly-menu description remains live and dynamic", dynamic.resolved.hero.description === "十月豆單說明");
  check("monthly-menu mode does not promote stale custom copy", dynamic.resolved.hero.eyebrow !== monthlyConfig.hero!.customEyebrow && dynamic.resolved.hero.description !== monthlyConfig.hero!.customDescription);

  let unsafeRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, hero: { primaryCta: { label: "危險", link: "javascript:alert(1)" } } }); } catch { unsafeRejected = true; }
  check("unsafe CTA links are rejected", unsafeRejected);
  check("legacy #catalog and /#beginner links remain valid", validateWorksPageCms({ schemaVersion: 1, hero: { primaryCta: { label: "作品", link: "#catalog" }, secondaryCta: { label: "入門", link: "/#beginner" } } }));
  let invalidMediaRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, hero: { desktopMedia: { media: { type: "image", url: "javascript:bad" }, alt: "" } } }); } catch { invalidMediaRejected = true; }
  check("invalid media and missing image alt text are rejected", invalidMediaRejected);
  let productCountRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, catalog: { productCount: 99 } }); } catch { productCountRejected = true; }
  check("Owner cannot configure the system-generated product count", productCountRejected);

  const assetsBeforeReferences = hash(await readFile(files.assets));
  const withoutMedia = structuredClone(monthlyConfig);
  delete withoutMedia.hero!.desktopMedia; delete withoutMedia.hero!.mobileMedia;
  await saveWorksPageAdminState({ version: 23, works: withoutMedia, now: new Date("2026-09-01T02:02:00.000Z") });
  check("removing Works media references does not delete Asset Library media", hash(await readFile(files.assets)) === assetsBeforeReferences && (await readJson(files.assets)).assets.length === 2);
  const replacement = structuredClone(withoutMedia);
  replacement.hero!.desktopMedia = { media: { type: "image", provider: "local", url: assetB.path }, alt: "替換桌機圖片" };
  await saveWorksPageAdminState({ version: 24, works: replacement, now: new Date("2026-09-01T02:03:00.000Z") });
  check("replacing Works media keeps the old canonical asset", hash(await readFile(files.assets)) === assetsBeforeReferences && (await readJson(files.assets)).assets.some((asset: { id: string }) => asset.id === assetA.id));
  const noMobile = resolveWorksPageCms(replacement, { monthLabel: "十月精選", intro: "十月豆單說明" });
  check("mobile override can remain absent without storing a duplicate desktop reference", noMobile.hero.mobileMedia === undefined && noMobile.hero.desktopMedia?.media.url === assetB.path);

  let conflict: unknown;
  try { await saveWorksPageAdminState({ version: 24, works: fullConfig }); } catch (error) { conflict = error; }
  check("version conflict protection remains active", conflict instanceof WorksPageVersionConflictError);
  check("conflict does not overwrite the latest media reference", (await readJson(files.pages)).systemPages.works.hero.desktopMedia.media.url === assetB.path);

  const managerSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx"), "utf8");
  const previewSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPagePreview.tsx"), "utf8");
  const worksCmsSource = await readFile(path.join(process.cwd(), "lib", "worksPageCms.ts"), "utf8");
  const pickerSource = await readFile(path.join(process.cwd(), "components", "admin", "ImageLibraryPicker.tsx"), "utf8");
  const pageBuilderSource = await readFile(path.join(process.cwd(), "components", "admin", "PageBuilderManager.tsx"), "utf8");
  const uploaderSource = await readFile(path.join(process.cwd(), "components", "admin", "MediaUploader.tsx"), "utf8");
  check("Works editor reuses the canonical Smart Link picker", managerSource.includes("<SmartLinkPicker") && managerSource.includes("SmartLinkEditingProvider"));
  check("Works editor reuses the canonical MediaUploader", managerSource.includes("<MediaUploader") && managerSource.includes('usage="hero"'));
  check("new image upload reuses Page Builder Asset Library registration", managerSource.includes('fetch("/api/admin/pages/images"') && uploaderSource.includes("/api/admin/media/sign") && uploaderSource.includes("/api/admin/media/finalize"));
  check("Asset picker is a shared component rather than a second media authority", managerSource.includes("ImageLibraryPicker") && pageBuilderSource.includes("ImageLibraryPicker") && pickerSource.includes("AssetRecord"));
  check("media removal wording guarantees reference-only behavior", managerSource.includes("只解除 Works 頁面引用") && managerSource.includes("不會被刪除"));
  check("visual preview resolves unsaved draft state", managerSource.includes("resolveWorksPageCms(draft, payload.live)") && managerSource.includes("useMemo"));
  check("desktop preview mode is implemented", previewSource.includes("▰ 桌機") && previewSource.includes('onDevice("desktop")'));
  check("mobile preview mode and desktop-media fallback are implemented", previewSource.includes("resolveWorksPagePreviewMedia") && previewSource.includes("▯ 手機") && worksCmsSource.includes("hero?.mobileMedia || hero?.desktopMedia"));
  check("all new controls participate in one serialized dirty state", managerSource.includes("JSON.stringify(draft) !== baseline") && managerSource.includes("patchHero") && managerSource.includes("patchCatalog") && managerSource.includes("patchMedia"));
  check("explicit save and beforeunload protection remain", managerSource.includes("beforeunload") && managerSource.includes("儲存全部") && !managerSource.includes("autosave"));
  check("local restore requires confirmation and remains unsaved", managerSource.includes("恢復預設值") && managerSource.includes("尚未儲存") && managerSource.includes("confirm("));
  check("J.1D content and media foundation remains present after additive visual phases", managerSource.includes("patchHero") && managerSource.includes("patchMedia") && managerSource.includes("首屏素材"));
  check("product authority is explicitly routed to canonical product Admin", managerSource.includes("商品內容、排序、價格、庫存與卡片圖片") && managerSource.includes('href="/admin/products"'));

  check("isolated Homepage media data is untouched", await readFile(files.homepage, "utf8") === "{\"protectedHomepage\":true}\n");
  check("isolated monthly-menu store is untouched", await readFile(files.monthly, "utf8") === "{\"protectedMonthlyMenus\":true}\n");
  check("Product listAsset and commerce fields are untouched", JSON.stringify((await readJson(files.website)).menu.products) === JSON.stringify(website.menu.products));
  check("public Works source remains byte-identical", hash(await readFile(publicSources.works)) === sourceBefore.works);
  check("global CSS remains byte-identical", hash(await readFile(publicSources.css)) === sourceBefore.css);

  console.log(`Phase J.1D Works visual editor: ${passed} PASS`);
} finally {
  if (originalDataDir === undefined) delete process.env.KD_DATA_DIR;
  else process.env.KD_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
}
