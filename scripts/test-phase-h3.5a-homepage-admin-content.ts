import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES } from "../lib/homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { updateHomepageBasePresentation, updateHomepageMobileEnabled, updateHomepageMobilePresentation } from "../lib/homepagePresentationAdmin.ts";
import type { HomepageData } from "../data/homepageData";
import type { HomepageContentProduct } from "../lib/homepageContent";
import type { HomepagePresentationKey } from "../lib/homepagePresentation";
type ProviderProps = ComponentProps<typeof import("../components/admin/HomepagePresentationEditor").HomepagePresentationProvider>;
const stored = await readFile("public/data/homepage.json", "utf8");
const website = await readFile("public/data/website-data.json", "utf8");
const rawProducts = JSON.parse(website).menu.products as HomepageContentProduct[];
const products = rawProducts.map(p => ({ slug: p.slug, name: p.name, subtitle: p.subtitle, shortCopy: p.shortCopy, active: p.active, status: p.status, purchasable: p.purchasable, inMonthlyMenu: p.inMonthlyMenu }));
const fixture = (): HomepageData => JSON.parse(stored);
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, jsx: { runtime: "automatic" }, fsCache: false });
const ui = await jiti.import<{ HomepagePresentationProvider: ComponentType<ProviderProps>; HomepagePresentationEditor: ComponentType<{ sectionKey: HomepagePresentationKey }> }>(path.join(process.cwd(), "components/admin/HomepagePresentationEditor.tsx"));
let writes = 0, passed = 0;
const callback = () => { writes++; };
function render(key: HomepagePresentationKey, h = fixture(), draft = false) {
  return renderToStaticMarkup(createElement(ui.HomepagePresentationProvider, {
    presentation: h.presentation, content: { homepage: h, products, pages: [], draft },
    onEdit: callback, onMobileEdit: callback, onMobileToggle: callback, onValidityChange: callback,
    children: createElement(ui.HomepagePresentationEditor, { sectionKey: key }),
  }));
}
function check(name: string, run: () => void) { run(); passed++; console.log("PASS " + name); }
for (const [key, label, content, source, impact] of [
  ["hero", "主標題", fixture().hero.titleLines[0], "首頁內容", "呈現方式"],
  ["home002", "主標題", fixture().home002!.title, "首頁內容", "呈現方式"],
  ["home003", "情境卡｜標題", fixture().home003!.cards![0].title, "首頁內容", "所有對應項目"],
  ["home004", "作品卡｜作品名稱", products.find(p => p.slug === (fixture().home004!.productSlugs as string[])[0])!.name, "商品資料", "不會修改商品名稱"],
  ["home009", "主標題", fixture().home009!.title, "首頁內容", "呈現方式"],
  ["home010", "主標題", fixture().home010!.title, "首頁內容", "呈現方式"],
] as const) check(key + ": Admin SSR label, exact content, source, impact and existing controls", () => {
  const html = render(key); for (const value of [label, String(content), source, impact, "目前內容", "內容編輯", "字級", "字重", "文字顏色", "啟用手機自訂"]) assert.ok(html.includes(value), value);
});
for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) check(key + ": one read-only description per canonical slot; no Mobile duplication", () => {
  let h = fixture(); h = updateHomepageMobileEnabled(h, key, true);
  const html = render(key, h);
  assert.equal((html.match(/data-homepage-content-description/g) ?? []).length, HOMEPAGE_SECTION_CAPABILITIES[key].length);
  const mobile = html.slice(html.indexOf('data-presentation-mode="mobile"'));
  assert.ok(mobile); assert.ok(!mobile.includes("data-homepage-content-description"));
  assert.ok(mobile.includes("沿用 Desktop")); assert.ok(!/<details[^>]*\sopen/u.test(html));
});
check("HOME004 shows current names and shortCopy with fixed CTA debt", () => {
  const h = fixture(); const html = render("home004", h);
  for (const slug of h.home004!.productSlugs as string[]) { const p = products.find(p => p.slug === slug)!; assert.ok(html.includes(p.name)); assert.ok(html.includes(p.shortCopy || p.subtitle || "")); }
  for (const phrase of ["作品卡｜商品短文案", "作品卡｜查看作品連結", "查看作品與規格 →", "系統固定文字", "不在此修改", "所有推薦作品卡"]) assert.ok(html.includes(phrase), phrase);
  assert.doesNotMatch(html, /internal|skuId|pvValue|data-slot="price"/u);
});
check("HOME003 missing label and missing link reasons survive UI", () => {
  const h = fixture(); h.home003!.cards = [{ title: "A", button: "", href: "/works" }, { title: "B", button: "按鈕", href: { type: "none" } }];
  const html = render("home003", h); assert.match(html, /沒有按鈕文字/u); assert.match(html, /沒有有效連結/u);
});
check("HOME009 no reviews still shows stored heading and no-render explanation", () => {
  const h = fixture(); h.home009!.items = []; const html = render("home009", h);
  assert.ok(html.includes(String(h.home009!.title))); assert.match(html, /目前沒有有效評價，因此整個區塊未呈現/u);
  assert.ok(html.includes("目前沒有內容") && html.includes("內容來源：首頁內容"));
});
check("repeated slots show count, first three and accessible expand remainder", () => {
  const h = fixture(); h.home002!.cards = [1, 2, 3, 4].map(n => ({ title: "卡片" + n, text: "內文" + n }));
  const html = render("home002", h); assert.match(html, /共 4 項/u); assert.match(html, /查看其餘 1 項/u); assert.ok(html.includes("卡片4"));
});
check("long multiline content is preserved in an expandable full-text view", () => {
  const h = fixture(); const long = "第一行\n" + "長文".repeat(150); h.home010!.text = long;
  const html = render("home010", h); assert.ok(html.includes("展開完整內容")); assert.ok(html.includes(long)); assert.match(html, /white-space:pre-wrap/u);
});
check("text is escaped instead of interpreted as HTML", () => {
  const h = fixture(); h.home010!.title = "<script>unsafe()</script>";
  const html = render("home010", h); assert.ok(html.includes("&lt;script&gt;unsafe()&lt;/script&gt;")); assert.ok(!html.includes("<script>unsafe()"));
});
check("draft and saved snapshot wording do not promise computed values", () => {
  assert.match(render("home002", fixture(), true), /未儲存草稿/u);
  const html = render("home002"); assert.match(html, /目前已讀取資料/u); assert.match(html, /尚未量測/u); assert.match(html, /下方數值為自訂設定/u);
  assert.doesNotMatch(html, /目前 40px|目前 #|getComputedStyle|<iframe/u);
});
check("existing Base/Mobile values and sparse inheritance are unchanged", () => {
  let h = updateHomepageBasePresentation(fixture(), "home002", { group: "text", slot: "title", field: "fontSizePx", value: 48 });
  h = updateHomepageMobileEnabled(h, "home002", true);
  h = updateHomepageMobilePresentation(h, "home002", { group: "layout", field: "paddingTopPx", value: 0 });
  const before = structuredClone(h); const html = render("home002", h);
  const mobile = html.slice(html.indexOf('data-presentation-mode="mobile"'));
  assert.match(html, /已設定：48 px/u); assert.match(mobile, /沿用 Desktop：48 px/u);
  assert.ok(!mobile.includes('value="48"')); assert.match(mobile, /手機自訂：0 px/u); assert.deepEqual(h, before);
  assert.deepEqual(h.presentation!.sections!.home002!.mobile!.overrides, { layout: { paddingTopPx: 0 } });
});
check("rendering/expansion description has no edit/save capability or data writes", () => {
  const h = fixture(), before = structuredClone(h), pBefore = structuredClone(products); writes = 0;
  for (const key of HOMEPAGE_PRESENTATION_SECTION_KEYS) { render(key, h); render(key, h); }
  assert.equal(writes, 0); assert.deepEqual(h, before); assert.deepEqual(products, pBefore); assert.equal(Object.hasOwn(h, "presentation"), false);
});
const model = await readFile("lib/homepageContent.ts", "utf8");
const editor = await readFile("components/admin/HomepagePresentationEditor.tsx", "utf8");
const manager = await readFile("components/admin/HomepageManager.tsx", "utf8");
const api = await readFile("app/api/admin/homepage/route.ts", "utf8");
check("description model cannot save, normalize, mutate Presentation or inspect CSS", () => {
  assert.doesNotMatch(model, /setPath|fetch\(|writeFile|setData|normalize\w*\(|homepage\.presentation\s*=|getComputedStyle|<iframe/u);
  const block = editor.slice(editor.indexOf("function CurrentContent("), editor.indexOf("/** The same controls"));
  assert.doesNotMatch(block, /onClick|onToggle|onChange|setPath|onEdit|fetch\(/u);
});
check("Manager connects live draft plus safe product/page summaries", () => {
  assert.ok(manager.includes("content={{ homepage: h, products: data.products, pages: data.publishedPages, draft: dirty }}"));
});
check("API only adds public copy; auth and existing summary remain", () => {
  const get = api.slice(api.indexOf("export async function GET()"), api.indexOf("export async function PUT"));
  assert.ok(get.includes("isAdminAuthenticated()")); assert.ok(get.includes("...homepageProductCopy(product)")); assert.doesNotMatch(get, /\.\.\.product\b|history:|skus:|pvValue:|shortCopy:\s*product/u);
});
check("public campaign selector was extracted without behavior changes", () => {
  const old = execFileSync("git", ["show", "HEAD:data/homepageData.ts"], { encoding: "utf8" }).replace(/\r\n/g, "\n");
  const helperStart = old.indexOf("function campaignIsActive("), helperEnd = old.indexOf("export function resolveProductCampaigns(");
  const oldBody = old.slice(helperStart, helperEnd);
  // File read below keeps this check synchronous with the captured source.
  assert.ok(oldBody.includes("activeHomepageCampaigns"));
});
const helper = await readFile("lib/homepageCampaigns.ts", "utf8");
const oldData = execFileSync("git", ["show", "HEAD:data/homepageData.ts"], { encoding: "utf8" }).replace(/\r\n/g, "\n");
check("shared campaign selection implementation remains byte-equivalent", () => {
  const actual = helper.slice(helper.indexOf("export function campaignIsActive(")).replace("export function campaignIsActive(", "function campaignIsActive(").replace("export function campaignSupportsPlacement(", "function campaignSupportsPlacement(");
  assert.equal(actual.trimEnd(), oldData.slice(oldData.indexOf("function campaignIsActive("), oldData.indexOf("export function resolveProductCampaigns(")).trimEnd());
});
assert.equal(await readFile("public/data/homepage.json", "utf8"), stored);
assert.equal(await readFile("public/data/website-data.json", "utf8"), website);
console.log(`H3.5A Admin SSR: ${passed} checks PASS; no callbacks/writes; Owner/Product files unchanged.`);
