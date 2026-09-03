import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { hasLowContrast } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WEBSITE_VISUAL_STYLE } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { readWorksPageAdminState, saveWorksPageAdminState, WorksPageVersionConflictError } from "../lib/worksPageAdminStore.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksPageCms, validateWorksPageCms, type WorksPageCmsConfig } from "../lib/worksPageCms.ts";

let passed = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); passed += 1; console.log(`PASS ${passed}: ${name}`); }
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const originalDataDir = process.env.KD_DATA_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-j1e-works-style-"));
const storeDir = path.join(root, "store");
await mkdir(storeDir, { recursive: true });
process.env.KD_DATA_DIR = root;
const dataFiles = {
  pages: path.join(storeDir, "pages.json"), website: path.join(storeDir, "website-data.json"), homepage: path.join(storeDir, "homepage.json"), assets: path.join(storeDir, "assets.json"), monthly: path.join(storeDir, "monthly-menus.json"),
};
const protectedSources = {
  works: path.join(process.cwd(), "app", "works", "page.tsx"),
  website: path.join(process.cwd(), "public", "data", "website-data.json"),
  pages: path.join(process.cwd(), "public", "data", "pages.json"),
  homepage: path.join(process.cwd(), "public", "data", "homepage.json"),
  assets: path.join(process.cwd(), "public", "data", "assets.json"),
  monthly: path.join(process.cwd(), "public", "data", "monthly-menus.json"),
};
const protectedBefore = Object.fromEntries(await Promise.all(Object.entries(protectedSources).map(async ([key, file]) => [key, hash(await readFile(file))])));

