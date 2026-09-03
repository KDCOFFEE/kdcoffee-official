import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WEBSITE_VISUAL_STYLE } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveWorksProductListing } from "../lib/productListing.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { resolveListAsset } from "../lib/productVisualAssets.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { readWorksPageAdminState } from "../lib/worksPageAdminStore.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const originalDataDir = process.env.KD_DATA_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-j1f2-works-preview-"));
const storeDir = path.join(root, "store");
await mkdir(storeDir, { recursive: true });
process.env.KD_DATA_DIR = root;

const pagesPath = path.join(storeDir, "pages.json");
const websitePath = path.join(storeDir, "website-data.json");
const assetsPath = path.join(storeDir, "assets.json");
const managerPath = path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx");
const previewPath = path.join(process.cwd(), "components", "admin", "WorksPagePreview.tsx");
const publicWorksPath = path.join(process.cwd(), "app", "works", "page.tsx");

const product = (slug: string, name: string, sort: number, extra: Record<string, unknown> = {}) => ({
  slug, name, artist: `${name} 藝術家`, subtitle: "測試風味", mood: "測試", origin: "測試", process: "測試", roast: "測試",
  flavors: ["花香"], visualTone: "warm", purchase: [], inMonthlyMenu: true, status: "active", sort,
  assets: { artworkCover: { path: `/products/${slug}.webp`, alt: `${name} 列表圖` } },
  ...extra,
});
const canonicalProducts = [
  product("third", "第三件", 30),
  product("hidden", "隱藏作品", 5, { status: "hidden" }),
  product("first", "第一件", 10, { tag: "精選" }),
  product("not-monthly", "非本月", 1, { inMonthlyMenu: false }),
  product("second", "第二件", 20, { assets: {} }),
];

try {
  await writeFile(pagesPath, `${JSON.stringify({ version: 1, updatedAt: "2026-09-02T00:00:00.000Z", pages: [], visualStyle: DEFAULT_WEBSITE_VISUAL_STYLE }, null, 2)}\n`);
  await writeFile(websitePath, `${JSON.stringify({ version: 1, updatedAt: "2026-09-02T00:00:00.000Z", campaign: {}, menu: { monthLabel: "九月精選", title: "", intro: "豆單說明", products: canonicalProducts } }, null, 2)}\n`);
  await writeFile(assetsPath, `${JSON.stringify({ version: 1, updatedAt: "2026-09-02T00:00:00.000Z", assets: [] }, null, 2)}\n`);
  const before = { pages: hash(await readFile(pagesPath)), website: hash(await readFile(websitePath)), assets: hash(await readFile(assetsPath)) };

  const expected = resolveWorksProductListing(canonicalProducts);
  const state = await readWorksPageAdminState();
  check("Admin preview uses the canonical Works listing filter", state.previewProducts.length === expected.length && state.previewProducts.length === 3);
  check("Admin preview order matches the shared canonical sort", state.previewProducts.map((item) => item.slug).join("|") === "first|second|third");
  check("Admin preview keeps canonical product identity and display names", state.previewProducts.map((item) => item.name).join("|") === "第一件|第二件|第三件");
  check("Admin preview list media uses canonical resolution", state.previewProducts[0]?.listMedia?.path === resolveListAsset(expected[0])?.path && state.previewProducts[0]?.listMedia?.alt === "第一件 列表圖");
  check("missing product media remains a safe null fallback", state.previewProducts[1]?.listMedia === null);
  check("preview response contains only presentation summary fields", Object.keys(state.previewProducts[0] || {}).every((key) => ["slug", "name", "artist", "tag", "listMedia"].includes(key)));

  const previewSource = await readFile(previewPath, "utf8");
  const managerSource = await readFile(managerPath, "utf8");
  const publicSource = await readFile(publicWorksPath, "utf8");
  check("hard-coded three-card placeholder source is removed", !previewSource.includes("[0, 1, 2]") && !previewSource.includes("<b>咖啡作品</b>") && previewSource.includes("products.map"));
  check("preview count and empty state derive from canonical products", previewSource.includes("products.length") && previewSource.includes("value.catalog.emptyStateText"));
  check("manager passes read-only preview products to both preview layouts", (managerSource.match(/products=\{payload\.previewProducts\}/gu) || []).length === 2);
  check("public Works and Admin share the exact listing helper", publicSource.includes("resolveWorksProductListing(live.menu.products)") && managerSource.includes("previewProducts"));
  check("Works CMS receives no product authority", !JSON.stringify(state.savedConfig).includes("previewProducts") && !JSON.stringify(state.resolved).includes("previewProducts"));

  const emptyWebsite = JSON.parse(await readFile(websitePath, "utf8"));
  emptyWebsite.menu.products = [];
  await writeFile(websitePath, `${JSON.stringify(emptyWebsite, null, 2)}\n`);
  const emptyState = await readWorksPageAdminState();
  check("zero canonical products returns a safe empty preview list", emptyState.previewProducts.length === 0);

  await writeFile(websitePath, `${JSON.stringify({ ...emptyWebsite, menu: { ...emptyWebsite.menu, products: canonicalProducts } }, null, 2)}\n`);
  const after = { pages: hash(await readFile(pagesPath)), website: hash(await readFile(websitePath)), assets: hash(await readFile(assetsPath)) };
  check("GET preview flow never writes PageStore or Asset data", before.pages === after.pages && before.assets === after.assets);
  check("isolated website fixture returns byte-identical after the test", before.website === after.website);

  console.log(`Phase J.1F.2 Works Admin canonical product preview: ${passed} PASS`);
} finally {
  if (originalDataDir === undefined) delete process.env.KD_DATA_DIR;
  else process.env.KD_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
}