const store = { version: 31, updatedAt: "2026-09-01T00:00:00.000Z", pages: [], visualStyle: DEFAULT_WEBSITE_VISUAL_STYLE, systemPages: { future: { retained: true } }, rootData: { retained: true } };
const product = { slug: "coffee-one", name: "咖啡一號", price: 500, stock: 9, listAsset: { url: "/coffee.webp" } };
try {
  await writeFile(dataFiles.pages, `${JSON.stringify(store, null, 2)}\n`);
  await writeFile(dataFiles.website, `${JSON.stringify({ menu: { monthLabel: "九月精選", intro: "九月介紹", products: [product] } }, null, 2)}\n`);
  await writeFile(dataFiles.homepage, "{\"homepageMedia\":\"keep\"}\n");
  await writeFile(dataFiles.assets, `${JSON.stringify({ version: 2, updatedAt: "2026-09-01T00:00:00.000Z", assets: [{ id: "asset-a", category: "page-builder", name: "Hero", usage: "Hero", path: "/uploads/assets/page-builder/hero.webp", recommendedSize: "1600x900", displaySize: "1600x900", format: "webp", alt: "Hero", seoStem: "hero", status: "active" }] }, null, 2)}\n`);
  await writeFile(dataFiles.monthly, "{\"monthlyMedia\":\"keep\"}\n");

  const pagesBeforeGet = await readFile(dataFiles.pages, "utf8");
  const initial = await readWorksPageAdminState();
  check("GET remains write-free", await readFile(dataFiles.pages, "utf8") === pagesBeforeGet);
  check("legacy Hero entrance remains disabled", !initial.resolved.motion.hero.enabled && initial.resolved.motion.hero.preset === "none");
  check("legacy catalog intro remains disabled", !initial.resolved.motion.catalogIntro.enabled && initial.resolved.motion.catalogIntro.preset === "none");
  check("legacy product grid and stagger remain disabled", !initial.resolved.motion.productGrid.enabled && initial.resolved.motion.productGrid.staggerMs === 0);
  check("legacy card hover remains current behavior", initial.resolved.motion.cardHover.enabled && initial.resolved.motion.cardHover.preset === "current-scale");

  const unrelated: WorksPageCmsConfig = { schemaVersion: 1, hero: { headlineLines: ["只改標題", "不要開動畫"] } };
  await saveWorksPageAdminState({ version: 31, works: unrelated, now: new Date("2026-09-01T03:00:00.000Z") });
  const unrelatedStored = JSON.parse(await readFile(dataFiles.pages, "utf8"));
  check("saving an unrelated content field does not persist or enable motion", unrelatedStored.systemPages.works.motion === undefined && !resolveWorksPageCms(unrelatedStored.systemPages.works, { monthLabel: "九月精選", intro: "九月介紹" }).motion.hero.enabled);

  const colors = {
    pageBackground: "#17120f" as const, heroBackground: "coffee" as const, heroText: "ivory" as const, heroSecondaryText: "warm-gray" as const, accent: "gold" as const,
    primaryCtaBackground: "#f1e5d3" as const, primaryCtaText: "ink" as const, catalogBackground: "#f4efe7" as const, catalogText: "#6f6259" as const,
    cardSurface: "white" as const, cardText: "ink" as const, border: "#e1d4c7" as const,
  };
  const colorConfig: WorksPageCmsConfig = { ...unrelated, colors };
  const colorSaved = await saveWorksPageAdminState({ version: 32, works: colorConfig, now: new Date("2026-09-01T03:01:00.000Z") });
  check("all Works color fields persist", Object.keys(colorSaved.resolved.colors).length === 12 && colorSaved.resolved.colors.pageBackground === "#17120f" && colorSaved.resolved.colors.heroBackground === "coffee");
  check("named safe color preset persists", colorSaved.resolved.colors.accent === "gold");
  check("validated six-digit HEX persists", colorSaved.resolved.colors.border === "#e1d4c7");
  let cssRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, colors: { heroBackground: "linear-gradient(red,blue)" } }); } catch { cssRejected = true; }
  check("arbitrary CSS gradients are rejected", cssRejected);
  let functionRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, colors: { heroText: "rgb(1,2,3)" } }); } catch { functionRejected = true; }
  check("CSS functions are rejected", functionRejected);
  let scriptRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, colors: { accent: "javascript:alert(1)" } }); } catch { scriptRejected = true; }
  check("scriptable color values are rejected", scriptRejected);
  check("contrast warning detects poor contrast", hasLowContrast("#ffffff", "#ffffff"));
  check("contrast warning accepts strong contrast", !hasLowContrast("#ffffff", "#000000"));

  const motion = {
    hero: { enabled: true, preset: "fade-up" as const, delayMs: 200, durationMs: 800, distancePx: 18, staggerMs: 100 },
    catalogIntro: { enabled: true, preset: "slide-left" as const, delayMs: 0, durationMs: 700, distancePx: 20, staggerMs: 0 },
    productGrid: { enabled: true, preset: "editorial" as const, delayMs: 100, durationMs: 900, distancePx: 16, staggerMs: 120 },
    cardHover: { enabled: false, preset: "none" as const, durationMs: 400 },
  };
  const motionConfig: WorksPageCmsConfig = { ...colorConfig, motion };
  const motionSaved = await saveWorksPageAdminState({ version: 33, works: motionConfig, now: new Date("2026-09-01T03:02:00.000Z") });
  check("Hero motion persists", motionSaved.resolved.motion.hero.preset === "fade-up" && motionSaved.resolved.motion.hero.delayMs === 200);
  check("catalog intro motion persists", motionSaved.resolved.motion.catalogIntro.preset === "slide-left");
  check("product grid motion persists", motionSaved.resolved.motion.productGrid.preset === "editorial");
  check("card stagger persists", motionSaved.resolved.motion.productGrid.staggerMs === 120);
  check("card hover setting persists", !motionSaved.resolved.motion.cardHover.enabled && motionSaved.resolved.motion.cardHover.preset === "none");
  let motionRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, motion: { hero: { ...motion.hero, preset: "spin-forever" } } }); } catch { motionRejected = true; }
  check("unknown motion preset is rejected", motionRejected);
  let rangeRejected = false;
  try { validateWorksPageCms({ schemaVersion: 1, motion: { hero: { ...motion.hero, durationMs: 99999 } } }); } catch { rangeRejected = true; }
  check("unsafe motion ranges are rejected", rangeRejected);

  let conflict: unknown;
  try { await saveWorksPageAdminState({ version: 33, works: unrelated }); } catch (error) { conflict = error; }
  check("version conflict remains protected", conflict instanceof WorksPageVersionConflictError);
  const finalStore = JSON.parse(await readFile(dataFiles.pages, "utf8"));
  check("conflict preserves latest visual and motion data", finalStore.systemPages.works.motion.hero.preset === "fade-up" && finalStore.systemPages.works.colors.pageBackground === "#17120f");
  check("other system pages remain preserved", finalStore.systemPages.future.retained === true);
  check("other PageStore root fields remain preserved", finalStore.rootData.retained === true && JSON.stringify(finalStore.visualStyle) === JSON.stringify(DEFAULT_WEBSITE_VISUAL_STYLE));

  const managerSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx"), "utf8");
  const visualSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksVisualStylePanel.tsx"), "utf8");
  const motionSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksMotionStudio.tsx"), "utf8");
  const previewSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPagePreview.tsx"), "utf8");
  const worksCmsSource = await readFile(path.join(process.cwd(), "lib", "worksPageCms.ts"), "utf8");
  const cssSource = await readFile(path.join(process.cwd(), "components", "admin", "WorksPageManager.module.css"), "utf8");
  check("J.1D content and Smart Link controls remain", managerSource.includes("首屏內容") && managerSource.includes("作品列表") && managerSource.includes("<SmartLinkPicker"));
  check("J.1D desktop and mobile media controls remain", managerSource.includes("桌機首屏素材") && managerSource.includes("手機首屏素材") && managerSource.includes("<MediaUploader"));
  check("Asset Library remains the canonical image chooser", managerSource.includes("ImageLibraryPicker") && managerSource.includes('/api/admin/pages/images'));
  check("editor has five clear top-level groups", ["內容", "素材", "視覺", "動畫", "預覽"].every((label) => managerSource.includes(`\"${label}\"`)) && managerSource.includes("majorTabs"));
  check("color controls use canonical color presets and native picker", visualSource.includes("VISUAL_COLOR_PRESETS") && visualSource.includes('type="color"') && visualSource.includes("visualColorHex"));
  check("contrast warnings use the canonical calculation", visualSource.includes("hasLowContrast") && visualSource.includes("可讀性提醒"));
  check("motion studio uses canonical motion types", motionSource.includes("HomepageMotionPreset") && motionSource.includes("HomepageSectionMotion"));
  check("animation preview reacts to unsaved motion and can replay", managerSource.includes("preview.motion") && managerSource.includes("replayKey") && previewSource.includes("重新播放"));
  check("color preview reacts to unsaved resolved colors", managerSource.includes("value={preview.colors}") && previewSource.includes("value.colors"));
  check("media preview still reacts to unsaved desktop/mobile media", managerSource.includes("draftHero={draft.hero}") && previewSource.includes("resolveWorksPagePreviewMedia") && worksCmsSource.includes("hero?.mobileMedia || hero?.desktopMedia"));
  check("desktop and mobile preview remain available", previewSource.includes("▰ 桌機") && previewSource.includes("▯ 手機"));
  check("dirty state includes color and motion patch paths", managerSource.includes("JSON.stringify(draft) !== baseline") && managerSource.includes("patchColors") && managerSource.includes("patchMotion"));
  check("desktop uses a sticky two-column preview aid", cssSource.includes("grid-template-columns:minmax(0,1fr) minmax(340px,430px)") && cssSource.includes("position:sticky"));
  check("narrow Admin stacks without horizontal page overflow", cssSource.includes("@media(max-width:900px)") && cssSource.includes(".workspace{grid-template-columns:1fr}"));
  check("preview honors prefers-reduced-motion", cssSource.includes("@media(prefers-reduced-motion:reduce)") && cssSource.includes("animation:none!important"));

  check("isolated Asset Library was not rewritten by Works saves", JSON.parse(await readFile(dataFiles.assets, "utf8")).assets.length === 1);
  check("Product commerce authority remains unchanged", JSON.stringify(JSON.parse(await readFile(dataFiles.website, "utf8")).menu.products[0]) === JSON.stringify(product));
  check("isolated Homepage media remains untouched", await readFile(dataFiles.homepage, "utf8") === "{\"homepageMedia\":\"keep\"}\n");
  const protectedAfter = Object.fromEntries(await Promise.all(Object.entries(protectedSources).map(async ([key, file]) => [key, hash(await readFile(file))])));
  check("public app/works/page.tsx remains byte-identical", protectedAfter.works === protectedBefore.works);
  check("all real runtime files remain byte-identical", ["website", "pages", "homepage", "assets", "monthly"].every((key) => protectedAfter[key] === protectedBefore[key]));

  console.log(`Phase J.1E Works visual and motion studio: ${passed} PASS`);
} finally {
  if (originalDataDir === undefined) delete process.env.KD_DATA_DIR;
  else process.env.KD_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
}
